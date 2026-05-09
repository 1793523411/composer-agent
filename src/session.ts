/**
 * 会话持久化 — 保存/恢复对话历史到 .composer/sessions/
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { redactSensitiveText } from "./security.js";

export interface SessionMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
}

export interface Session {
  id: string;
  createdAt: number;
  messages: SessionMessage[];
}

function sessionsDir(cwd: string): string {
  return resolve(cwd, ".composer", "sessions");
}

/**
 * 保存会话到 .composer/sessions/<id>.json
 */
export function saveSession(cwd: string, session: Session): void {
  const dir = sessionsDir(cwd);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${session.id}.json`);
  const redactedSession: Session = {
    ...session,
    messages: session.messages.map((message) => ({
      ...message,
      content: redactSensitiveText(message.content),
    })),
  };
  writeFileSync(filePath, JSON.stringify(redactedSession, null, 2), "utf-8");
}

/**
 * 加载最近的会话（按文件修改时间倒序取第一个）
 */
export function loadLastSession(cwd: string): Session | null {
  const dir = sessionsDir(cwd);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return null;
  }

  if (files.length === 0) return null;

  // 按文件名排序（id 含时间戳前缀）取最新
  files.sort().reverse();
  const filePath = join(dir, files[0]!);
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/**
 * 生成会话 ID（时间戳 + 随机后缀）
 */
export function createSessionId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}
