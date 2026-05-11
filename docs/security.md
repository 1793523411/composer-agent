# Security Notes

This project can read files, write files, apply patches, and run shell commands inside the configured workspace. Treat it like a local development tool with privileged workspace access.

## Files That Must Stay Local

The default `.gitignore` keeps these out of commits:

```text
.env
.env.*
.npmrc
.composer/
.omc/
node_modules/
package-lock.json
pnpm-lock.yaml
```

`.env.example` is intentionally allowed so the required environment variables can be documented without a real key.

## Secrets

Required:

```bash
CURSOR_API_KEY=your_cursor_api_key
```

Optional:

```bash
CURSOR_MODEL=composer-2
```

Do not put real keys in README files, docs, issue templates, screenshots, shell history snippets, or shared config examples.

## Session Redaction

Saved sessions are sanitized before being written to `.composer/sessions/`.

The redactor currently covers:

- common `KEY=value` and JSON-style secret assignments
- bearer tokens
- AWS access key ids
- common OpenAI, Anthropic, Google, GitHub, Slack, and JWT patterns
- PEM private key blocks
- private IPv4 ranges
- internal host suffixes listed in `src/security.ts`
- local user home paths

This is a guardrail, not a complete secret scanner. If a secret was exposed to a model, a log, or another user, rotate it.

## Permission Modes

- Prefer `default` for interactive work.
- Use `plan` for read-only investigation.
- Use `bypass` only in a disposable or fully trusted workspace.

For non-interactive runs, combine `plan` or `--allowed-tools` with narrow prompts:

```bash
npm start -- --allowed-tools read_file,grep,glob,list_files --print "Audit the code for TODOs"
```

## Pre-Commit Checklist

Run these before committing or pushing:

```bash
git status --short --ignored
git diff --cached --check
npx tsc --noEmit
```

Check staged content for obvious secret patterns:

```bash
git grep -n --cached -I -E 'AKIA|ASIA|sk-|gh[pousr]_|github_pat_|xox[baprs]-|BEGIN .*PRIVATE KEY|Bearer '
```

The command above is intentionally simple. Use a dedicated secret scanner as an additional gate for shared repositories.

## When a Secret Leaks

1. Rotate or revoke the secret immediately.
2. Remove it from working files and ignored local state.
3. If committed, rewrite history only after coordinating with anyone who may have pulled it.
4. Audit local session files, shell history, CI logs, and package manager config.
