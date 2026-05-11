import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";

import { Agent, type Run } from "@cursor/sdk";

const SPINNER_FRAMES = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
import { TranscriptView } from "./components/TranscriptView.js";
import {
  handleSlashCommand,
  isBangCommand,
  runBangCommand,
  SLASH_HELP,
  stripBang,
  getSlashCommands,
} from "./commands.js";
import { nextId, type TranscriptItem } from "./lib/transcript.js";
import { toolCallSummary, extractEarlyToolUpdate } from "./lib/toolDetail.js";
import type { PermissionMode } from "./permissions.js";
import { startPermissionServer, type PermissionRequest, type PermissionResponse } from "./permission-ipc.js";
import { PermissionPrompt } from "./components/PermissionPrompt.js";
import { WelcomeScreen } from "./components/WelcomeScreen.js";
import { PromptFooter } from "./components/PromptFooter.js";
import { SlashSuggestions } from "./components/SlashSuggestions.js";
import { loadConfig, getConfig } from "./config.js";
import { saveSession, loadLastSession, createSessionId, type SessionMessage } from "./session.js";
import { MultilineInput } from "./components/MultilineInput.js";

type Props = {
  cwd: string;
  model: string;
  verbose?: boolean;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  continueSession?: boolean;
};

function formatElapsed(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  return `${seconds}s`;
}

function getSpinnerColor(seconds: number): string {
  if (seconds > 10) return "red";
  if (seconds > 3) return "yellow";
  return "cyan";
}

function normalizeResult(result: unknown): string {
  if (typeof result === "string") return result;
  if (result == null) return "";
  if (typeof result === "object") {
    if (Array.isArray(result)) {
      return result
        .map((block) => {
          if (typeof block === "string") return block;
          if (block && typeof block === "object") {
            if ("text" in block && typeof (block as Record<string, unknown>).text === "string") return (block as Record<string, unknown>).text as string;
            if ("content" in block) return normalizeResult((block as Record<string, unknown>).content);
            return JSON.stringify(block);
          }
          return String(block);
        })
        .join("\n");
    }
    const obj = result as Record<string, unknown>;
    if ("text" in obj && typeof obj.text === "string") return obj.text;
    if ("content" in obj) return normalizeResult(obj.content);
    if ("output" in obj && typeof obj.output === "string") return obj.output;
    if ("result" in obj) return normalizeResult(obj.result);
    return JSON.stringify(result);
  }
  return String(result);
}

