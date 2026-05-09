import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import { defineTool } from "./Tool.js";

const inputSchema = z.object({
  /** 要读取的文件绝对路径 */
  file_path: z.string().describe("要读取的文件绝对路径"),
  /** 起始行号（从 1 开始），可选 */
  offset: z.number().int().min(1).optional().describe("起始行号（从 1 开始）"),
  /** 读取的行数上限，可选 */
  limit: z.number().int().min(1).optional().describe("读取的行数上限"),
});

export const readFileTool = defineTool({
  name: "read_file",
  description:
    "读取本地文件内容。支持通过 offset（起始行号，从 1 开始）和 limit（行数）截取部分内容。输出带行号前缀。",
  inputSchema,
  isReadOnly: true,
  isConcurrencySafe: true,

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
      if (code === "EISDIR") {
        return { ok: false, output: `路径是目录而非文件: ${filePath}` };
      }
      if (code === "EACCES") {
        return { ok: false, output: `无读取权限: ${filePath}` };
      }
      return {
        ok: false,
        output: `读取失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const allLines = content.split("\n");
    const startIdx = input.offset ? input.offset - 1 : 0;
    const endIdx = input.limit ? startIdx + input.limit : allLines.length;
    const lines = allLines.slice(startIdx, endIdx);

    if (lines.length === 0) {
      return { ok: true, output: "(文件为空或指定范围无内容)" };
    }

    // 行号前缀对齐
    const maxLineNo = startIdx + lines.length;
    const pad = String(maxLineNo).length;
    const numbered = lines.map(
      (line, i) => `${String(startIdx + i + 1).padStart(pad)}\t${line}`,
    );

    return { ok: true, output: numbered.join("\n") };
  },
});
