import React from "react";
import { Box, Text } from "ink";

export interface MarkdownTextProps {
  children: string;
}

interface Segment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  dimColor?: boolean;
}

/**
 * 终端 Markdown 渲染：代码块、标题、粗体、行内代码、链接、列表
 */
export function MarkdownText({ children }: MarkdownTextProps) {
  const lines = children.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // 代码块
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3);
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!.trim())) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <Box key={elements.length} flexDirection="column" marginTop={1} marginBottom={1}>
          {lang && <Text dimColor>{"  "}{lang}</Text>}
          {codeLines.map((cl, ci) => (
            <Text key={ci}>
              <Text dimColor>{"│ "}</Text><Text color="green">{cl}</Text>
            </Text>
          ))}
        </Box>,
      );
      continue;
    }

    // 水平分隔线
    if (/^(---+|\*\*\*+|___+)\s*$/.test(line.trim())) {
      elements.push(
        <Text key={elements.length} dimColor>{"─".repeat(40)}</Text>,
      );
      i++;
      continue;
    }

    // 表格（连续的 | 开头行）
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) {
        tableLines.push(lines[i]!);
        i++;
      }
      const parsed = tableLines
        .filter((tl) => !/^\|[\s\-:|]+\|$/.test(tl.trim()))
        .map((tl) =>
          tl.split("|").slice(1, -1).map((cell) => cell.trim()),
        );
      if (parsed.length > 0) {
        const colCount = Math.max(...parsed.map((r) => r.length));
        const colWidths: number[] = Array.from({ length: colCount }, (_, ci) =>
          Math.max(...parsed.map((r) => (r[ci] ?? "").length)),
        );
        const [header, ...dataRows] = parsed;
        elements.push(
          <Box key={elements.length} flexDirection="column">
            {header && (
              <Text bold>
                {header.map((cell, ci) => cell.padEnd(colWidths[ci]!)).join("  ")}
              </Text>
            )}
            {header && (
              <Text dimColor>
                {colWidths.map((w) => "─".repeat(w)).join("──")}
              </Text>
            )}
            {dataRows.map((row, ri) => (
              <Text key={ri}>
                {row.map((cell, ci) => cell.padEnd(colWidths[ci]!)).join("  ")}
              </Text>
            ))}
          </Box>,
        );
      }
      continue;
    }

    // 标题
    const h3Match = line.match(/^###\s+(.*)/);
    const h2Match = line.match(/^##\s+(.*)/);
    const h1Match = line.match(/^#\s+(.*)/);
    if (h3Match) {
      if (elements.length > 0) elements.push(<Text key={`${elements.length}-sp`}>{" "}</Text>);
      elements.push(
        <Text key={elements.length} bold dimColor wrap="wrap">
          {h3Match[1]}
        </Text>,
      );
      i++;
      continue;
    }
    if (h2Match) {
      if (elements.length > 0) elements.push(<Text key={`${elements.length}-sp`}>{" "}</Text>);
      elements.push(
        <Text key={elements.length} bold wrap="wrap">
          {h2Match[1]}
        </Text>,
      );
      i++;
      continue;
    }
    if (h1Match) {
      if (elements.length > 0) elements.push(<Text key={`${elements.length}-sp`}>{" "}</Text>);
      elements.push(
        <Text key={elements.length} bold underline wrap="wrap">
          {h1Match[1]}
        </Text>,
      );
      i++;
      continue;
    }

    // 引用块
    const quoteMatch = line.match(/^>\s?(.*)/);
    if (quoteMatch) {
      elements.push(
        <Text key={elements.length} wrap="wrap">
          <Text dimColor>{"│ "}</Text>
          <Text italic>{parseInline(quoteMatch[1]!)}</Text>
        </Text>,
      );
      i++;
      continue;
    }

    // 列表项（无序）
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)/);
    if (bulletMatch) {
      elements.push(
        <Text key={elements.length} wrap="wrap">
          {"  - "}{parseInline(bulletMatch[2]!)}
        </Text>,
      );
      i++;
      continue;
    }

    // 列表项（有序）
    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (orderedMatch) {
      elements.push(
        <Text key={elements.length} wrap="wrap">
          {"  - "}{parseInline(orderedMatch[2]!)}
        </Text>,
      );
      i++;
      continue;
    }

    // 空行 — 保留为空白行
    if (line.trim() === "") {
      elements.push(<Text key={elements.length}>{" "}</Text>);
      i++;
      continue;
    }

    // 普通行
    elements.push(
      <Text key={elements.length} wrap="wrap">
        {parseInline(line)}
      </Text>,
    );
    i++;
  }

  return <>{elements}</>;
}

function parseInline(line: string): React.ReactNode[] {
  const segments: Segment[] = [];
  // 正则匹配：粗体 **text**、行内代码 `code`、链接 [title](url)、斜体 *text*
  const pattern = /(\*\*(.+?)\*\*)|(`([^`]+?)`)|(\[([^\]]+)\]\(([^)]+)\))|(\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index) });
    }

    if (match[2]) {
      segments.push({ text: match[2], bold: true });
    } else if (match[4]) {
      segments.push({ text: match[4], code: true });
    } else if (match[6] && match[7]) {
      segments.push({ text: `${match[6]}`, bold: true });
      segments.push({ text: ` (${match[7]})`, dimColor: true });
    } else if (match[9]) {
      segments.push({ text: match[9], italic: true });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex) });
  }

  if (segments.length === 0) {
    return [<React.Fragment key="empty">{line}</React.Fragment>];
  }

  return segments.map((seg, i) => {
    if (seg.bold) {
      return (
        <Text key={i} bold>
          {seg.text}
        </Text>
      );
    }
    if (seg.code) {
      return (
        <Text key={i} bold color="yellow">
          {`\`${seg.text}\``}
        </Text>
      );
    }
    if (seg.italic) {
      return (
        <Text key={i} italic>
          {seg.text}
        </Text>
      );
    }
    if (seg.dimColor) {
      return (
        <Text key={i} dimColor>
          {seg.text}
        </Text>
      );
    }
    return <React.Fragment key={i}>{seg.text}</React.Fragment>;
  });
}
