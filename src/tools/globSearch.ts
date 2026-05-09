import { z } from "zod";
import { glob } from "glob";
import { resolve, isAbsolute } from "node:path";
import { defineTool } from "./Tool.js";

const inputSchema = z.object({
  /** glob 匹配模式 */
  pattern: z.string().describe("glob 匹配模式，如 **/*.ts"),
  /** 搜索的根目录（默认为 cwd） */
  path: z.string().optional().describe("搜索的根目录（默认为 cwd）"),
});

export const globSearchTool = defineTool({
  name: "glob",
  description: "按文件名模式搜索文件，返回匹配的文件路径列表。",
  inputSchema,
  isReadOnly: true,
  isConcurrencySafe: true,

  async execute(input, ctx) {
    const cwd = input.path
      ? isAbsolute(input.path) ? input.path : resolve(ctx.cwd, input.path)
      : ctx.cwd;

    try {
      const matches = await glob(input.pattern, {
        cwd,
        nodir: true,
        dot: false,
        absolute: true,
      });

      if (matches.length === 0) {
        return { ok: true, output: `未找到匹配文件: ${input.pattern}` };
      }

      const MAX = 200;
      const display = matches.slice(0, MAX);
      const suffix = matches.length > MAX
        ? `\n\n…（共 ${matches.length} 个文件，仅显示前 ${MAX} 个）`
        : "";

      return { ok: true, output: display.join("\n") + suffix };
    } catch (err: unknown) {
      return {
        ok: false,
        output: `glob 搜索失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
