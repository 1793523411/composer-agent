import type { Tool } from "./Tool.js";
import { readFileTool } from "./readFile.js";
import { applyPatchTool } from "./applyPatch.js";
import { writeFileTool } from "./writeFile.js";
import { editFileTool } from "./editFile.js";
import { bashTool } from "./bash.js";
import { globSearchTool } from "./globSearch.js";
import { grepSearchTool } from "./grepSearch.js";
import { listFilesTool } from "./listFiles.js";
import { searchReplaceTool } from "./searchReplace.js";
import { agentTool } from "./agentTool.js";

/**
 * 工具注册表 — 所有本地工具在此注册
 * 后续添加工具时只需 import 并 push 到此数组
 */
export const toolRegistry: Tool[] = [
  readFileTool,
  applyPatchTool,
  writeFileTool,
  editFileTool,
  bashTool,
  globSearchTool,
  grepSearchTool,
  listFilesTool,
  searchReplaceTool,
  agentTool,
];

/** 按名称查找工具 */
export function findTool(name: string): Tool | undefined {
  return toolRegistry.find((t) => t.name === name);
}

/** 获取所有工具名称 */
export function listToolNames(): string[] {
  return toolRegistry.map((t) => t.name);
}

export { type Tool, type ToolContext, type ToolResult, defineTool } from "./Tool.js";
