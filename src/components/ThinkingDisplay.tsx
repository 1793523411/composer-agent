import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export interface ThinkingDisplayProps {
  thinking: string;
  isStreaming: boolean;
  verbose: boolean;
}

export function ThinkingDisplay({ thinking, isStreaming, verbose }: ThinkingDisplayProps) {
  const title = isStreaming ? (
    <Text dimColor italic>
      <Text color="cyan"><Spinner type="dots" /></Text>{" "}Thinking…
    </Text>
  ) : (
    <Text dimColor italic>⏵ Thinking (collapsed)</Text>
  );

  if (!verbose) {
    return <Box>{title}</Box>;
  }

  return (
    <Box flexDirection="column">
      <Box>{title}</Box>
      <Box marginLeft={2}>
        <Text dimColor italic>{thinking}</Text>
      </Box>
    </Box>
  );
}
