import React, { Fragment } from "react";
import { Box, Text } from "ink";
import { parseAssistantDisplay } from "../lib/parseAssistantDisplay.js";

function headingColor(level: 1 | 2 | 3): string {
  if (level === 1) return "cyan";
  if (level === 2) return "yellow";
  return "blue";
}

/** 单行内 **粗体**、`code` */
function LineWithInline({ line }: { line: string }) {
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <Text wrap="wrap">
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**") && p.length >= 4) {
          return (
            <Text key={i} bold>
              {p.slice(2, -2)}
            </Text>
          );
        }
        if (p.startsWith("`") && p.endsWith("`") && p.length >= 2) {
          return (
            <Text key={i} color="green" bold>
              {p.slice(1, -1)}
            </Text>
          );
        }
        return <Text key={i}>{p}</Text>;
      })}
    </Text>
  );
}

export function RichAssistantBody({ text, isError }: { text: string; isError: boolean }) {
  if (isError) {
    return (
      <Text color="red" wrap="wrap">
        {text}
      </Text>
    );
  }

  const t = text.trim();
  if (!t) {
    return (
      <Text dimColor italic>
        …
      </Text>
    );
  }

  const chunks = parseAssistantDisplay(text);

  return (
    <Box flexDirection="column">
      {chunks.map((ch, idx) => {
        if (ch.type === "h") {
          const pad = ch.level === 1 ? "" : ch.level === 2 ? " " : "  ";
          return (
            <Box key={idx} marginY={0}>
              <Text bold color={headingColor(ch.level)}>
                {pad}
                {ch.level === 1 ? "■ " : ch.level === 2 ? "▸ " : "· "}
                {ch.text}
              </Text>
            </Box>
          );
        }
        if (ch.type === "rule") {
          return (
            <Box key={idx} marginY={0}>
              <Text dimColor>{"─".repeat(Math.min(48, 32))}</Text>
            </Box>
          );
        }
        if (ch.type === "code") {
          return (
            <Box
              key={idx}
              flexDirection="column"
              borderStyle="single"
              borderColor="gray"
              marginY={0}
              paddingX={1}
            >
              {ch.lang ? (
                <Text dimColor italic>
                  {ch.lang}
                </Text>
              ) : null}
              <Text color="green" wrap="wrap">
                {ch.body}
              </Text>
            </Box>
          );
        }
        /* txt */
        const lines = ch.text.split("\n");
        return (
          <Fragment key={idx}>
            {lines.map((ln, j) => (
              <Box key={`${idx}-${j}`}>
                <LineWithInline line={ln.length ? ln : " "} />
              </Box>
            ))}
          </Fragment>
        );
      })}
    </Box>
  );
}
