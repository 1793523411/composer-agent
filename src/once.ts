import { Agent, type Run } from "@cursor/sdk";
import type { ParsedArgs } from "./args.js";
import { getConfig, loadConfig } from "./config.js";

async function streamRunToStdout(run: Run) {
  for await (const event of run.stream()) {
    switch (event.type) {
      case "assistant":
        for (const block of event.message.content) {
          if (block.type === "text") process.stdout.write(block.text);
        }
        break;
      case "thinking":
        process.stderr.write(`\n[thinking] ${event.text}\n`);
        break;
      case "tool_call":
        process.stderr.write(`\n[tool] ${event.name} → ${event.status}\n`);
        break;
      case "status":
        process.stderr.write(`\n[status] ${event.status}\n`);
        break;
      default:
        break;
    }
  }
  process.stdout.write("\n");
}

export async function runOnceCli(parsed: ParsedArgs) {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error("缺少 CURSOR_API_KEY。在项目根创建 .env 或 export 设置。");
    process.exitCode = 1;
    return;
  }

  loadConfig(parsed.cwd);
  const config = getConfig();
  const stdinText = process.stdin.isTTY ? "" : await readStdin();
  const text = [parsed.positional.join(" ").trim(), stdinText].filter(Boolean).join("\n\n").trim();
  if (!text) {
    console.error("用法：npm run once -- <你的提示>  或通过 stdin 管道输入");
    process.exitCode = 1;
    return;
  }

  const messageText = config.systemPrompt
    ? `[System: ${config.systemPrompt}]\n\n${text}`
    : text;
  const allowedToolsKey = parsed.allowedTools.join(",");

  const agent = await Agent.create({
    apiKey,
    model: { id: parsed.model },
    local: { cwd: parsed.cwd },
    mcpServers: {
      "composer-tools": {
        command: "npx",
        args: ["tsx", new URL("./mcp-server.ts", import.meta.url).pathname],
        env: {
          TOOL_CWD: parsed.cwd,
          TOOL_COLUMNS: String(process.stdout.columns ?? 80),
          TOOL_PERMISSION_MODE: parsed.permissionMode ?? config.permissionMode ?? "default",
          ...(allowedToolsKey ? { TOOL_ALLOWED_TOOLS: allowedToolsKey } : {}),
        },
      },
    },
  });

  try {
    const run = await agent.send(messageText);
    await streamRunToStdout(run);
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}
