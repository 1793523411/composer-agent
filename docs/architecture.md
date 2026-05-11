# Architecture

Composer Agent is a small terminal application with three main layers:

1. CLI and Ink UI
2. Cursor Agent runtime
3. Local MCP tool server

## Entry Point

`src/main.tsx` loads environment variables, parses CLI flags, loads local config, resolves the effective model, permission mode, and allowed tool list, then starts either:

- `App` for interactive Ink mode
- `runOnceCli` for non-interactive one-shot mode

## Interactive UI

`src/app.tsx` owns the interactive lifecycle:

- creates the `Agent`
- starts the local permission IPC server
- passes MCP server configuration to `@cursor/sdk`
- renders transcript items
- streams assistant, thinking, status, and tool events
- saves and restores session messages

UI components live under `src/components/`.

## One-Shot Runner

`src/once.ts` creates the same Cursor Agent shape without the Ink UI. It streams assistant text to stdout and operational output to stderr.

This path is useful for scripting and CI-like local checks, especially with `--allowed-tools` or `permissionMode: "plan"`.

## MCP Server

`src/mcp-server.ts` exposes the local tool registry as a stdio MCP server named `composer-agent-tools`.

The parent process passes runtime behavior through environment variables:

```text
TOOL_CWD
TOOL_COLUMNS
TOOL_PERMISSION_MODE
TOOL_ALLOWED_TOOLS
TOOL_PERMISSION_PORT
```

The MCP server validates every tool input with Zod before executing it.

## Tools

Tools are registered in `src/tools/index.ts`. Each tool defines:

- name
- description
- Zod input schema
- read-only flag
- optional custom permission check
- execute function

Read-only tools:

- `read_file`
- `glob`
- `grep`
- `list_files`

Mutating or execution tools:

- `apply_patch`
- `write_file`
- `edit_file`
- `search_replace`
- `bash`
- `sub_agent`

## Permissions

`src/permissions.ts` determines whether a tool is allowed, denied, or needs confirmation.

In interactive mode, confirmation flows through `src/permission-ipc.ts`. The parent process hosts a local loopback HTTP server, and the MCP child process asks it for decisions when needed.

If the MCP server runs without a permission port, ask decisions fall back to auto-allow. Prefer an explicit allow-list or `plan` mode for non-interactive usage.

## Sessions and Redaction

`src/session.ts` persists sessions under `.composer/sessions/`.

Before writing messages to disk, it calls `redactSensitiveText` from `src/security.ts`. Redaction targets common secret assignments, bearer tokens, known API key formats, JWTs, private key blocks, private IP addresses, internal hostnames, and local user paths.

The in-memory and on-screen transcript is not modified by this redaction step; only the saved session content is sanitized.
