import { basename } from "node:path";
import { Box, Text } from "ink";

type Props = {
  cwd: string;
  model: string;
  permissionMode: string;
  busy: boolean;
  inputActive: boolean;
  hideThinking: boolean;
  expandedTranscript: boolean;
  toolCount: number;
  columns: number;
};

function modeColor(permissionMode: string): string {
  if (permissionMode === "bypass") return "yellow";
  if (permissionMode === "plan") return "cyan";
  return "green";
}

function compactModel(model: string, max = 18): string {
  if (model.length <= max) return model;
  return `${model.slice(0, max - 1)}…`;
}

export function PromptFooter({
  cwd,
  model,
  permissionMode,
  busy,
  inputActive,
  hideThinking,
  expandedTranscript,
  toolCount,
  columns,
}: Props) {
  const narrow = columns < 84;
  const project = basename(cwd) || cwd;
  const transcriptHint = expandedTranscript ? "Ctrl+O collapse" : "Ctrl+O expand";
  const hint = inputActive
    ? "Enter send · Opt+Enter newline · Esc clear"
    : `? shortcuts · ${transcriptHint} · / commands · ↑ history`;

  return (
    <Box
      flexDirection={narrow ? "column" : "row"}
      justifyContent={narrow ? "flex-start" : "space-between"}
      paddingLeft={2}
      paddingRight={1}
      gap={narrow ? 0 : 1}
    >
      <Box flexShrink={1}>
        <Text dimColor>{busy ? "Working" : hint}</Text>
        {!narrow ? <Text dimColor>{" · "}</Text> : null}
        <Text color={modeColor(permissionMode)}>{permissionMode}</Text>
        <Text dimColor>{" · "}</Text>
        <Text>{compactModel(model)}</Text>
      </Box>
      <Box flexShrink={1}>
        <Text dimColor wrap="truncate-end">
          {project} · {toolCount === 0 ? "all tools" : `${toolCount} tools`} · {hideThinking ? "thinking hidden" : "thinking visible"}
          {expandedTranscript ? " · expanded" : " · compact"}
        </Text>
      </Box>
    </Box>
  );
}
