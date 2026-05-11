# Composer Agent

A local Cursor Code Agent client built with `@cursor/sdk`, Ink, TypeScript, and an embedded MCP tool server.

It provides a terminal UI for multi-turn coding sessions, a one-shot CLI mode for automation, and a small local tool set for reading files, applying patches, running shell commands, searching the workspace, and delegating work to a sub-agent.

## Features

- Interactive Ink terminal UI with streaming assistant, thinking, tool, and status output.
- One-shot CLI mode through `npm run once -- "<prompt>"` or `--print`.
- Local MCP server exposing workspace tools to the Cursor Agent runtime.
- Permission modes for read-only planning, normal confirmation, or trusted bypass.
- Optional tool allow-list through CLI flags or local config.
- Session persistence under `.composer/sessions/`, with sensitive text redaction before saving.
- Git hygiene defaults that ignore local secrets, npm auth config, sessions, and local state.

## Requirements

- Node.js 20 or newer.
- A Cursor API key from the Cursor dashboard.

## Quick Start

```bash
npm install
cp .env.example .env
```

Fill `.env`:

```bash
CURSOR_API_KEY=your_cursor_api_key
# CURSOR_MODEL=composer-2
```

Start the interactive TUI:

```bash
npm start
```

Run one prompt and exit:

```bash
npm run once -- "Summarize this repository"
```

Print mode is also available:

```bash
npm start -- --print "List the main modules"
```

## Common Options

```bash
npm start -- --cwd /path/to/workspace
npm start -- --model composer-2
npm start -- --allowed-tools read_file,grep,glob
npm start -- --continue
npm start -- --verbose
```

Use `--dangerously-skip-permissions` only in a fully trusted workspace.

## Documentation

- [Usage Guide](docs/usage.md)
- [Architecture](docs/architecture.md)
- [Security Notes](docs/security.md)

## Project Layout

```text
src/
  app.tsx              Interactive Ink UI and Agent lifecycle
  main.tsx             CLI entry point
  once.ts              Non-interactive one-shot runner
  mcp-server.ts        Stdio MCP server exposing local tools
  permissions.ts       Tool permission modes
  permission-ipc.ts    Local permission confirmation bridge
  session.ts           Session save/restore
  security.ts          Redaction helpers for saved sessions
  tools/               Local tool implementations
  components/          Ink UI components
```

## Security Defaults

The repository intentionally ignores local secret and state files:

- `.env`
- `.env.*` except `.env.example`
- `.npmrc`
- `.composer/`
- `.omc/`
- lock files generated from local/private registries

Before pushing changes, run:

```bash
git status --short --ignored
npx tsc --noEmit
```

See [Security Notes](docs/security.md) for the fuller checklist.
