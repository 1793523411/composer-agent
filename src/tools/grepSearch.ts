import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, isAbsolute } from "node:path";
import { defineTool } from "./Tool.js";

const execFileAsync = promisify(execFile);

const inputSchema = z.object({
  /** 搜索的正则表达式模式 */
  pattern: z.string().describe("搜索的正则表达式模式"),
  /** 搜索的目录或文件路径（默认为 cwd） */
  path: z.string().optional().describe("搜索的目录或文件路径（默认为 cwd）"),
  /** 文件类型过滤 glob，如 \"*.ts\" */
  include: z.string().optional().describe("文件类型过滤 glob，如 \"*.ts\""),
});

export const grepSearchTool = defineTool({
  name: "grep",
  description:
    "使用 ripgrep (rg) 按正则表达式搜索文件内容，返回匹配的行及文件位置。",
  inputSchema,
  isReadOnly: true,
  isConcurrencySafe: true,

  async execute(input, ctx) {
    const searchPath = input.path
      ? isAbsolute(input.path) ? input.path : resolve(ctx.cwd, input.path)
      : ctx.cwd;

    const args = [
      "--line-number",
      "--no-heading",
      "--color=never",
      "--max-count=100",
    ];

    if (input.include) {
      args.push("--glob", input.include);
    }

    args.push(input.pattern, searchPath);

    try {
      const { stdout } = await execFileAsync("rg", args, {
        cwd: ctx.cwd,
        timeout: 30_000,
        maxBuffer: 512_000,
      });

      const output = stdout.trim();
      if (!output) {
        return { ok: true, output: `未找到匹配: ${input.pattern}` };
      }

      // 截断过长输出
      const lines = output.split("\n");
      const MAX_LINES = 300;
      if (lines.length > MAX_LINES) {
        return {
          ok: true,
          output: lines.slice(0, MAX_LINES).join("\n") +
            `\n\n…（共 ${lines.length} 行匹配，仅显示前 ${MAX_LINES} 行）`,
        };
      }

      return { ok: true, output };
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException & {
        status?: number;
        stdout?: string;
        stderr?: string;
      };

      // rg 退出码 1 表示没有匹配（不是错误）
      if (e.status === 1) {
        return { ok: true, output: `未找到匹配: ${input.pattern}` };
      }

      // rg 不存在时的处理
      if (e.code === "ENOENT") {
        return {
          ok: false,
          output: "ripgrep (rg) 未安装，请先安装: brew install ripgrep",
        };
      }

      return {
        ok: false,
        output: `grep 搜索失败: ${e.stderr?.trim() || e.message}`,
      };
    }
  },
});
