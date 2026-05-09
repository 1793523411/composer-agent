import React from "react";
import { Box, Text } from "ink";
import { createPatch } from "diff";

export interface DiffViewProps {
  filePath: string;
  oldContent: string;
  newContent: string;
}

interface DiffLine {
  type: "add" | "del" | "ctx";
  lineNo: string;
  content: string;
}

function parsePatch(filePath: string, oldContent: string, newContent: string): DiffLine[] {
  const patch = createPatch(filePath, oldContent, newContent, "", "", { context: 3 });
  const lines = patch.split("\n");
  const result: DiffLine[] = [];

  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // 跳过 header 行
    if (line.startsWith("Index:") || line.startsWith("===") || line.startsWith("---") || line.startsWith("+++")) {
      continue;
    }

    // hunk header
    const hunkMatch = /^@@ -(\d+),?\d* \+(\d+),?\d* @@/.exec(line);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1]!, 10);
      newLine = parseInt(hunkMatch[2]!, 10);
      continue;
    }

    if (line.startsWith("+")) {
      result.push({ type: "add", lineNo: String(newLine), content: line.slice(1) });
      newLine++;
    } else if (line.startsWith("-")) {
      result.push({ type: "del", lineNo: String(oldLine), content: line.slice(1) });
      oldLine++;
    } else if (line.startsWith(" ")) {
      result.push({ type: "ctx", lineNo: String(newLine), content: line.slice(1) });
      oldLine++;
      newLine++;
    }
    // 跳过 "\ No newline at end of file" 等
  }

  return result;
}

export function DiffView({ filePath, oldContent, newContent }: DiffViewProps) {
  const lines = parsePatch(filePath, oldContent, newContent);

  if (lines.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold color="white">{filePath}</Text>
        <Text dimColor>无变更</Text>
      </Box>
    );
  }

  const maxLineNo = Math.max(...lines.map((l) => l.lineNo.length));

  return (
    <Box flexDirection="column">
      <Text bold color="white">
        {filePath}
      </Text>
      {lines.map((line, i) => {
        const ln = line.lineNo.padStart(maxLineNo);
        switch (line.type) {
          case "add":
            return (
              <Text key={i}>
                <Text dimColor>{ln} </Text>
                <Text color="green">+{line.content}</Text>
              </Text>
            );
          case "del":
            return (
              <Text key={i}>
                <Text dimColor>{ln} </Text>
                <Text color="red">-{line.content}</Text>
              </Text>
            );
          case "ctx":
            return (
              <Text key={i}>
                <Text dimColor>{ln} </Text>
                <Text color="gray"> {line.content}</Text>
              </Text>
            );
        }
      })}
    </Box>
  );
}

// --- Hunks-based DiffView ---

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface HunksDiffViewProps {
  filePath: string;
  hunks: Hunk[];
}

export function HunksDiffView({ filePath, hunks }: HunksDiffViewProps) {
  const diffLines: DiffLine[] = [];

  for (const hunk of hunks) {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    for (const raw of hunk.lines) {
      if (raw.startsWith("+")) {
        diffLines.push({ type: "add", lineNo: String(newLine), content: raw.slice(1) });
        newLine++;
      } else if (raw.startsWith("-")) {
        diffLines.push({ type: "del", lineNo: String(oldLine), content: raw.slice(1) });
        oldLine++;
      } else {
        diffLines.push({ type: "ctx", lineNo: String(newLine), content: raw.slice(1) });
        oldLine++;
        newLine++;
      }
    }
  }

  if (diffLines.length === 0) {
    return null;
  }

  const maxLineNo = Math.max(...diffLines.map((l) => l.lineNo.length));

  return (
    <Box flexDirection="column">
      <Text bold color="white">{filePath}</Text>
      {diffLines.map((line, i) => {
        const ln = line.lineNo.padStart(maxLineNo);
        switch (line.type) {
          case "add":
            return (
              <Text key={i}>
                <Text dimColor>{ln} </Text>
                <Text color="green">+{line.content}</Text>
              </Text>
            );
          case "del":
            return (
              <Text key={i}>
                <Text dimColor>{ln} </Text>
                <Text color="red">-{line.content}</Text>
              </Text>
            );
          case "ctx":
            return (
              <Text key={i}>
                <Text dimColor>{ln} </Text>
                <Text color="gray"> {line.content}</Text>
              </Text>
            );
        }
      })}
    </Box>
  );
}
