import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { MarkdownText } from "./MarkdownText.js";

const TOOL_DOT = "\u25CF";
const SPINNER_FRAMES = ["\u00B7", "\u2722", "\u2733", "\u2736", "\u273B", "\u273D", "\u273B", "\u2736", "\u2733", "\u2722"];
const TOOL_CHILD = "\u23BF";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function useSpinner(active: boolean, interval = 120): number {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) {
      setIdx(0);
      return;
    }
    const id = setInterval(() => setIdx((i) => (i + 1) % SPINNER_FRAMES.length), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return idx;
}

export interface ToolUseDisplayProps {
  toolName: string;
  status: "running" | "done" | "error";
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  expanded?: boolean;
  columns?: number;
}

function formatInputInline(input: Record<string, unknown>): string {
  const PRIMARY_KEYS = ["path", "file_path", "filePath", "pattern", "command", "query", "url"];
  for (const key of PRIMARY_KEYS) {
    if (key in input && input[key] != null) {
      const raw = input[key];
      const val = typeof raw === "string" ? raw : JSON.stringify(raw);
      return val.length > 60 ? val.slice(0, 57) + "\u2026" : val;
    }
  }
  // fallback: first short string-valued key
  for (const [, v] of Object.entries(input)) {
    if (typeof v === "string" && v.length > 0 && v.length <= 60) {
      return v;
    }
  }
  return "";
}

function formatResultSummary(toolName: string, output: string): string {
  if (!output.trim()) return "(no output)";

  try {
    const parsed = JSON.parse(output) as { summary?: unknown; type?: unknown };
    if (typeof parsed.summary === "string") return parsed.summary;
    if (typeof parsed.type === "string") return parsed.type;
  } catch {
    // Plain text output is the common path.
  }

  const lines = readableLines(output);
  const lineCount = lines.length;
  const name = toolName.toLowerCase();

  // read tool: show line count
  if (name === "read" || name === "read_file") {
    return `${lineCount} lines`;
  }

  // glob/find/list: show file count
  if (name === "glob" || name === "find_files" || name === "list_files") {
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    return nonEmpty.length > 0 ? `Found ${nonEmpty.length} files` : "No matches";
  }

  // grep/search/ripgrep: count matches
  if (name === "grep" || name === "search" || name === "ripgrep") {
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    return nonEmpty.length > 0 ? `${nonEmpty.length} results` : "No matches";
  }

  // edit: applied changes
  if (name === "edit" || name === "edit_file") {
    return "Applied changes";
  }

  if (name === "apply_patch") {
    return "Patch applied";
  }

  // write: done
  if (name === "write" || name === "write_file") {
    return "Done";
  }

  // command execution: first line truncated
  if (name === "runcommand" || name === "execute" || name === "run_command" || name === "bash") {
    const first = lines[0] ?? "Done";
    return first.length > 80 ? first.slice(0, 77) + "\u2026" : first;
  }

  // Default: first line truncated to 80 chars
  const first = lines[0] ?? "Done";
  return first.length > 80 ? first.slice(0, 77) + "\u2026" : first;
}

function displayToolName(toolName: string): string {
  const known: Record<string, string> = {
    read_file: "Read",
    write_file: "Write",
    edit_file: "Edit",
    apply_patch: "Patch",
    search_replace: "Replace",
    list_files: "List",
    glob: "Glob",
    grep: "Grep",
    bash: "Bash",
    sub_agent: "Agent",
  };
  return known[toolName] ?? toolName;
}

function parseJsonish(value: string): unknown | undefined {
  const trimmed = value.trim();
  if (!trimmed || !"[{\"".includes(trimmed[0]!)) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function collectReadableBlocks(value: unknown, depth = 0, allowMetadataSummary = true): string[] {
  if (value == null || depth > 5) return [];

  if (typeof value === "string") {
    const parsed = parseJsonish(value);
    if (parsed !== undefined) {
      const nested = collectReadableBlocks(parsed, depth + 1, false);
      if (nested.length > 0) return nested;
    }
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectReadableBlocks(item, depth + 1, allowMetadataSummary));
  }

  if (!isRecord(value)) {
    return [String(value)];
  }

  const directKeys = ["content", "text", "output", "stdout", "stderr", "message", "value", "data", "result"];
  for (const key of directKeys) {
    const nested = collectReadableBlocks(value[key], depth + 1, allowMetadataSummary);
    if (nested.length > 0) return nested;
  }

  if (allowMetadataSummary) {
    if (typeof value.summary === "string") return [value.summary];
    if (typeof value.type === "string") return [value.type];
  }

  return [];
}

