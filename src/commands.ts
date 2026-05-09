/**
 * 斜杠命令系统
 */
import { execFile } from "node:child_process";

// ─── 类型定义 ───────────────────────────────────────────────

export interface SlashCommand {
  name: string;
  description: string;
  execute: (args: string) => CommandResult;
}

export interface CommandResult {
  type: "message" | "action";
  /** 展示给用户的文本 */
  text?: string;
  /** 需要上层处理的动作标识 */
  action?: "clear" | "compact" | "model" | "exit";
  /** action 附带参数 */
  payload?: string;
}

// ─── 命令列表 ───────────────────────────────────────────────

const commands: SlashCommand[] = [
  {
    name: "help",
    description: "显示可用命令列表",
    execute: () => {
      const lines = commands.map((c) => `  /${c.name} — ${c.description}`);
      return { type: "message", text: "可用命令:\n" + lines.join("\n") };
    },
  },
  {
    name: "clear",
    description: "清空当前对话历史",
    execute: () => ({ type: "action", action: "clear", text: "对话已清空。" }),
  },
  {
    name: "compact",
    description: "压缩上下文（保留摘要）",
    execute: () => ({ type: "action", action: "compact", text: "上下文已压缩。" }),
  },
  {
    name: "model",
    description: "切换模型（用法: /model <name>）",
    execute: (args) => {
      const model = args.trim();
      if (!model) {
        return { type: "message", text: "用法: /model <model_name>" };
      }
      return { type: "action", action: "model", payload: model, text: `模型已切换为: ${model}` };
    },
  },
  {
    name: "exit",
    description: "退出程序",
    execute: () => ({ type: "action", action: "exit", text: "再见！" }),
  },
];

// ─── 帮助文本常量 ───────────────────────────────────────────

export const SLASH_HELP: string = [
  "快捷键:",
  "  Ctrl+O — 展开/收起 transcript 里的工具详情",
  "",
  "可用命令:",
  ...commands.map((c) => `  /${c.name} — ${c.description}`),
].join("\n");

/** 获取所有命令名称和描述（用于补全建议） */
export function getSlashCommands(): { name: string; description: string }[] {
  return [
    ...commands.map((c) => ({ name: c.name, description: c.description })),
    { name: "cwd", description: "显示当前工作目录" },
    { name: "think", description: "显示或隐藏 thinking 过程" },
    { name: "quit", description: "退出程序" },
  ];
}

// ─── 解析/执行 ─────────────────────────────────────────────

export function parseSlashCommand(input: string): { command: SlashCommand; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const spaceIdx = trimmed.indexOf(" ");
  const name = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);

  const cmd = commands.find((c) => c.name === name);
  if (!cmd) return null;

  return { command: cmd, args };
}

export function executeSlashCommand(input: string): CommandResult | null {
  const parsed = parseSlashCommand(input);
  if (!parsed) return null;
  return parsed.command.execute(parsed.args);
}

// ─── handleSlashCommand（回调模式，供 app.tsx 使用）──────────

export interface SlashHandlers {
  help: () => void;
  clear: () => void;
  exit: () => void;
  cwd: () => void;
  model: () => void;
  compact: (keep: number) => void;
  thinkToggle: () => void;
}

export function handleSlashCommand(
  input: string,
  handlers: SlashHandlers,
): { type: "handled" | "unknown"; name: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const spaceIdx = trimmed.indexOf(" ");
  const name = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);

  switch (name) {
    case "help":
      handlers.help();
      return { type: "handled", name };
    case "clear":
      handlers.clear();
      return { type: "handled", name };
    case "exit":
    case "quit":
      handlers.exit();
      return { type: "handled", name };
    case "cwd":
      handlers.cwd();
      return { type: "handled", name };
    case "model":
      handlers.model();
      return { type: "handled", name };
    case "compact": {
      const keep = parseInt(args, 10) || 20;
      handlers.compact(keep);
      return { type: "handled", name };
    }
    case "think":
      handlers.thinkToggle();
      return { type: "handled", name };
    default:
      return { type: "unknown", name };
  }
}

// ─── Bang commands (!shell) ─────────────────────────────────

export function isBangCommand(input: string): boolean {
  return input.trimStart().startsWith("!");
}

export function stripBang(input: string): string {
  return input.trimStart().slice(1).trim();
}

export interface BangResult {
  ok: boolean;
  out: string;
}

export function runBangCommand(cwd: string, cmd: string): Promise<BangResult> {
  return new Promise((resolve) => {
    execFile("sh", ["-c", cmd], { cwd, timeout: 30_000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const output = (stderr || stdout || (err as Error).message).trim();
        resolve({ ok: false, out: output || "命令执行失败" });
      } else {
        resolve({ ok: true, out: (stdout + stderr).trim() });
      }
    });
  });
}
