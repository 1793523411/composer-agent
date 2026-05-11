import { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput, useFocus } from "ink";

export interface MultilineInputProps {
  onSubmit: (text: string) => void;
  onChange?: (text: string) => void;
  showCursor?: boolean;
  busy?: boolean;
  disabled?: boolean;
  history?: string[];
}

export function MultilineInput({
  onSubmit,
  onChange,
  showCursor = true,
  busy = false,
  disabled = false,
  history = [],
}: MultilineInputProps) {
  useFocus({ autoFocus: true });

  // 挂载时显示终端光标，卸载时隐藏
  useEffect(() => {
    process.stdout.write("\x1b[?25h");
    return () => { process.stdout.write("\x1b[?25l"); };
  }, []);

  // busy 时隐藏光标，idle 时恢复
  useEffect(() => {
    if (busy) {
      process.stdout.write("\x1b[?25l");
    } else {
      process.stdout.write("\x1b[?25h");
    }
  }, [busy]);

  const [text, setTextRaw] = useState("");
  const [cursorOffset, setCursorOffset] = useState(0);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const setText = useCallback(
    (newText: string) => {
      setTextRaw(newText);
      onChange?.(newText);
    },
    [onChange],
  );

  const cursorPos = Math.max(0, Math.min(text.length, text.length - cursorOffset));

  useInput(
    useCallback(
      (input: string, key) => {
        if (disabled) return;

        // Meta+Enter 或反斜杠+Enter: 插入换行
        if (key.return && key.meta) {
          const before = text.slice(0, cursorPos);
          const after = text.slice(cursorPos);
          setText(before + "\n" + after);
          // cursorOffset 不变，光标随文本增长自动前移
          return;
        }

        // 普通 Enter: 提交
        if (key.return) {
          // 检查末尾是否有反斜杠 (backslash-enter)
          if (text.endsWith("\\")) {
            const trimmed = text.slice(0, -1);
            const before = trimmed.slice(0, trimmed.length - cursorOffset);
            const after = trimmed.slice(trimmed.length - cursorOffset);
            setText(before + "\n" + after);
            return;
          }
          if (text.trim().length > 0) {
            onSubmit(text);
            setText("");
            setCursorOffset(0);
            setHistoryIndex(null);
          }
          return;
        }

        if (key.escape) {
          if (text.length > 0) {
            setText("");
            setCursorOffset(0);
            setHistoryIndex(null);
          }
          return;
        }

        if (key.upArrow) {
          if (history.length > 0) {
            const nextIndex = historyIndex === null
              ? history.length - 1
              : Math.max(0, historyIndex - 1);
            setHistoryIndex(nextIndex);
            setText(history[nextIndex] ?? "");
            setCursorOffset(0);
          }
          return;
        }

        if (key.downArrow) {
          if (historyIndex === null) return;
          const nextIndex = historyIndex + 1;
          if (nextIndex >= history.length) {
            setHistoryIndex(null);
            setText("");
            setCursorOffset(0);
          } else {
            setHistoryIndex(nextIndex);
            setText(history[nextIndex] ?? "");
            setCursorOffset(0);
          }
          return;
        }

        // 退格
        if (key.backspace || key.delete) {
          if (cursorPos > 0) {
            const before = text.slice(0, cursorPos - 1);
            const after = text.slice(cursorPos);
            const newText = before + after;
            setText(newText);
            setHistoryIndex(null);
            // Clamp cursorOffset to new text length
            if (cursorOffset > newText.length) setCursorOffset(newText.length);
          }
          return;
        }

        // 左方向键
        if (key.leftArrow) {
          if (cursorOffset < text.length) {
            setCursorOffset(cursorOffset + 1);
          }
          return;
        }

        // 右方向键
        if (key.rightArrow) {
          if (cursorOffset > 0) {
            setCursorOffset(cursorOffset - 1);
          }
          return;
        }

        // Ctrl+A: 跳到开头
        if (input === "\x01") {
          setCursorOffset(text.length);
          return;
        }

        // Ctrl+E: 跳到末尾
        if (input === "\x05") {
          setCursorOffset(0);
          return;
        }

        // 忽略其余控制字符
        if (key.ctrl || key.tab) {
          return;
        }

        // 普通字符输入
        if (input) {
          const before = text.slice(0, cursorPos);
          const after = text.slice(cursorPos);
          setText(before + input + after);
          setHistoryIndex(null);
        }
      },
      [disabled, history, historyIndex, text, cursorOffset, cursorPos, onSubmit],
    ),
  );

  // 渲染
  const prompt = <Text color={busy ? undefined : "yellow"} dimColor={busy}>{"\u276F"} </Text>;
  const borderColor = busy ? "gray" : "yellow";

  if (text.length === 0) {
    return (
      <Box
        flexDirection="row"
        width="100%"
        borderStyle="round"
        borderColor={borderColor}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        paddingLeft={1}
      >
        {prompt}
        {showCursor ? <Text inverse> </Text> : null}
        <Box flexShrink={1}>
          <Text dimColor wrap="truncate-end">{showCursor ? "  " : ""}Ask about code, edits, tests, or plans</Text>
        </Box>
      </Box>
    );
  }

  const lines = text.split("\n");
  // 计算光标所在行列
  let remaining = cursorPos;
  let cursorLine = 0;
  let cursorCol = 0;
  for (let i = 0; i < lines.length; i++) {
    if (remaining <= lines[i]!.length) {
      cursorLine = i;
      cursorCol = remaining;
      break;
    }
    remaining -= lines[i]!.length + 1; // +1 for \n
  }

  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="round"
      borderColor={borderColor}
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      paddingLeft={1}
    >
      {lines.map((line, i) => (
        <Box key={i} flexDirection="row">
          {i === 0 ? prompt : <Text>  </Text>}
          <Text>
            {i === cursorLine && showCursor ? (
              <>
                <Text>{line.slice(0, cursorCol)}</Text>
                <Text inverse>{line[cursorCol] ?? " "}</Text>
                <Text>{line.slice(cursorCol + 1)}</Text>
              </>
            ) : (
              line
            )}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
