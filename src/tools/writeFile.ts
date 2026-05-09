import { z } from "zod";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve, isAbsolute, dirname } from "node:path";
import { structuredPatch } from "diff";
import { defineTool } from "./Tool.js";

const inputSchema = z.object({
  /** 要写入的文件绝对路径 */
  file_path: z.string().describe("要写入的文件绝对路径"),
  /** 写入的文件内容 */
  content: z.string().describe("要写入的文件内容"),
});

export const writeFileTool = defineTool({
  name: "write_file",
  description:
    "将内容写入指定文件。如果目录不存在会自动创建。会覆盖已有文件。代码编辑优先使用 apply_patch；仅在生成完整新文件或整文件重写更清晰时使用本工具。",
  inputSchema,
  isReadOnly: false,
  isConcurrencySafe: false,

  async execute(input, ctx) {
    const filePath = isAbsolute(input.file_path)
      ? input.file_path
      : resolve(ctx.cwd, input.file_path);

    // 尝试读取旧内容
    let oldContent: string | null = null;
    try {
      oldContent = await readFile(filePath, "utf-8");
    } catch {
      // 文件不存在，视为新建
    }

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, input.content, "utf-8");
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES") {
        return { ok: false, output: `无写入权限: ${filePath}` };
      }
      return {
        ok: false,
        output: `写入失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const type = oldContent === null ? "create" : "update";
    const lines = input.content.split("\n").length;
    const summary = type === "create"
      ? `已创建 ${filePath}（${lines} 行）`
      : `已更新 ${filePath}（${lines} 行）`;

    const hunks = type === "update"
      ? structuredPatch(filePath, filePath, oldContent!, input.content, "", "", { context: 3 }).hunks
      : [];

    return {
      ok: true,
      output: JSON.stringify({ filePath, structuredPatch: hunks, type, summary }),
    };
  },
});
