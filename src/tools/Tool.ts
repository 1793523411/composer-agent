import { z, type ZodType } from "zod";

/**
 * 工具执行上下文，由 Agent Loop 注入
 */
export interface ToolContext {
  /** 当前工作目录 */
  cwd: string;
  /** 终端列宽（用于格式化输出） */
  columns: number;
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 是否成功 */
  ok: boolean;
  /** 输出内容（文本） */
  output: string;
}

/**
 * 工具定义接口 — 每个本地工具都需要实现此接口
 */
export interface Tool<TInput = unknown> {
  /** 工具唯一名称（snake_case） */
  name: string;
  /** 工具描述（给 LLM 看的） */
  description: string;
  /** 参数 schema（用 zod 定义，可自动生成 JSON Schema） */
  inputSchema: ZodType<TInput>;
  /** 是否为只读操作（不修改文件系统） */
  isReadOnly?: boolean;
  /** 是否可安全并发执行 */
  isConcurrencySafe?: boolean;
  /** 工具自定义权限检查（可选） */
  checkPermissions?(input: TInput, ctx: ToolContext): Promise<PermissionDecision | null>;
  /** 执行函数 */
  execute(input: TInput, ctx: ToolContext): Promise<ToolResult>;
}

/**
 * 权限决策结果
 */
export interface PermissionDecision {
  /** allow=直接执行, ask=需用户确认, deny=拒绝 */
  behavior: "allow" | "ask" | "deny";
  /** 原因说明 */
  reason: string;
}

/**
 * 定义一个工具的便捷工厂函数
 */
export function defineTool<T>(opts: Tool<T>): Tool<T> {
  return opts;
}
