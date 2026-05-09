import { z } from "zod";
import { readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { defineTool } from "./Tool.js";

const inputSchema = z.object({
  path: z.string().describe("要列出的目录路径（绝对或相对于 cwd）"),
  recursive: z.boolean().optional().describe("是否递归列出子目录文件"),
});

export const listFilesTool = defineTool({
  name: "list_files",
  description: "列出目录中的文件和子目录。支持递归模式。",
  inputSchema,
  isReadOnly: true,
  isConcurrencySafe: true,
  async execute(input, ctx) {
    const target = resolve(ctx.cwd, input.path);
    try {
      const entries = await readdir(target, {
        withFileTypes: true,
        recursive: input.recursive ?? false,
      });
      const lines = entries.map((e) => {
        const rel = relative(target, resolve(target, e.parentPath ?? "", e.name));
        const name = rel || e.name;
        return e.isDirectory() ? `${name}/` : name;
      });
      lines.sort();
      return { ok: true, output: lines.join("\n") || "(空目录)" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, output: `无法列出目录: ${msg}` };
    }
  },
});
