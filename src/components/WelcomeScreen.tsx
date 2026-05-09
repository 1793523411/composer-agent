import { relative } from "node:path";
import { Box, Text } from "ink";

type Props = {
  cwd: string;
  model: string;
  permissionMode: string;
  allowedTools: string[];
  columns: number;
};

function shortenMiddle(value: string, max: number): string {
  if (value.length <= max) return value;
  const head = Math.max(8, Math.floor((max - 1) * 0.55));
  const tail = Math.max(8, max - head - 1);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function displayCwd(cwd: string, columns: number): string {
  const home = process.env.HOME;
  const normalized = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  return shortenMiddle(normalized, Math.max(24, Math.min(72, columns - 18)));
}

function toolSummary(allowedTools: string[]): string {
  if (allowedTools.length === 0) return "all tools";
  if (allowedTools.length <= 4) return allowedTools.join(", ");
  return `${allowedTools.slice(0, 4).join(", ")} +${allowedTools.length - 4}`;
}

export function WelcomeScreen({ cwd, model, permissionMode, allowedTools, columns }: Props) {
  const projectName = relative(process.env.HOME ?? "/", cwd).split("/").filter(Boolean).at(-1) ?? cwd;
  const width = Math.min(60, Math.max(48, columns - 8));
  const dotted = "·".repeat(Math.max(18, width - 20));

  return (
    <Box flexDirection="column" width={width} paddingLeft={1}>
      <Box flexDirection="row">
        <Text color="yellow" bold>Welcome to Composer Agent </Text>
        <Text dimColor>v0.1.0</Text>
      </Box>
      <Text dimColor>{dotted}</Text>

      <Box flexDirection="row" marginTop={1}>
        <Box width={17} flexShrink={0}>
          <Text color="yellow">{`     *      \n   ╭───╮    \n   │ ◆ │  * \n   ╰───╯    `}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Text>
            <Text bold>{projectName}</Text>
            <Text dimColor> is ready</Text>
          </Text>
          <Text dimColor>{displayCwd(cwd, columns)}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text><Text dimColor>model       </Text><Text>{model}</Text></Text>
            <Text><Text dimColor>permission  </Text><Text color={permissionMode === "bypass" ? "yellow" : "green"}>{permissionMode}</Text></Text>
            <Text><Text dimColor>tools       </Text><Text>{toolSummary(allowedTools)}</Text></Text>
          </Box>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Start with a prompt, or use a command:</Text>
        <Text>
          <Text color="yellow">/help</Text>
          <Text dimColor>{"  commands   "}</Text>
          <Text color="yellow">/think</Text>
          <Text dimColor>{"  thinking   "}</Text>
          <Text color="yellow">/compact</Text>
          <Text dimColor>{"  trim history   "}</Text>
          <Text color="yellow">!git status</Text>
        </Text>
        <Text>
          <Text color="yellow">Ctrl+O</Text>
          <Text dimColor>{"  expand/collapse transcript"}</Text>
        </Text>
      </Box>
    </Box>
  );
}
