/**
 * 权限系统 — 控制工具执行前的权限校验逻辑
 */
import type { Tool, ToolContext, PermissionDecision } from "./tools/Tool.js";

/**
 * 权限模式：
 * - default: 正常模式，只读工具自动放行，写操作 ask
 * - bypass: 全部放行（调试/信任场景）
 * - plan: 规划模式，仅允许只读工具
 */
export type PermissionMode = "default" | "bypass" | "plan";

// 全局模式状态
let currentMode: PermissionMode = "default";

export function setPermissionMode(mode: PermissionMode): void {
  currentMode = mode;
}

export function getPermissionMode(): PermissionMode {
  return currentMode;
}

/**
 * 判断当前工具调用是否有权执行
 */
export async function hasPermissionsToUseTool(
  tool: Tool,
  input: unknown,
  context: ToolContext,
): Promise<PermissionDecision> {
  // bypass 模式：全部允许
  if (currentMode === "bypass") {
    return { behavior: "allow", reason: "bypass mode" };
  }

  // plan 模式：仅允许只读工具
  if (currentMode === "plan") {
    if (tool.isReadOnly) {
      return { behavior: "allow", reason: "read-only tool in plan mode" };
    }
    return { behavior: "deny", reason: "non-read-only tool blocked in plan mode" };
  }

  // default 模式：只读工具自动放行
  if (tool.isReadOnly) {
    return { behavior: "allow", reason: "read-only tool" };
  }

  // 工具自定义权限检查
  if (tool.checkPermissions) {
    const decision = await tool.checkPermissions(input, context);
    if (decision) {
      return decision;
    }
  }

  // 默认需要用户确认
  return { behavior: "ask", reason: "requires user confirmation" };
}
