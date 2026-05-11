# Usage Guide

This project runs a local terminal client around `@cursor/sdk`. The Agent talks to Cursor through `CURSOR_API_KEY` and receives local workspace tools through the embedded MCP server.

## Install

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```bash
CURSOR_API_KEY=your_cursor_api_key
# Optional:
# CURSOR_MODEL=composer-2
```

`.env` is ignored by Git and should stay local.

## Interactive Mode

```bash
npm start
```

Useful interactive commands:

- `/help` shows available commands.
- `/cwd` prints the active workspace.
- `/model` prints the active model.
- `/compact` keeps only recent visible transcript items and recent saved messages.
- `/clear` clears the current visible transcript and saved message buffer.
- `/think` toggles thinking display.
- `/exit` or `/quit` exits.
- `!<command>` runs a local shell command directly from the TUI.

## One-Shot Mode

Run one prompt and exit:

```bash
npm run once -- "Explain the tools in this project"
```

Print mode routes through the same one-shot runner:

```bash
npm start -- --print "Find likely follow-up work"
```

## CLI Options

```text
--cwd <path>                  Workspace root, defaults to the current directory
--model <id>                  Model id, overrides config and CURSOR_MODEL
--allowed-tools <names>       Comma-separated MCP tool allow-list
--verbose                     Show thinking output
--print <prompt>              Run a single prompt and print output
--once                        Single-run mode used by npm run once
--continue                    Restore the last saved session
--dangerously-skip-permissions Skip tool permission confirmation
-h, --help                    Print CLI help
```

## Local Config

The app reads `.composer/config.json` from the active workspace. This directory is ignored by default because it may contain local prompts or workflow details.

Example:

```json
{
  "model": "composer-2",
  "permissionMode": "default",
  "allowedTools": ["read_file", "grep", "glob", "list_files"],
  "systemPrompt": "Prefer small, well-tested changes."
}
```

Config precedence:

1. CLI flags
2. environment variables such as `CURSOR_MODEL`
3. `.composer/config.json`
4. built-in defaults

## Permission Modes

- `default`: read-only tools run automatically; write and shell tools ask for confirmation in the TUI.
- `plan`: only read-only tools are allowed.
- `bypass`: every tool is allowed without asking.

The `--dangerously-skip-permissions` flag forces `bypass`.

## Tool Allow-List

Limit tool exposure with:

```bash
npm start -- --allowed-tools read_file,grep,glob,list_files
```

Available tools:

- `read_file`
- `apply_patch`
- `write_file`
- `edit_file`
- `bash`
- `glob`
- `grep`
- `list_files`
- `search_replace`
- `sub_agent`

Unknown names are ignored by the MCP server and reported on stderr.

## Sessions

Sessions are saved in `.composer/sessions/`. Saved message content is passed through `redactSensitiveText` before writing to disk, which helps avoid storing common token formats, private IPs, internal hosts, and local user paths.

Use:

```bash
npm start -- --continue
```

to restore the latest saved session.
