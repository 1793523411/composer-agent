import { Box, Text } from "ink";
import type { Key, ReactNode } from "react";

const ELLIPSIS = "…";
const CODE_BORDER = "│ ";
const HORIZONTAL_RULE = "─";
const MIN_COLUMNS = 20;

export interface MarkdownTextProps {
  children: string;
  columns?: number;
  dimColor?: boolean;
}

interface TextStyle {
  bold?: boolean;
  underline?: boolean;
  italic?: boolean;
  dimColor?: boolean;
  color?: string;
}

interface WrappedLineOptions extends TextStyle {
  columns: number;
  prefix?: string;
  prefixStyle?: TextStyle;
}

/**
 * Terminal-focused Markdown renderer.
 *
 * Ink's built-in wrapping is easy to confuse with CJK/wide characters and nested
 * Text nodes, so this component pre-wraps every visual row before rendering.
 */
export function MarkdownText({ children, columns = 80, dimColor = false }: MarkdownTextProps) {
  const width = Math.max(MIN_COLUMNS, columns);
  const lines = children.replace(/\r/g, "").split("\n");
  const elements: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      index++;

      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index++;
      }

      if (index < lines.length) {
        index++;
      }

      elements.push(renderCodeBlock(elements.length, language, codeLines, width));
      continue;
    }

    if (/^(---+|\*\*\*+|___+)\s*$/.test(trimmed)) {
      elements.push(
        <Text key={elements.length} dimColor>
          {padRowEnd(HORIZONTAL_RULE.repeat(Math.min(48, width - 1)), width)}
        </Text>,
      );
      index++;
      continue;
    }

    if (trimmed.startsWith("|")) {
      const tableLines: string[] = [];

      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        tableLines.push(lines[index] ?? "");
        index++;
      }

      elements.push(renderTable(elements.length, tableLines, width, dimColor));
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      if (elements.length > 0) {
        elements.push(<Text key={`${elements.length}-space`}> </Text>);
      }

      const level = heading[1]!.length;
      const text = cleanInlineMarkdown(heading[2] ?? "");
      elements.push(
        renderWrappedLine(elements.length, text, {
          columns: width,
          bold: true,
          underline: level === 1,
          dimColor: dimColor || level === 3,
        }),
      );
      index++;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      elements.push(
        renderWrappedLine(elements.length, cleanInlineMarkdown(quote[1] ?? ""), {
          columns: width,
          prefix: CODE_BORDER,
          prefixStyle: { dimColor: true },
          italic: true,
          dimColor,
        }),
      );
      index++;
      continue;
    }

    const unordered = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (unordered) {
      const level = Math.min(4, Math.floor((unordered[1] ?? "").length / 2));
      elements.push(
        renderWrappedLine(elements.length, cleanInlineMarkdown(unordered[2] ?? ""), {
          columns: width,
          prefix: `${"  ".repeat(level)}- `,
          dimColor,
        }),
      );
      index++;
      continue;
    }

    const ordered = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (ordered) {
      const level = Math.min(4, Math.floor((ordered[1] ?? "").length / 2));
      elements.push(
        renderWrappedLine(elements.length, cleanInlineMarkdown(ordered[2] ?? ""), {
          columns: width,
          prefix: `${"  ".repeat(level)}- `,
          dimColor,
        }),
      );
      index++;
      continue;
    }

    if (trimmed === "") {
      elements.push(<Text key={elements.length}> </Text>);
      index++;
      continue;
    }

    elements.push(
      renderWrappedLine(elements.length, cleanInlineMarkdown(line), {
        columns: width,
        dimColor,
      }),
    );
    index++;
  }

  return <>{elements}</>;
}

function renderCodeBlock(key: Key, language: string, codeLines: string[], columns: number): ReactNode {
  const codeColumns = Math.max(8, columns - visibleWidth(CODE_BORDER));
  const safeColumns = Math.max(1, columns - 1);

  return (
    <Box key={key} flexDirection="column" marginTop={1} marginBottom={1} width={columns}>
      {language ? (
        <Text dimColor wrap="truncate-end">
          {padRowEnd(truncateByWidth(`  ${language}`, safeColumns), columns)}
        </Text>
      ) : null}
      {codeLines.length === 0 ? (
        <CodeLine code="" codeColumns={codeColumns} columns={columns} />
      ) : (
        codeLines.map((code, codeIndex) => (
          <CodeLine key={codeIndex} code={code.replace(/\t/g, "  ")} codeColumns={codeColumns} columns={columns} />
        ))
      )}
    </Box>
  );
}

function CodeLine({ code, codeColumns, columns }: { code: string; codeColumns: number; columns: number }) {
  const safeCodeColumns = Math.max(1, codeColumns - 1);
  const visibleCode = padEndByWidth(truncateByWidth(code, safeCodeColumns) || " ", safeCodeColumns);

  return (
    <Box flexDirection="row" width={columns}>
      <Text dimColor>{CODE_BORDER}</Text>
      <Text color="green" wrap="truncate-end">
        {visibleCode}
      </Text>
    </Box>
  );
}

