import { Box, Text } from "ink";

type Suggestion = {
  name: string;
  description: string;
};

export function SlashSuggestions({ suggestions }: { suggestions: Suggestion[] }) {
  if (suggestions.length === 0) return null;

  return (
    <Box paddingLeft={2} paddingRight={2} marginBottom={0}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        width={52}
      >
        <Text dimColor>commands</Text>
        {suggestions.map((command, index) => (
          <Box key={command.name} flexDirection="row">
            <Box width={14}>
              <Text color={index === 0 ? "yellow" : undefined} inverse={index === 0}>
                /{command.name}
              </Text>
            </Box>
            <Text dimColor wrap="truncate-end">{command.description}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
