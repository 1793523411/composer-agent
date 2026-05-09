import React from "react";
import { Box, Text, useInput } from "ink";

export interface PermissionPromptProps {
  toolName: string;
  description: string;
  onDecision: (decision: "allow" | "deny" | "always_allow") => void;
}

export function PermissionPrompt({ toolName, description, onDecision }: PermissionPromptProps) {
  useInput((input, key) => {
    if (input === "y" || key.return) {
      onDecision("allow");
    } else if (input === "n" || key.escape) {
      onDecision("deny");
    } else if (input === "a") {
      onDecision("always_allow");
    }
  });

  return (
    <Box flexDirection="column" paddingLeft={2} paddingRight={2} marginTop={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        width="100%"
      >
        <Box>
          <Text color="yellow" bold>Permission required</Text>
          <Text dimColor> · {toolName}</Text>
        </Box>
        <Text dimColor wrap="wrap">{description}</Text>
        <Box marginTop={1} gap={2}>
          <Text>
            <Text color="green" bold>Enter/y</Text>
            <Text dimColor> allow</Text>
          </Text>
          <Text>
            <Text color="red" bold>n/Esc</Text>
            <Text dimColor> deny</Text>
          </Text>
          <Text>
            <Text color="cyan" bold>a</Text>
            <Text dimColor> always allow</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