function readableLines(value: string): string[] {
  const parsed = parseJsonish(value);
  const blocks = parsed === undefined
    ? collectReadableBlocks(value)
    : collectReadableBlocks(parsed);

  if (blocks.length > 0) {
    return blocks.flatMap((block, index) => {
      const lines = block.replace(/\r\n/g, "\n").split("\n");
      return index === 0 ? lines : ["", ...lines];
    });
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return JSON.stringify(parsed, null, 2).split("\n");
  } catch {
    return value.split("\n");
  }
}

function expandedLineLimit(toolName: string): number {
  const name = toolName.toLowerCase();
  if (name === "read" || name === "read_file") return 10;
  if (name === "grep" || name === "search" || name === "ripgrep") return 18;
  if (name === "glob" || name === "find_files" || name === "list_files") return 24;
  if (name === "bash" || name === "run_command" || name === "execute") return 24;
  return 14;
}

function formatExpandedText(toolName: string, value: string): string[] {
  if (!value.trim()) return [];

  const lines = readableLines(value);
  const limit = expandedLineLimit(toolName);
  if (lines.length <= limit) return lines;

  return [
    ...lines.slice(0, limit),
    `... ${lines.length - limit} more lines`,
  ];
}

function isReadTool(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === "read" || name === "read_file";
}

function inputPath(input: Record<string, unknown> | undefined): string {
  if (!input) return "";

  for (const key of ["path", "file_path", "filePath"]) {
    const value = input[key];
    if (typeof value === "string") return value;
  }

  return "";
}

function inferLanguageFromPath(path: string): string {
  const filename = path.split(/[\\/]/).pop() ?? path;
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const languagesByExtension: Record<string, string> = {
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

  return languagesByExtension[extension] ?? "";
}

function formatExpandedMarkdown(toolName: string, input: Record<string, unknown> | undefined, lines: string[]): string {
  if (!isReadTool(toolName)) return lines.join("\n");

  const language = inferLanguageFromPath(inputPath(input));
  return [`\`\`\`${language}`, ...lines, "```"].join("\n");
}

export function ToolUseDisplay({
  toolName,
  status,
  input,
  output,
  error,
  expanded = false,
  columns = 80,
}: ToolUseDisplayProps) {
  const dotColor = status === "done" ? "gray" : status === "error" ? "red" : "cyan";
  const spinnerIdx = useSpinner(status === "running");
  const inputSummary = input && Object.keys(input).length > 0 ? formatInputInline(input) : null;
  const label = displayToolName(toolName);
  const expandedOutput = expanded && status === "done" && output ? formatExpandedText(toolName, output) : [];
  const expandedError = expanded && status === "error" && error ? formatExpandedText(toolName, error) : [];
  const expandedOutputText = expandedOutput.length > 0
    ? formatExpandedMarkdown(toolName, input, expandedOutput)
    : "";
  const detailColumns = Math.max(20, columns - 5);

  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status, startTime]);

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="nowrap">
        <Box minWidth={3} flexShrink={0}>
          <Text color={dotColor}>
            {status === "running" ? SPINNER_FRAMES[spinnerIdx] : TOOL_DOT}{" "}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text bold wrap="truncate-end">{label}</Text>
          {inputSummary ? <><Text>(</Text><Text dimColor>{inputSummary}</Text><Text>)</Text></> : null}
          {status === "running" ? <Text dimColor>...{elapsed > 0 ? ` ${elapsed}s` : ""}</Text> : null}
        </Box>
      </Box>

      {status === "done" && (
        <Box flexDirection="row">
          <Text dimColor>{`  ${TOOL_CHILD}  `}{formatResultSummary(toolName, output ?? "")}</Text>
        </Box>
      )}

      {expandedOutput.length > 0 && (
        <Box flexDirection="column" paddingLeft={5}>
          <MarkdownText columns={detailColumns} dimColor>{expandedOutputText}</MarkdownText>
        </Box>
      )}

      {status === "error" && error && (
        <Box flexDirection="row">
          <Text dimColor>{`  ${TOOL_CHILD}  `}</Text>
          <Text color="red" wrap="truncate-end">Error: {error.split("\n")[0]}</Text>
        </Box>
      )}

      {expandedError.length > 1 && (
        <Box flexDirection="column" paddingLeft={5}>
          <MarkdownText columns={detailColumns} dimColor>{expandedError.slice(1).join("\n")}</MarkdownText>
        </Box>
      )}
    </Box>
  );
}
