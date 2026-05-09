/**
 * 配置管理 — 读取 .composer/config.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PermissionMode } from "./permissions.js";

export interface ComposerConfig {
  model?: string;
  systemPrompt?: string;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
}

const defaults: Required<ComposerConfig> = {
  model: "composer-2",
  systemPrompt: "",
  permissionMode: "default",
  allowedTools: [],
};

let cached: ComposerConfig | null = null;

/**
 * 从 cwd/.composer/config.json 加载配置，不存在则返回默认值
 */
export function loadConfig(cwd: string): ComposerConfig {
  const configPath = resolve(cwd, ".composer", "config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ComposerConfig>;
    cached = { ...defaults, ...parsed };
  } catch {
    cached = { ...defaults };
  }
  return cached;
}

/**
 * 获取已加载的配置（未调用 loadConfig 时返回默认值）
 */
export function getConfig(): ComposerConfig {
  return cached ?? { ...defaults };
}
