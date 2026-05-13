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

const extraSlashCommands: { name: string; description: string }[] = [
  { name: "cwd", description: "显示当前工作目录" },
  { name: "think", description: "显示或隐藏 thinking 过程" },
  { name: "quit", description: "退出程序" },
];

// ─── 帮助文本常量 ───────────────────────────────────────────

export const SLASH_HELP: string = [
  "快捷键:",
  "  Ctrl+O — 展开/收起 transcript 里的工具详情",
  "",
  "输入:",
  "  Agent 工作中也可以继续输入，消息会排队到当前回合结束后发送",
  "  图片用 @/path/to/image.png 附加；路径有空格时用 @\"/path with spaces.png\"",
  "",
  "可用命令:",
  ...[
    ...commands.map((c) => ({ name: c.name, description: c.description })),
    ...extraSlashCommands,
  ].map((c) => `  /${c.name} — ${c.description}`),
].join("\n");

/** 获取所有命令名称和描述（用于补全建议） */
export function getSlashCommands(): { name: string; description: string }[] {
  return [
    ...commands.map((c) => ({ name: c.name, description: c.description })),
    ...extraSlashCommands,
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
  model: (nextModel?: string) => void;
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
      handlers.model(args.trim() || undefined);
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

const SOURCE_VIEW_COMMANDS = new Set(["bat", "cat", "head", "less", "sed", "tail"]);
const SOURCE_VIEW_LINE_LIMIT = 14;
const BANG_OUTPUT_LINE_LIMIT = 24;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  cjs: "js",
  css: "css",
  html: "html",
  js: "js",
  json: "json",
  jsonc: "json",
  jsx: "jsx",
  md: "md",
  mjs: "js",
  sh: "sh",
  ts: "ts",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
};

export function formatBangOutputForDisplay(cmd: string, output: string): string {
  if (!output.trim() || output.includes("```")) return output;

  const language = inferSourceViewLanguage(cmd);
  const displayOutput = limitOutputLines(output, language ? SOURCE_VIEW_LINE_LIMIT : BANG_OUTPUT_LINE_LIMIT);
  if (!language) return displayOutput;

  return [`\`\`\`${language}`, displayOutput, "```"].join("\n");
}

function inferSourceViewLanguage(cmd: string): string {
  if (!isSourceViewCommand(cmd)) return "";

  const path = sourcePathFromCommand(cmd);
  if (!path) return "";

  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXTENSION[extension] ?? "";
}

function isSourceViewCommand(cmd: string): boolean {
  const match = cmd.trim().match(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*([^\s]+)/);
  if (!match?.[1]) return false;

  const commandName = match[1].split(/[\\/]/).pop() ?? match[1];
  return SOURCE_VIEW_COMMANDS.has(commandName);
}

function sourcePathFromCommand(cmd: string): string {
  const extensions = Object.keys(LANGUAGE_BY_EXTENSION).join("|");
  const pathPattern = new RegExp(`(?:^|\\s|['"])([^\\s'"]+\\.(${extensions}))(?:$|\\s|['"])`, "gi");
  let path = "";

  for (const match of cmd.matchAll(pathPattern)) {
    path = match[1] ?? path;
  }

  return path;
}

function limitOutputLines(output: string, limit: number): string {
  const lines = output.split("\n");
  if (lines.length <= limit) return output;

  return [
    ...lines.slice(0, limit),
    `... ${lines.length - limit} more lines`,
  ].join("\n");
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
