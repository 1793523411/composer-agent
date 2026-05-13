import { Box, Text } from "ink";
import type { Key, ReactNode } from "react";

const ELLIPSIS = "…";
const CODE_BORDER = "│ ";
const CODE_PADDING = "  ";
const HORIZONTAL_RULE = "─";
const MIN_COLUMNS = 20;
const CODE_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "interface",
  "let",
  "new",
  "of",
  "return",
  "switch",
  "throw",
  "try",
  "type",
  "var",
  "while",
]);
const CODE_LITERALS = new Set(["false", "null", "true", "undefined"]);

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
  repeatPrefix?: boolean;
}

type TableRow = string[];

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
          {padRowEnd(HORIZONTAL_RULE.repeat(Math.min(18, width - 1)), width)}
        </Text>,
      );
      index++;
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines: string[] = [];

      while (index < lines.length && isTableLine(lines[index] ?? "")) {
        tableLines.push(lines[index] ?? "");
        index++;
      }

      elements.push(renderTable(elements.length, tableLines, width, dimColor));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
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
          dimColor: dimColor || level >= 3,
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
          repeatPrefix: true,
          italic: true,
          dimColor,
        }),
      );
      index++;
      continue;
    }

    const unordered = line.match(/^(\s*)[-*+]\s+(.*)$/);
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

    const ordered = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (ordered) {
      const level = Math.min(4, Math.floor((ordered[1] ?? "").length / 2));
      const marker = `${ordered[2] ?? "1"}. `;
      elements.push(
        renderWrappedLine(elements.length, cleanInlineMarkdown(ordered[3] ?? ""), {
          columns: width,
          prefix: `${"  ".repeat(level)}${marker}`,
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
  const codeColumns = Math.max(8, columns - visibleWidth(CODE_PADDING));
  const safeCodeColumns = Math.max(1, codeColumns - 1);
  const normalizedLanguage = normalizeLanguage(language);
  const visualRows = (codeLines.length === 0 ? [""] : codeLines).flatMap((code) =>
    wrapCodeByWidth(code.replace(/\t/g, "  "), safeCodeColumns),
  );

  return (
    <Box key={key} flexDirection="column" marginTop={1} marginBottom={1} width={columns}>
      {visualRows.map((code, codeIndex) => (
        <CodeLine
          key={codeIndex}
          code={code}
          codeColumns={codeColumns}
          columns={columns}
          language={normalizedLanguage}
        />
      ))}
    </Box>
  );
}

function CodeLine({
  code,
  codeColumns,
  columns,
  language,
}: {
  code: string;
  codeColumns: number;
  columns: number;
  language: string;
}) {
  const safeCodeColumns = Math.max(1, codeColumns - 1);
  const visibleCode = padEndByWidth(truncateByWidth(code, safeCodeColumns) || " ", safeCodeColumns);

  return (
    <Box flexDirection="row" width={columns}>
      <Text dimColor>{CODE_PADDING}</Text>
      <Text wrap="truncate-end">
        {highlightCode(visibleCode, language)}
      </Text>
    </Box>
  );
}

function renderTable(key: Key, tableLines: string[], columns: number, dimColor = false): ReactNode {
  const hasExplicitHeader = tableLines.some(isTableSeparatorLine);
  const parsedRows = tableLines
    .filter((line) => !isTableSeparatorLine(line))
    .map(parseTableRow)
    .filter((row) => row.some((cell) => cell.length > 0));
  const { title, rows } = extractTableTitle(parsedRows);

  if (rows.length === 0) {
    return title ? renderWrappedLine(key, title, { columns, bold: true, dimColor }) : <Text key={key}> </Text>;
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  if (columnCount === 2 && isLikelyKeyValueTable(rows)) {
    return renderKeyValueTable(key, title, rows, columns, dimColor);
  }

  return renderGridTable(key, title, rows, columns, dimColor, hasExplicitHeader);
}

function renderKeyValueTable(
  key: Key,
  title: string | undefined,
  rows: TableRow[],
  columns: number,
  dimColor = false,
): ReactNode {
  const gap = "  ";
  const keyColumn = rows.map((row) => row[0] ?? "");
  const naturalKeyWidth = Math.max(...keyColumn.map(visibleWidth), 4);
  const maxKeyWidth = Math.max(8, Math.min(22, Math.floor(columns * 0.32)));
  const keyWidth = Math.min(naturalKeyWidth, maxKeyWidth);
  const valueColumns = Math.max(8, columns - 2 - keyWidth - visibleWidth(gap) - 1);

  return (
    <Box key={key} flexDirection="column" width={columns}>
      {title ? (
        <Text bold dimColor={dimColor} wrap="truncate-end">
          {padRowEnd(title, columns)}
        </Text>
      ) : null}
      {rows.map((row, rowIndex) => {
        const rawKey = row[0] ?? "";
        const rawValue = row[1] ?? "";
        const keyText = padEndByWidth(truncateByWidth(rawKey, keyWidth), keyWidth);
        const valueLines = wrapByWidth(rawValue, valueColumns);
        const isHeader = rowIndex === 0 && isKeyValueHeader(row);

        return (
          <Box key={rowIndex} flexDirection="column" width={columns}>
            {valueLines.map((line, lineIndex) => (
              <Box key={lineIndex} flexDirection="row" width={columns}>
                <Text dimColor>{lineIndex === 0 ? "  " : " ".repeat(2 + keyWidth + visibleWidth(gap))}</Text>
                {lineIndex === 0 ? (
                  <>
                    <Text bold={isHeader} dimColor={dimColor || !isHeader}>{keyText}</Text>
                    <Text dimColor>{gap}</Text>
                  </>
                ) : null}
                <Text bold={isHeader} dimColor={dimColor} wrap="truncate-end">
                  {padEndByWidth(line || " ", valueColumns)}
                </Text>
              </Box>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

function renderGridTable(
  key: Key,
  title: string | undefined,
  rows: TableRow[],
  columns: number,
  dimColor: boolean,
  hasExplicitHeader: boolean,
): ReactNode {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const gapWidth = 2;
  const safeColumns = Math.max(1, columns - 1);
  const availableColumns = Math.max(1, safeColumns - gapWidth * Math.max(0, columnCount - 1));
  const widths = tableColumnWidths(rows, columnCount, availableColumns);

  return (
    <Box key={key} flexDirection="column" width={columns}>
      {title ? (
        <Text bold dimColor={dimColor} wrap="truncate-end">
          {padRowEnd(title, columns)}
        </Text>
      ) : null}
      {rows.flatMap((row, rowIndex) => renderGridTableRow(row, rowIndex, widths, gapWidth, columns, dimColor, hasExplicitHeader))}
    </Box>
  );
}

function renderGridTableRow(
  row: TableRow,
  rowIndex: number,
  widths: number[],
  gapWidth: number,
  columns: number,
  dimColor: boolean,
  hasExplicitHeader: boolean,
): ReactNode[] {
  const cellLines = widths.map((width, columnIndex) => wrapByWidth(row[columnIndex] ?? "", width));
  const rowHeight = Math.max(...cellLines.map((lines) => lines.length), 1);
  const isHeader = hasExplicitHeader && rowIndex === 0;

  return Array.from({ length: rowHeight }, (_, lineIndex) => {
    const line = widths.map((width, columnIndex) => {
      const cell = cellLines[columnIndex]?.[lineIndex] ?? "";
      return padEndByWidth(cell, width);
    }).join(" ".repeat(gapWidth));

    return (
      <Text key={`${rowIndex}-${lineIndex}`} bold={isHeader} dimColor={dimColor} wrap="truncate-end">
        {padRowEnd(truncateByWidth(line, Math.max(1, columns - 1)), columns)}
      </Text>
    );
  });
}

function isTableStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  const next = lines[index + 1] ?? "";
  return isTableLine(line) && isTableSeparatorLine(next);
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("|") || isTableSeparatorLine(trimmed);
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("-") || !trimmed.includes("|")) return false;
  const cells = splitTableRow(trimmed);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTableRow(line: string): TableRow {
  return splitTableRow(line).map((cell) => cleanInlineMarkdown(cell.trim()));
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  let inCode = false;

  for (const char of trimmed) {
    if (escaped) {
      cell += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "`") {
      inCode = !inCode;
      cell += char;
      continue;
    }

    if (char === "|" && !inCode) {
      cells.push(cell);
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell);
  return cells;
}

function extractTableTitle(rows: TableRow[]): { title?: string; rows: TableRow[] } {
  const first = rows[0];
  if (!first) return { rows };

  const hasTitleOnly = first[0] && first.slice(1).every((cell) => cell.length === 0);
  if (!hasTitleOnly) return { rows };

  return { title: first[0], rows: rows.slice(1) };
}

function isLikelyKeyValueTable(rows: TableRow[]): boolean {
  const keyWidths = rows.map((row) => visibleWidth(row[0] ?? ""));
  const maxKeyWidth = Math.max(...keyWidths, 0);
  const nonEmptyValues = rows.filter((row) => (row[1] ?? "").trim().length > 0).length;
  return nonEmptyValues > 0 && maxKeyWidth <= 24;
}

function isKeyValueHeader(row: TableRow): boolean {
  const key = row[0] ?? "";
  const value = row[1] ?? "";
  return /^(key|name|field|字段|属性|类别|项目)$/i.test(key) || /^(value|type|description|说明|值|选型)$/i.test(value);
}

function tableColumnWidths(rows: TableRow[], columnCount: number, availableColumns: number): number[] {
  const minimumWidth = availableColumns < columnCount * 3 ? 1 : 3;
  const minWidths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const words = rows.flatMap((row) => (row[columnIndex] ?? "").split(/\s+/).filter(Boolean));
    const longestWord = words.length > 0 ? Math.max(...words.map(visibleWidth)) : minimumWidth;
    return Math.max(minimumWidth, Math.min(longestWord, Math.max(minimumWidth, Math.floor(availableColumns * 0.5))));
  });
  const idealWidths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const ideal = Math.max(...rows.map((row) => visibleWidth(row[columnIndex] ?? "")), minimumWidth);
    return Math.max(minWidths[columnIndex] ?? minimumWidth, ideal);
  });

  const totalIdeal = sum(idealWidths);
  if (totalIdeal <= availableColumns) return idealWidths;

  const totalMin = sum(minWidths);
  if (totalMin >= availableColumns) {
    return shrinkWidths(minWidths, availableColumns, minimumWidth);
  }

  const extra = availableColumns - totalMin;
  const overflows = idealWidths.map((width, index) => width - (minWidths[index] ?? minimumWidth));
  const totalOverflow = sum(overflows);
  const widths = minWidths.map((width, index) => {
    const share = totalOverflow > 0 ? Math.floor(((overflows[index] ?? 0) / totalOverflow) * extra) : 0;
    return width + share;
  });

  return distributeRemaining(widths, availableColumns, idealWidths);
}

function shrinkWidths(widths: number[], target: number, minimumWidth: number): number[] {
  const next = [...widths];
  while (sum(next) > target) {
    let widestIndex = -1;
    let widest = minimumWidth;
    for (let index = 0; index < next.length; index++) {
      const width = next[index] ?? minimumWidth;
      if (width > widest) {
        widest = width;
        widestIndex = index;
      }
    }
    if (widestIndex === -1) break;
    next[widestIndex] = Math.max(minimumWidth, (next[widestIndex] ?? minimumWidth) - 1);
  }
  return next;
}

function distributeRemaining(widths: number[], target: number, idealWidths: number[]): number[] {
  const next = [...widths];
  let index = 0;
  while (sum(next) < target && next.some((width, widthIndex) => width < (idealWidths[widthIndex] ?? width))) {
    const widthIndex = index % next.length;
    if ((next[widthIndex] ?? 0) < (idealWidths[widthIndex] ?? 0)) {
      next[widthIndex] = (next[widthIndex] ?? 0) + 1;
    }
    index++;
  }
  return next;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function renderWrappedLine(key: Key, rawText: string, options: WrappedLineOptions): ReactNode {
  const prefix = options.prefix ?? "";
  const prefixWidth = visibleWidth(prefix);
  const textColumns = Math.max(1, options.columns - prefixWidth);
  const safeTextColumns = Math.max(1, textColumns - 1);
  const visualLines = wrapByWidth(rawText.replace(/\t/g, "  "), safeTextColumns);
  const continuationPrefix = options.repeatPrefix ? prefix : prefixWidth > 0 ? " ".repeat(prefixWidth) : "";

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
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, url: string) =>
      alt.trim() ? `[image: ${alt.trim()}] (${url})` : `[image] (${url})`,
    )
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, "$1");
}

function normalizeLanguage(language: string): string {
  const raw = language.trim().split(/\s+/)[0] ?? "";
  const lower = raw.toLowerCase();
  const aliases: Record<string, string> = {
    javascript: "js",
    jsx: "jsx",
    jsonc: "json",
    shell: "sh",
    ts: "ts",
    tsx: "tsx",
    typescript: "ts",
  };
  return aliases[lower] ?? lower;
}

function highlightCode(line: string, language: string): ReactNode[] {
  if (!shouldHighlightCode(language)) {
    return [<Text key={0}>{line}</Text>];
  }

  return tokenizeCode(line).map((segment, index) => (
    <Text
      key={index}
      bold={segment.style.bold}
      dimColor={segment.style.dimColor}
      color={segment.style.color}
    >
      {segment.text}
    </Text>
  ));
}

function shouldHighlightCode(language: string): boolean {
  return ["", "js", "jsx", "json", "sh", "ts", "tsx"].includes(language);
}

interface CodeSegment {
  text: string;
  style: TextStyle;
}

function tokenizeCode(line: string): CodeSegment[] {
  const segments: CodeSegment[] = [];
  let index = 0;

  while (index < line.length) {
    const rest = line.slice(index);
    const char = line[index] ?? "";

    if (rest.startsWith("//")) {
      segments.push({ text: rest, style: { dimColor: true, color: "gray" } });
      break;
    }

    if (char === "#" && line.slice(0, index).trim() === "") {
      segments.push({ text: rest, style: { dimColor: true, color: "gray" } });
      break;
    }

    if (char === "\"" || char === "'" || char === "`") {
      const end = findStringEnd(line, index, char);
      segments.push({ text: line.slice(index, end), style: { color: "yellow" } });
      index = end;
      continue;
    }

    if (/[0-9]/.test(char)) {
      const match = rest.match(/^\d+(?:\.\d+)?/);
      if (match?.[0]) {
        segments.push({ text: match[0], style: { color: "magenta" } });
        index += match[0].length;
        continue;
      }
    }

    if (/[A-Za-z_$]/.test(char)) {
      const match = rest.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      const word = match?.[0] ?? char;
      if (CODE_KEYWORDS.has(word)) {
        segments.push({ text: word, style: { color: "cyan", bold: true } });
      } else if (CODE_LITERALS.has(word)) {
        segments.push({ text: word, style: { color: "magenta" } });
      } else {
        segments.push({ text: word, style: {} });
      }
      index += word.length;
      continue;
    }

    if (/[\[\]{}().,;:<>+=|&!?*/%-]/.test(char)) {
      segments.push({ text: char, style: { dimColor: true } });
      index++;
      continue;
    }

    segments.push({ text: char, style: {} });
    index++;
  }

  return segments.length > 0 ? segments : [{ text: " ", style: {} }];
}

function findStringEnd(line: string, start: number, quote: string): number {
  let escaped = false;
  for (let index = start + 1; index < line.length; index++) {
    const char = line[index] ?? "";
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
  }
  return line.length;
}

function wrapByWidth(text: string, columns: number): string[] {
  if (columns <= 0) {
    return [""];
  }

  const rows: string[] = [];
  let remaining = text;

  while (visibleWidth(remaining) > columns) {
    const breakIndex = findTextBreakIndex(remaining, columns);
    const current = remaining.slice(0, breakIndex).trimEnd();
    const next = remaining.slice(breakIndex).trimStart();
    rows.push(current || remaining.slice(0, breakIndex));
    remaining = next;
    if (!remaining) break;
  }

  rows.push(remaining.trimEnd());
  return rows.length > 0 ? rows : [""];
}

function findTextBreakIndex(text: string, columns: number): number {
  let width = 0;
  let index = 0;
  let lastWhitespace = -1;

  for (const char of text) {
    const nextWidth = width + charWidth(char);
    if (nextWidth > columns) {
      break;
    }
    width = nextWidth;
    index += char.length;
    if (/\s/.test(char)) {
      lastWhitespace = index;
    }
  }

  if (lastWhitespace > 0 && lastWhitespace >= Math.floor(index * 0.35)) {
    return lastWhitespace;
  }
  return Math.max(1, index);
}

function wrapCodeByWidth(text: string, columns: number): string[] {
  if (columns <= 0) {
    return [""];
  }

  const rows: string[] = [];
  let remaining = text;
  const baseIndent = remaining.match(/^\s*/)?.[0] ?? "";
  const continuationIndent = `${baseIndent}${baseIndent.length < 8 ? "  " : ""}`;

  while (visibleWidth(remaining) > columns) {
    const breakIndex = findCodeBreakIndex(remaining, columns);
    const current = remaining.slice(0, breakIndex).trimEnd();
    const next = remaining.slice(breakIndex).trimStart();
    rows.push(current || remaining.slice(0, breakIndex));
    remaining = next.length > 0 ? `${continuationIndent}${next}` : "";
    if (!remaining) break;
  }

  rows.push(remaining);
  return rows.length > 0 ? rows : [""];
}

function findCodeBreakIndex(text: string, columns: number): number {
  let width = 0;
  let index = 0;
  let lastBreak = -1;

  for (const char of text) {
    const nextWidth = width + charWidth(char);
    if (nextWidth > columns) {
      break;
    }
    width = nextWidth;
    index += char.length;
    if (isCodeBreakChar(char)) {
      lastBreak = index;
    }
  }

  if (lastBreak > 0 && lastBreak >= Math.floor(index * 0.45)) {
    return lastBreak;
  }
  return Math.max(1, index);
}

function isCodeBreakChar(char: string): boolean {
  return /\s|[.,;:()[\]{}<>+=|&?/-]/.test(char);
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
