import { z } from "zod";
import { Agent } from "@cursor/sdk";
import { defineTool } from "./Tool.js";

/**
 * sub_agent 工具 — 创建子 Agent 执行独立任务
 * 复用相同的 mcpServers 配置，超时 5 分钟
 */
export const agentTool = defineTool({
  name: "sub_agent",
  description:
    "Launch a sub-agent to perform an independent task. " +
    "The sub-agent has access to the same tools and returns its final text output.",
  inputSchema: z.object({
    description: z.string().describe("Short description of the task (for logging/display)"),
    prompt: z.string().describe("The detailed prompt/instruction for the sub-agent"),
  }),
  isReadOnly: false,
  isConcurrencySafe: true,

  async execute(input, ctx) {
    // 防止递归调用
    if (process.env.IS_SUB_AGENT === "1") {
      return { ok: false, output: "Sub-agents cannot spawn nested sub-agents" };
    }

    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) {
      return { ok: false, output: "Missing CURSOR_API_KEY environment variable" };
    }

    const permissionMode = process.env.TOOL_PERMISSION_MODE || "default";

    const agent = await Agent.create({
      apiKey,
      model: { id: process.env.CURSOR_MODEL || "claude-sonnet" },
      local: { cwd: ctx.cwd },
      mcpServers: {
        "composer-tools": {
          command: "npx",
          args: ["tsx", new URL("../mcp-server.ts", import.meta.url).pathname],
          env: {
            TOOL_CWD: ctx.cwd,
            TOOL_COLUMNS: String(ctx.columns),
            TOOL_PERMISSION_MODE: permissionMode,
            IS_SUB_AGENT: "1",
          },
        },
      },
    });

    try {
      const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
      let result = "";

      const runPromise = (async () => {
        const run = await agent.send(input.prompt);
        for await (const event of run.stream()) {
          if (event.type === "assistant") {
            for (const block of event.message.content) {
              if (block.type === "text") {
                result += block.text;
              }
            }
          }
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Sub-agent timed out after 5 minutes")), TIMEOUT_MS),
      );

      await Promise.race([runPromise, timeoutPromise]);

      return { ok: true, output: result || "(sub-agent produced no output)" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, output: `Sub-agent error: ${msg}` };
    } finally {
      await agent[Symbol.asyncDispose]();
    }
  },
});
