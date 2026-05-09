import { Box, Text } from "ink";
import type { TranscriptItem } from "../lib/transcript.js";
import { ToolUseDisplay } from "./ToolUseDisplay.js";
import { MarkdownText } from "./MarkdownText.js";
import { ThinkingDisplay } from "./ThinkingDisplay.js";

const ASSISTANT_DOT = "\u25CF";
const USER_CHEVRON = "\u276F";
const TOOL_CHILD = "\u23BF";

// Tools eligible for collapse when appearing consecutively (3+)
const COLLAPSIBLE_TOOLS = new Set([
  "Read", "read", "read_file",
  "Grep", "grep", "SearchCodebase",
  "Glob", "glob", "list_files",
  "LS", "ls",
]);

function collapseTools(arr: TranscriptItem[]): TranscriptItem[] {
  const result: TranscriptItem[] = [];
  let i = 0;
  while (i < arr.length) {
    const it = arr[i];
    if (it.kind === "tool" && it.status === "completed" && COLLAPSIBLE_TOOLS.has(it.name)) {
      let j = i;
      while (j < arr.length) {
        const cur = arr[j];
        if (cur.kind !== "tool" || cur.status !== "completed" || !COLLAPSIBLE_TOOLS.has(cur.name)) break;
        j++;
      }
      if (j - i >= 3) {
        const counts: Record<string, number> = {};
        for (let k = i; k < j; k++) {
          const cur = arr[k];
          if (cur.kind !== "tool") continue;
          const n = cur.name.toLowerCase();
          const cat = n.includes("read") ? "Read" : n.includes("grep") || n.includes("search") ? "Searched" : "Listed";
          counts[cat] = (counts[cat] || 0) + 1;
        }
        const summary = Object.entries(counts).map(([k, v]) => `${k} ${v} files`).join(", ");
        result.push({ id: `collapse-${it.id}`, kind: "system", text: summary });
        i = j;
      } else {
        result.push(arr[i]);
        i++;
      }
    } else {
      result.push(arr[i]);
      i++;
    }
  }
  return result;
}

function truncateText(text: string, maxLines = 20): { text: string; truncated: boolean; remaining: number } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, truncated: false, remaining: 0 };
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true, remaining: lines.length - maxLines };
}

export function TranscriptView({
  items,
  columns,
  hideThinking,
  streamingThinking,
  isLoading,
  expanded = false,
}: {
  items: TranscriptItem[];
  columns: number;
  hideThinking: boolean;
  streamingThinking?: string | null;
  isLoading?: boolean;
  expanded?: boolean;
}) {
  const w = Math.max(40, columns - 2);
  const visibleItems = expanded ? items : collapseTools(items);

  return (
    <Box flexDirection="column" width={w}>
      {visibleItems.map((it, idx, arr) => {
        const prev = idx > 0 ? arr[idx - 1] : undefined;
        const mt = idx === 0 ? 0
            : // tool after tool = visual separation between tools
              it.kind === "tool" && prev && prev.kind === "tool"
              ? 1
              : // assistant after tool = visual break (new response block)
              it.kind === "assistant" && prev && prev.kind === "tool"
              ? 1
              : // tool after thinking/assistant = same turn grouping
              it.kind === "tool" && prev && (prev.kind === "thinking" || prev.kind === "assistant")
              ? 0
              : // thinking after tool/thinking/assistant = same turn
                it.kind === "thinking" && prev && (prev.kind === "assistant" || prev.kind === "tool" || prev.kind === "thinking")
                ? 0
                : // assistant after thinking = continuation
                  it.kind === "assistant" && prev && (prev.kind === "thinking")
                  ? 0
                  : // system (collapsed) items get spacing
                    it.kind === "system" ? 1
                    : 1;

        if (it.kind === "user") {
          return (
            <Box key={it.id} marginTop={mt} flexDirection="row" width="100%">
              <Text color="yellow" bold>{USER_CHEVRON} </Text>
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                <Text bold wrap="wrap">{it.text}</Text>
              </Box>
            </Box>
          );
        }

        if (it.kind === "system") {
          return (
            <Box key={it.id} marginTop={mt} flexDirection="row" width="100%">
              <Text dimColor>{`  ${TOOL_CHILD}  `}</Text>
              <Text dimColor wrap="wrap">{it.text}</Text>
            </Box>
          );
        }

        if (it.kind === "thinking") {
          if (hideThinking) return null;
          if (!it.text.trim() || it.text.trim().length < 5) return null;
          const { text: thinkText, truncated: thinkTruncated } = expanded
            ? { text: it.text, truncated: false }
            : truncateText(it.text, 2);
          return (
            <Box key={it.id} flexDirection="row" marginTop={mt} width="100%">
              <Box minWidth={3} flexShrink={0}>
                <Text dimColor>{ASSISTANT_DOT} </Text>
              </Box>
              <Text dimColor italic wrap="truncate-end">
                {thinkText}{thinkTruncated ? "..." : ""}
              </Text>
            </Box>
          );
        }

        if (it.kind === "tool") {
          const displayStatus = it.status === "completed" ? "done" : it.status === "error" ? "error" : "running";
          return (
            <Box key={it.id} flexDirection="column" marginTop={mt} width="100%">
              <ToolUseDisplay
                toolName={it.name}
                status={displayStatus}
                input={it.args}
                output={it.result && it.status === "completed" ? it.result : undefined}
                error={it.result && it.status === "error" ? it.result : undefined}
                expanded={expanded}
              />
            </Box>
          );
        }

        if (it.kind === "assistant") {
          return (
            <Box key={it.id} flexDirection="row" width="100%" marginTop={mt}>
              <Box minWidth={3} flexShrink={0}>
                <Text dimColor>{ASSISTANT_DOT} </Text>
              </Box>
              <Box paddingLeft={0} flexDirection="column" flexGrow={1} flexShrink={1}>
                {it.text.trim() ? (
                  <MarkdownText>{it.text}</MarkdownText>
                ) : null}
              </Box>
            </Box>
          );
        }

        return null;
      })}
      {streamingThinking ? (() => {
        const last = items[items.length - 1];
        const stMt = last && (last.kind === "thinking" || last.kind === "tool" || last.kind === "assistant") ? 0 : 1;
        return (
          <Box marginTop={stMt}>
            <ThinkingDisplay
              thinking={streamingThinking}
              isStreaming={true}
              verbose={!hideThinking}
            />
          </Box>
        );
      })() : null}
      {isLoading && !streamingThinking && (
        <Box marginTop={0} paddingLeft={2}>
          <Text italic dimColor>Thinking…</Text>
        </Box>
      )}
    </Box>
  );
}
