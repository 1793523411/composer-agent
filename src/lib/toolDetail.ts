/** 从 tool_call 的 args/result 里抽出人类可读的一行摘要（路径、pattern、命令等）。 */

function trunc(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/** tool_call 的 args 有时是 JSON 字符串 */
export function normalizeToolPayload(x: unknown): unknown {
  if (x == null) return undefined;
  if (typeof x === "object") return x;
  if (typeof x === "string") {
    const t = x.trim();
    if (!t) return undefined;
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

const PATH_KEYS = ["path", "file_path", "target_file", "relativeWorkspacePath", "file", "filePath"];

/** 浅层 + 常见嵌套（file / arguments）里找路径 */
export function deepPickPath(args: unknown): string | undefined {
  if (!isRecord(args)) return undefined;
  const direct = pickStr(args, PATH_KEYS);
  if (direct) return direct;
  const file = args.file;
  if (isRecord(file)) {
    const p = pickStr(file, PATH_KEYS);
    if (p) return p;
  }
  const inner = args.arguments ?? args.input;
  if (isRecord(inner)) {
    const p = pickStr(inner, PATH_KEYS);
    if (p) return p;
    if (isRecord(inner.file)) {
      const fp = pickStr(inner.file, PATH_KEYS);
      if (fp) return fp;
    }
  }
  return undefined;
}

/** 兜底：在嵌套对象里找看起来像路径的第一个短字符串 */
function firstPathLikeString(o: unknown, depth = 0): string | undefined {
  if (depth > 5 || !isRecord(o)) return undefined;
  for (const [k, v] of Object.entries(o)) {
    const key = k.toLowerCase();
    if (typeof v === "string" && v.length > 0 && v.length < 512) {
      const looksPath = v.includes("/") || (v.includes(".") && key.includes("file"));
      const keyHintsPath = key.includes("path") || key === "file" || key === "target";
      if (looksPath || keyHintsPath) return v.trim();
    }
    if (isRecord(v)) {
      const s = firstPathLikeString(v, depth + 1);
      if (s) return s;
    }
  }
  return undefined;
}

export function toolCallSummary(
  toolName: string,
  args: unknown,
  result: unknown,
  maxLen: number,
): string {
  const aIn = normalizeToolPayload(args);
  const rIn = normalizeToolPayload(result);
  const n = toolName.toLowerCase();
  const a = isRecord(aIn) ? aIn : null;
  const r = isRecord(rIn) ? rIn : null;

  const pathKeys = PATH_KEYS;

  if (a) {
    if (n === "read" || n === "read_file") {
      const p = deepPickPath(a) ?? pickStr(a, pathKeys);
      if (p) return trunc(p, maxLen);
    }
    if (n === "glob" || n === "glob_file_search") {
      const p = pickStr(a, ["glob_pattern", "pattern", "globPattern", "include"]);
      if (p) return trunc(p, maxLen);
    }
    if (n === "grep" || n === "ripgrep" || n === "codebase_search") {
      const pat = pickStr(a, ["pattern", "query", "search_string"]);
      const dir = pickStr(a, ["path", "target_directory", "glob"]);
      if (pat && dir) return trunc(`${pat} @ ${dir}`, maxLen);
      if (pat) return trunc(pat, maxLen);
    }
    if (n === "sem_search" || n === "semantic_search") {
      const q = pickStr(a, ["query", "pattern"]);
      if (q) return trunc(q, maxLen);
    }
    if (n === "write") {
      const p = deepPickPath(a) ?? pickStr(a, pathKeys);
      if (p) return trunc(p, maxLen);
    }
    if (n === "shell" || n === "bash" || n === "run_terminal_cmd" || n === "terminal") {
      const c = pickStr(a, ["command", "cmd", "script"]);
      if (c) return trunc(c.replace(/\s+/g, " "), maxLen);
    }
    if (n === "ls" || n === "list_dir") {
      const p = pickStr(a, ["path", "target_directory"]);
      if (p) return trunc(p, maxLen);
    }
    if (n === "edit" || n === "search_replace" || n === "edit_file" || n === "str_replace") {
      const p = deepPickPath(a) ?? pickStr(a, pathKeys);
      if (p) return trunc(p, maxLen);
    }
    if (n === "delete_file" || n === "delete") {
      const p = deepPickPath(a) ?? pickStr(a, pathKeys);
      if (p) return trunc(p, maxLen);
    }
    if (n === "mcp") {
      const tool = pickStr(a, ["tool", "toolName", "name"]);
      const srv = pickStr(a, ["server", "serverName"]);
      if (tool && srv) return trunc(`${srv}/${tool}`, maxLen);
      if (tool) return trunc(tool, maxLen);
    }
  }

  if (r) {
    const fromR = pickStr(r, pathKeys);
    if (fromR) return trunc(fromR, maxLen);
    if (n === "glob" && Array.isArray(r.files)) {
      const first = r.files[0];
      if (typeof first === "string") return trunc(`${first} (+${r.files.length})`, maxLen);
    }
    const matches = r.matches;
    if (n === "glob" && Array.isArray(matches) && typeof matches[0] === "string") {
      return trunc(String(matches[0]), maxLen);
    }
  }

  if (a) {
    if (
      n === "read" ||
      n === "read_file" ||
      n === "write" ||
      n === "edit" ||
      n === "glob"
    ) {
      const guess = firstPathLikeString(a);
      if (guess) return trunc(guess, maxLen);
    }
  }

  return "";
}

/** 流式 onDelta：尽量提早拿到 path（partial-tool-call / tool-call-started） */
export function extractEarlyToolUpdate(
  update: unknown,
): { callId: string; name: string; args: unknown } | null {
  if (!isRecord(update)) return null;
  const typ = update.type;
  if (typ !== "partial-tool-call" && typ !== "tool-call-started") return null;
  const callId = String(
    update.toolCallId ??
      update.tool_call_id ??
      update.call_id ??
      update.callId ??
      (typeof update.id === "string" ? update.id : ""),
  ).trim();
  if (!callId) return null;
  const name = String(
    update.toolName ?? update.tool_name ?? update.name ?? "tool",
  ).trim();
  const args =
    update.partialArgs ??
    update.partial_input ??
    update.partialJson ??
    update.args ??
    update.input ??
    update.arguments;
  return { callId, name: name || "tool", args };
}
