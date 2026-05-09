#!/usr/bin/env node
/**
 * MCP Server — 将 toolRegistry 暴露为 stdio MCP 服务
 * 由 @cursor/sdk Agent 通过 mcpServers 配置启动
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { toolRegistry, type ToolContext } from "./tools/index.js";
import { hasPermissionsToUseTool, setPermissionMode, type PermissionMode } from "./permissions.js";
import { requestPermission } from "./permission-ipc.js";

// 从环境变量获取 cwd（由父进程传入）
const cwd = process.env.TOOL_CWD || process.cwd();
const columns = parseInt(process.env.TOOL_COLUMNS || "80", 10);
const permissionPort = parseInt(process.env.TOOL_PERMISSION_PORT || "0", 10);
const ctx: ToolContext = { cwd, columns };
const allowedTools = new Set(
  (process.env.TOOL_ALLOWED_TOOLS || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);

// 从环境变量读取权限模式（由父进程传入）
const permMode = (process.env.TOOL_PERMISSION_MODE || "default") as PermissionMode;
setPermissionMode(permMode);

const server = new McpServer({
  name: "composer-agent-tools",
  version: "0.1.0",
});

const registeredTools = allowedTools.size > 0
  ? toolRegistry.filter((tool) => allowedTools.has(tool.name))
  : toolRegistry;

if (allowedTools.size > 0) {
  const registeredNames = new Set(registeredTools.map((tool) => tool.name));
  const unknown = [...allowedTools].filter((name) => !registeredNames.has(name));
  if (unknown.length > 0) {
    process.stderr.write(`[tools] ignoring unknown allowed tools: ${unknown.join(", ")}\n`);
  }
}

// 将 toolRegistry 中的每个工具注册为 MCP tool
for (const tool of registeredTools) {
  // 从 zod schema 提取 raw shape 用于 MCP 注册
  const shape = (tool.inputSchema as z.ZodObject<z.ZodRawShape>).shape;

  server.tool(
    tool.name,
    tool.description,
    shape,
    async (args) => {
      // 先用 zod 验证输入
      const parsed = tool.inputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          content: [
            { type: "text" as const, text: `参数验证失败: ${parsed.error.message}` },
          ],
          isError: true,
        };
      }

      // 权限检查
      const perm = await hasPermissionsToUseTool(tool, parsed.data, ctx);
      if (perm.behavior === "deny") {
        return {
          content: [
            { type: "text" as const, text: `权限拒绝: ${perm.reason}` },
          ],
          isError: true,
        };
      }
      if (perm.behavior === "ask") {
        if (permissionPort > 0) {
          // 通过 IPC 请求父进程确认
          const resp = await requestPermission(permissionPort, {
            toolName: tool.name,
            description: perm.reason,
          });
          if (resp.decision === "deny") {
            return {
              content: [
                { type: "text" as const, text: `用户拒绝: ${tool.name}` },
              ],
              isError: true,
            };
          }
          // allow / always_allow → 继续执行
        } else {
          // 无 IPC 端口时 fallback 自动放行
          process.stderr.write(`[permission] auto-allowing "${tool.name}": ${perm.reason}\n`);
        }
      }

      const result = await tool.execute(parsed.data, ctx);

      return {
        content: [{ type: "text" as const, text: result.output }],
        isError: !result.ok,
      };
    },
  );
}

// 启动 stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