function renderTable(key: Key, tableLines: string[], columns: number, dimColor = false): ReactNode {
  const rows = tableLines
    .filter((line) => !/^\|[\s\-:|]+\|$/.test(line.trim()))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cleanInlineMarkdown(cell.trim())));

  if (rows.length === 0) {
    return <Text key={key}> </Text>;
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const gapWidth = 2;
  const safeColumns = Math.max(1, columns - 1);
  const availableColumns = Math.max(columnCount * 6, safeColumns - gapWidth * Math.max(0, columnCount - 1));
  const cellWidth = Math.max(6, Math.floor(availableColumns / Math.max(1, columnCount)));

  return (
    <Box key={key} flexDirection="column" width={columns}>
      {rows.map((row, rowIndex) => {
        const line = Array.from({ length: columnCount }, (_, columnIndex) => {
          const cell = truncateByWidth(row[columnIndex] ?? "", cellWidth);
          return padEndByWidth(cell, cellWidth);
        }).join("  ");

        return (
          <Text key={rowIndex} bold={rowIndex === 0} dimColor={dimColor} wrap="truncate-end">
            {padRowEnd(truncateByWidth(line, safeColumns), columns)}
          </Text>
        );
      })}
    </Box>
  );
}

function renderWrappedLine(key: Key, rawText: string, options: WrappedLineOptions): ReactNode {
  const prefix = options.prefix ?? "";
  const prefixWidth = visibleWidth(prefix);
  const textColumns = Math.max(1, options.columns - prefixWidth);
  const safeTextColumns = Math.max(1, textColumns - 1);
  const visualLines = wrapByWidth(rawText.replace(/\t/g, "  "), safeTextColumns);
  const continuationPrefix = prefixWidth > 0 ? " ".repeat(prefixWidth) : "";

  return (
    <Box key={key} flexDirection="column" width={options.columns}>
      {visualLines.map((line, index) => (
        <Box key={index} flexDirection="row" width={options.columns}>
          {prefixWidth > 0 ? (
            <Text
              bold={options.prefixStyle?.bold}
              underline={options.prefixStyle?.underline}
              italic={options.prefixStyle?.italic}
              dimColor={options.prefixStyle?.dimColor}
              color={options.prefixStyle?.color}
            >
              {index === 0 ? prefix : continuationPrefix}
            </Text>
          ) : null}
          <Text
            bold={options.bold}
            underline={options.underline}
            italic={options.italic}
            dimColor={options.dimColor}
            color={options.color}
            wrap="truncate-end"
          >
            {padEndByWidth(line || " ", safeTextColumns)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function cleanInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/`([^`]+)`/g, "`$1`")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, "$1");
}

function wrapByWidth(text: string, columns: number): string[] {
  if (columns <= 0) {
    return [""];
  }

  const rows: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const char of text) {
    const width = charWidth(char);

    if (currentWidth + width > columns && current.length > 0) {
      rows.push(current.trimEnd());
      current = "";
      currentWidth = 0;

      if (char === " ") {
        continue;
      }
    }

    current += char;
    currentWidth += width;
  }

  rows.push(current.trimEnd());
  return rows.length > 0 ? rows : [""];
}

function truncateByWidth(text: string, columns: number): string {
  if (columns <= 0) {
    return "";
  }

  if (visibleWidth(text) <= columns) {
    return text;
  }

  if (columns === 1) {
    return ELLIPSIS;
  }

  return `${takeByWidth(text, columns - visibleWidth(ELLIPSIS))}${ELLIPSIS}`;
}

function takeByWidth(text: string, columns: number): string {
  let output = "";
  let width = 0;

  for (const char of text) {
    const nextWidth = width + charWidth(char);
    if (nextWidth > columns) {
      break;
    }
    output += char;
    width = nextWidth;
  }

  return output;
}

function padEndByWidth(text: string, columns: number): string {
  return `${text}${" ".repeat(Math.max(0, columns - visibleWidth(text)))}`;
}

function padRowEnd(text: string, columns: number): string {
  return padEndByWidth(text, Math.max(1, columns - 1));
}

function visibleWidth(text: string): number {
  let width = 0;

  for (const char of text) {
    width += charWidth(char);
  }

  return width;
}

function charWidth(char: string): number {
  const codePoint = char.codePointAt(0);

  if (codePoint === undefined || codePoint === 0) {
    return 0;
  }

  if (
    codePoint < 32 ||
    (codePoint >= 0x7f && codePoint < 0xa0) ||
    codePoint === 0x200d ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
  ) {
    return 0;
  }

  if (isCombining(codePoint)) {
    return 0;
  }

  return isFullWidth(codePoint) ? 2 : 1;
}

function isCombining(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  );
}

function isFullWidth(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff))
  );
}
