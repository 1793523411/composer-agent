import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import { structuredPatch } from "diff";
import { defineTool } from "./Tool.js";

const inputSchema = z.object({
  /** 要编辑的文件绝对路径 */
  file_path: z.string().describe("要编辑的文件绝对路径"),
  /** 要被替换的原始字符串（必须在文件中唯一出现） */
  old_string: z.string().describe("要被替换的原始字符串（必须在文件中唯一出现）"),
  /** 替换后的新字符串 */
  new_string: z.string().describe("替换后的新字符串"),
});

export const editFileTool = defineTool({
  name: "edit_file",
  description:
    "精确字符串替换：在文件中找到 old_string（必须唯一匹配），替换为 new_string 并写回。代码编辑优先使用 apply_patch；本工具适合很小的单点替换。",
  inputSchema,
  isReadOnly: false,
  isConcurrencySafe: false,

  async execute(input, ctx) {
    const filePath = isAbsolute(input.file_path)
      ? input.file_path
      : resolve(ctx.cwd, input.file_path);

    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return { ok: false, output: `文件不存在: ${filePath}` };
      }
      return {
        ok: false,
        output: `读取失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 计算 old_string 出现次数
    const occurrences = content.split(input.old_string).length - 1;

    if (occurrences === 0) {
      return {
        ok: false,
        output: `old_string not found in ${filePath}`,
      };
    }

    if (occurrences > 1) {
      return {
        ok: false,
        output: `old_string has ${occurrences} matches in ${filePath} — provide more context to make it unique`,
      };
    }

    // 恰好 1 次，执行替换
    const oldContent = content;
    const newContent = content.replace(input.old_string, input.new_string);

    try {
      await writeFile(filePath, newContent, "utf-8");
    } catch (err: unknown) {
      return {
        ok: false,
        output: `写入失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const patch = structuredPatch(filePath, filePath, oldContent, newContent, "", "", { context: 3 });

    return {
      ok: true,
      output: JSON.stringify({
        filePath,
        structuredPatch: patch.hunks,
        summary: `已替换 ${filePath} 中的内容（1 处匹配）`,
      }),
    };
  },
});
