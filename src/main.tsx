import "dotenv/config";

import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { parseArgs, printHelp } from "./args.js";
import { runOnceCli } from "./once.js";
import { loadConfig } from "./config.js";
import { setPermissionMode, type PermissionMode } from "./permissions.js";

function isPermissionMode(value: unknown): value is PermissionMode {
  return value === "default" || value === "bypass" || value === "plan";
}

function normalizeAllowedTools(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    return;
  }

  const config = loadConfig(args.cwd);
  const permissionMode = args.dangerouslySkipPermissions
    ? "bypass"
    : isPermissionMode(config.permissionMode) ? config.permissionMode : "default";
  const model = args.modelProvided
    ? args.model
    : process.env.CURSOR_MODEL ?? config.model ?? args.model;
  const allowedTools = args.allowedTools.length > 0
    ? args.allowedTools
    : normalizeAllowedTools(config.allowedTools);

  setPermissionMode(permissionMode);

  const effectiveArgs = { ...args, model, permissionMode, allowedTools };

  if (args.once) {
    await runOnceCli(effectiveArgs);
    return;
  }

  // --print: 单次执行模式（非交互，输出后退出）
  if (args.print) {
    await runOnceCli({ ...effectiveArgs, once: true, positional: [args.print] });
    return;
  }

  const inst = render(
    <App
      cwd={args.cwd}
      model={model}
      verbose={args.verbose}
      permissionMode={permissionMode}
      allowedTools={allowedTools}
      continueSession={args.continue}
    />,
  );
  await inst.waitUntilExit();
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
