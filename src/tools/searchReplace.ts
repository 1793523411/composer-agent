import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineTool } from "./Tool.js";

const inputSchema = z.object({
  file_path: z.string().describe("要编辑的文件绝对路径"),
  searches: z
    .array(
      z.object({
        old_string: z.string().describe("要查找的原始字符串"),
        new_string: z.string().describe("替换后的新字符串"),
      }),
    )
    .min(1)
    .describe("搜索替换项列表，按顺序依次执行"),
});

export const searchReplaceTool = defineTool({
  name: "search_replace",
  description:
    "在文件中执行多处搜索替换。每个搜索项的 old_string 必须在文件中恰好出现一次，依次执行所有替换。",
  inputSchema,
  isReadOnly: false,
  isConcurrencySafe: false,
  async execute(input, ctx) {
    const filePath = resolve(ctx.cwd, input.file_path);
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, output: `无法读取文件: ${msg}` };
    }

    const results: string[] = [];
    let current = content;

    for (let i = 0; i < input.searches.length; i++) {
      const { old_string, new_string } = input.searches[i]!;

      const count = current.split(old_string).length - 1;
      if (count === 0) {
        return {
          ok: false,
          output: `第 ${i + 1} 项替换失败: old_string 未找到\n已完成 ${results.length} 项替换`,
        };
      }
      if (count > 1) {
        return {
          ok: false,
          output: `第 ${i + 1} 项替换失败: old_string 出现 ${count} 次（需恰好 1 次）\n已完成 ${results.length} 项替换`,
        };
      }

      current = current.replace(old_string, new_string);
      const preview = old_string.slice(0, 30) + (old_string.length > 30 ? "…" : "");
      results.push(`✓ 替换 #${i + 1}: "${preview}"`);
    }

    try {
      writeFileSync(filePath, current, "utf-8");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, output: `写入失败: ${msg}` };
    }

    return {
      ok: true,
      output: `成功完成 ${results.length} 项替换\n${results.join("\n")}`,
    };
  },
});