export function App({
  cwd,
  model,
  verbose = false,
  permissionMode = "default",
  allowedTools = [],
  continueSession = false,
}: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const rows = stdout.rows ?? 24;
  const cols = stdout.columns ?? 80;

  const agentRef = useRef<Awaited<ReturnType<typeof Agent.create>> | null>(null);
  const sessionIdRef = useRef(createSessionId());
  const sessionMessagesRef = useRef<SessionMessage[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [footerHint, setFooterHint] = useState<string | null>(null);
  const [hideThinking, setHideThinking] = useState(!verbose);
  const [expandedTranscript, setExpandedTranscript] = useState(false);
  const [currentInput, setCurrentInput] = useState("");
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState(model);
  const allowedToolsKey = allowedTools.join(",");

  useEffect(() => {
    setActiveModel(model);
  }, [model]);

  useInput((input, key) => {
    const normalized = input.toLowerCase();
    if (input === "\x0f" || (key.ctrl && normalized === "o")) {
      setExpandedTranscript((expanded) => !expanded);
    }
  });

  // Busy spinner state
  const [spinnerIdx, setSpinnerIdx] = useState(0);
  const [busyElapsed, setBusyElapsed] = useState(0);
  useEffect(() => {
    if (!busy) { setBusyElapsed(0); return; }
    const s = setInterval(() => setSpinnerIdx((i) => (i + 1) % SPINNER_FRAMES.length), 120);
    const e = setInterval(() => setBusyElapsed((n) => n + 1), 1000);
    return () => { clearInterval(s); clearInterval(e); };
  }, [busy]);

  // 权限确认状态
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const permissionResolverRef = useRef<((resp: PermissionResponse) => void) | null>(null);
  const permissionPortRef = useRef<number>(0);
  const permissionCloseRef = useRef<(() => void) | null>(null);

  // 加载配置 + 恢复会话
  useEffect(() => {
    loadConfig(cwd);
    if (continueSession) {
      const last = loadLastSession(cwd);
      if (last) {
        sessionIdRef.current = last.id;
        sessionMessagesRef.current = last.messages;
        // 恢复 transcript 显示
        const restored: TranscriptItem[] = last.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            kind: m.role as "user" | "assistant",
            id: nextId(),
            text: m.content,
          }));
        if (restored.length > 0) {
          setItems(restored);
        }
      }
    }
  }, [cwd, continueSession]);

  // 保存会话
  const persistSession = useCallback(() => {
    if (sessionMessagesRef.current.length > 0) {
      saveSession(cwd, {
        id: sessionIdRef.current,
        createdAt: Date.now(),
        messages: sessionMessagesRef.current,
      });
    }
  }, [cwd]);

  // 权限确认决策回调
  const handlePermissionDecision = useCallback(
    (decision: "allow" | "deny" | "always_allow") => {
      if (permissionResolverRef.current) {
        permissionResolverRef.current({ decision });
        permissionResolverRef.current = null;
      }
      setPermissionRequest(null);
    },
    [],
  );

  useEffect(() => {
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) {
      setBootError("缺少 CURSOR_API_KEY（.env 或环境变量）");
      return;
    }

    let cancelled = false;
    setReady(false);
    setBootError(null);
    setPermissionRequest(null);
    void (async () => {
      try {
        // 非 bypass 模式时启动权限 IPC server
        let permPort = 0;
        if (permissionMode !== "bypass") {
          const ipc = await startPermissionServer((req: PermissionRequest) => {
            return new Promise<PermissionResponse>((resolve) => {
              permissionResolverRef.current = resolve;
              setPermissionRequest(req);
            });
          });
          permPort = ipc.port;
          permissionPortRef.current = ipc.port;
          permissionCloseRef.current = ipc.close;
        }

        const agent = await Agent.create({
          apiKey,
          model: { id: activeModel },
          local: { cwd },
          mcpServers: {
            "composer-tools": {
              command: "npx",
              args: ["tsx", new URL("./mcp-server.ts", import.meta.url).pathname],
              env: {
                TOOL_CWD: cwd,
                TOOL_COLUMNS: String(cols),
                TOOL_PERMISSION_MODE: permissionMode,
                ...(allowedToolsKey ? { TOOL_ALLOWED_TOOLS: allowedToolsKey } : {}),
                ...(permPort > 0 ? { TOOL_PERMISSION_PORT: String(permPort) } : {}),
              },
            },
          },
        });
        if (cancelled) {
          await agent[Symbol.asyncDispose]();
          return;
        }
        agentRef.current = agent;
        setReady(true);
        if (!continueSession) {
          // No welcome message in transcript - clean start like Claude Code
        }
      } catch (e) {
        setBootError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      const a = agentRef.current;
      agentRef.current = null;
      if (a) void a[Symbol.asyncDispose]();
      // 清理 IPC server
      if (permissionCloseRef.current) {
        permissionCloseRef.current();
        permissionCloseRef.current = null;
      }
    };
  }, [activeModel, allowedToolsKey, cols, continueSession, cwd, permissionMode]);

  const appendItem = useCallback((it: TranscriptItem) => {
    setItems((prev) => [...prev, it]);
  }, []);

  const updateAssistant = useCallback((id: string, fn: (prev: string) => string) => {
    setItems((prev) =>
      prev.map((L) => (L.kind === "assistant" && L.id === id ? { ...L, text: fn(L.text) } : L)),
    );
  }, []);

  const updateThinking = useCallback((id: string, fn: (prev: string) => string) => {
    setItems((prev) =>
      prev.map((L) => (L.kind === "thinking" && L.id === id ? { ...L, text: fn(L.text) } : L)),
    );
  }, []);

  const upsertTool = useCallback(
    (
      callId: string,
      name: string,
      status: "running" | "completed" | "error",
      args?: unknown,
      result?: unknown,
    ) => {
      const maxDetail = Math.max(32, Math.min(120, cols - 24));
      let hint = `${name} (${status})`;
      const toolArgs = (args && typeof args === "object" ? args : undefined) as Record<string, unknown> | undefined;
      const toolResult = result != null ? normalizeResult(result) : undefined;
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.kind === "tool" && i.callId === callId);
        const prevDetail =
          idx >= 0 && prev[idx]!.kind === "tool" ? prev[idx]!.detail : undefined;
        const fresh = toolCallSummary(name, args, result, maxDetail);
        const detail = fresh || prevDetail;

        hint = detail ? `${name}: ${detail}` : `${name} (${status})`;

        if (idx >= 0) {
          const copy = [...prev];
          const cur = copy[idx]!;
          if (cur.kind === "tool") {
            copy[idx] = { ...cur, name, status, detail, args: toolArgs ?? cur.args, result: toolResult ?? cur.result };
          }
          return copy;
        }
        return [...prev, { kind: "tool", id: nextId(), callId, name, status, detail, args: toolArgs, result: toolResult }];
      });
      setFooterHint(hint);
    },
    [cols],
  );

  const runAgentPrompt = useCallback(
    async (text: string) => {
      const agent = agentRef.current;
      if (!agent || !text) return;

      const config = getConfig();
      // 如果有 systemPrompt，拼接到消息前面
      const messageText = config.systemPrompt
        ? `[System: ${config.systemPrompt}]\n\n${text}`
        : text;

      appendItem({ kind: "user", id: nextId(), text });
      sessionMessagesRef.current.push({ role: "user", content: text, timestamp: Date.now() });

      let currentAssistantId: string | null = null;
      const thinkingIdRef = { current: null as string | null };
      let assistantText = "";
      setBusy(true);
      setFooterHint("waiting for model");

      try {
        const run: Run = await agent.send(messageText, {
          onDelta: ({ update }) => {
            const early = extractEarlyToolUpdate(update);
            if (early) {
              upsertTool(early.callId, early.name, "running", early.args, undefined);
            }
          },
        });
        for await (const event of run.stream()) {
          switch (event.type) {
            case "assistant":
              for (const block of event.message.content) {
                if (block.type === "text") {
                  assistantText += block.text;
                  if (!currentAssistantId) {
                    currentAssistantId = nextId();
                    appendItem({ kind: "assistant", id: currentAssistantId, text: block.text });
                  } else {
                    updateAssistant(currentAssistantId, (p) => p + block.text);
                  }
                }
              }
              break;
            case "thinking": {
              const piece = event.text;
              if (!piece) break;
              if (!thinkingIdRef.current) {
                const tid = nextId();
                thinkingIdRef.current = tid;
                appendItem({ kind: "thinking", id: tid, text: piece });
              } else {
                updateThinking(thinkingIdRef.current, (p) => p + piece);
              }
              break;
            }
            case "tool_call":
              upsertTool(event.call_id, event.name, event.status, event.args, event.result);
              currentAssistantId = null;
              break;
            case "status":
              if (event.message) setFooterHint(event.message);
              break;
            case "system":
              if (event.subtype === "init" && event.tools?.length) {
                setFooterHint(`tools: ${event.tools.slice(0, 6).join(", ")}${event.tools.length > 6 ? "…" : ""}`);
              }
              break;
            default:
              break;
          }
        }
        // 记录助手回复
        if (assistantText) {
          sessionMessagesRef.current.push({ role: "assistant", content: assistantText, timestamp: Date.now() });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (currentAssistantId) {
          updateAssistant(currentAssistantId, (p) => (p ? `${p}\n\n` : "") + `[error] ${msg}`);
        } else {
          appendItem({ kind: "assistant", id: nextId(), text: `[error] ${msg}` });
        }
      } finally {
        setBusy(false);
        setFooterHint(null);
        persistSession();
      }
    },
    [appendItem, updateAssistant, updateThinking, upsertTool, persistSession],
  );

  const onSubmit = useCallback(
    (value: string) => {
      const v = value.trim();
      if (!v) return;
      setInputHistory((prev) => {
        const next = prev.at(-1) === v ? prev : [...prev, v];
        return next.slice(-100);
      });

      const slash = handleSlashCommand(v, {
        help: () => appendItem({ kind: "system", id: nextId(), text: SLASH_HELP }),
        clear: () => {
          sessionMessagesRef.current = [];
          sessionIdRef.current = createSessionId();
          setItems([]);
        },
        exit: () => exit(),
        cwd: () =>
          appendItem({
            kind: "system",
            id: nextId(),
            text: `工作目录：\n${cwd}`,
          }),
        model: (nextModel?: string) => {
          if (!nextModel) {
            appendItem({
              kind: "system",
              id: nextId(),
              text: `当前模型 id：${activeModel}\n用法：/model <model_id>`,
            });
            return;
          }
          if (nextModel === activeModel) {
            appendItem({
              kind: "system",
              id: nextId(),
              text: `当前已是模型：${activeModel}`,
            });
            return;
          }
          setActiveModel(nextModel);
          appendItem({
            kind: "system",
            id: nextId(),
            text: `模型已切换为：${nextModel}\n正在重连 Agent…`,
          });
        },
        compact: (keep: number) => {
          const sessionCount = sessionMessagesRef.current.length;
          if (sessionCount > keep) {
            sessionMessagesRef.current = sessionMessagesRef.current.slice(-keep);
            persistSession();
          }
          setItems((prev) => {
            const n0 = prev.length;
            if (n0 <= keep) {
              return [
                ...prev,
                {
                  kind: "system",
                  id: nextId(),
                  text: `无需 compact：当前 ${n0} 条，已 ≤ 目标 ${keep} 条。`,
                },
              ];
            }
            const next = prev.slice(-keep);
            return [
              ...next,
              {
                kind: "system",
                id: nextId(),
                text: `已 compact：原先 ${n0} 条 → 保留最近 ${keep} 条（现 ${next.length} 条）。`,
              },
            ];
          });
        },
        thinkToggle: () => setHideThinking((h) => !h),
      });

      if (slash) {
        if (slash.type === "unknown") {
          appendItem({
            kind: "system",
            id: nextId(),
            text: `未知指令：${slash.name}\n输入 /help 查看可用指令。`,
          });
        }
        return;
      }

      if (isBangCommand(v)) {
        const cmd = stripBang(v);
        if (!cmd) {
          appendItem({ kind: "system", id: nextId(), text: "用法：!git status  （! 后面跟一条 shell）" });
          return;
        }
        void (async () => {
          appendItem({ kind: "user", id: nextId(), text: `! ${cmd}` });
          setBusy(true);
          setFooterHint(`shell: ${cmd.slice(0, 40)}${cmd.length > 40 ? "…" : ""}`);
          const r = await runBangCommand(cwd, cmd);
          setBusy(false);
          setFooterHint(null);
          appendItem({
            kind: "system",
            id: nextId(),
            text: r.ok ? r.out : `退出非 0 或失败：\n${r.out}`,
          });
        })();
        return;
      }

      void runAgentPrompt(v);
    },
    [activeModel, appendItem, cwd, exit, persistSession, runAgentPrompt],
  );

  const slashSuggestions = !busy && currentInput.startsWith("/")
    ? getSlashCommands()
      .filter((c) => c.name.startsWith(currentInput.slice(1).toLowerCase()))
      .slice(0, 6)
    : [];

  if (bootError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">{bootError}</Text>
      </Box>
    );
  }

  if (!ready) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>{"\u276F"} Connecting…</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows - 1}>
      <Box
        flexDirection="column"
        flexGrow={1}
        width="100%"
        overflow="hidden"
        justifyContent={items.length === 0 && !busy ? "flex-start" : "flex-end"}
        paddingLeft={1}
        paddingTop={items.length === 0 && !busy ? 1 : 0}
      >
        {items.length === 0 && !busy && slashSuggestions.length === 0 && (
          <WelcomeScreen
            cwd={cwd}
            model={activeModel}
            permissionMode={permissionMode}
            allowedTools={allowedTools}
            columns={cols}
          />
        )}
        {items.length > 0 && (
          <TranscriptView
            items={items}
            columns={cols}
            hideThinking={hideThinking}
            expanded={expandedTranscript}
          />
        )}
      </Box>

      {permissionRequest ? (
        <PermissionPrompt
          toolName={permissionRequest.toolName}
          description={permissionRequest.description}
          onDecision={handlePermissionDecision}
        />
      ) : null}

      <Box flexDirection="column" flexShrink={0}>
        {busy && (
          <Box paddingLeft={3}>
            <Text color={getSpinnerColor(busyElapsed)}>{SPINNER_FRAMES[spinnerIdx]} {formatElapsed(busyElapsed)}{footerHint ? ` · ${footerHint}` : ""}</Text>
          </Box>
        )}
        <SlashSuggestions suggestions={slashSuggestions} />
        {!permissionRequest ? (
          <Box width="100%" marginTop={1} paddingLeft={1}>
            <MultilineInput
              onSubmit={onSubmit}
              onChange={setCurrentInput}
              showCursor={!busy}
              busy={busy}
              disabled={busy}
              history={inputHistory}
            />
          </Box>
        ) : null}
        <PromptFooter
          cwd={cwd}
          model={activeModel}
          permissionMode={permissionMode}
          busy={busy}
          inputActive={currentInput.length > 0}
          hideThinking={hideThinking}
          expandedTranscript={expandedTranscript}
          toolCount={allowedTools.length}
          columns={cols}
        />
      </Box>
    </Box>
  );
}
