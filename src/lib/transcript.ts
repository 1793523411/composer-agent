export type TranscriptItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "system"; id: string; text: string }
  | { kind: "thinking"; id: string; text: string }
  | {
      kind: "tool";
      id: string;
      callId: string;
      name: string;
      status: "running" | "completed" | "error";
      /** 例如 read 时的相对路径 */
      detail?: string;
      /** 工具输入参数 */
      args?: Record<string, unknown>;
      /** 工具输出结果 */
      result?: string;
    }
  | { kind: "assistant"; id: string; text: string };

export function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function truncatePath(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = Math.floor(max * 0.55);
  const tail = max - head - 1;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
