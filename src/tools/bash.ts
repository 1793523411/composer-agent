import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineTool } from "./Tool.js";

const execFileAsync = promisify(execFile);

const DANGEROUS_PATTERNS = [/\brm\s+-rf\b/, /\bsudo\b/];

const inputSchema = z.object({
  /** 要执行的 shell 命令 */
  command: z.string().describe("要执行的 shell 命令"),
  /** 超时时间（毫秒），默认 30000 */
  timeout: z.number().int().min(1000).optional().describe("超时时间（毫秒），默认 30000"),
});

export const bashTool = defineTool({
  name: "bash",
  description:
    "在当前工作目录执行一条 shell 命令并返回 stdout。危险命令（rm -rf、sudo）需要用户确认。",
  inputSchema,
  isReadOnly: false,
  isConcurrencySafe: false,

  async execute(input, ctx) {
    // 危险命令检查
    const isDangerous = DANGEROUS_PATTERNS.some((re) => re.test(input.command));
    if (isDangerous) {
      return {
        ok: false,
        output: `[permission:ask] 命令包含危险操作，需要用户确认: ${input.command}`,
      };
    }

    const timeout = input.timeout ?? 30_000;
    const shell = process.platform === "win32" ? process.env.COMSPEC || "cmd.exe" : "/bin/bash";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", input.command]
      : ["-lc", input.command];
    const maxBuffer = 512_000;

    try {
      const { stdout, stderr } = await execFileAsync(shell, args, {
        cwd: ctx.cwd,
        timeout,
        maxBuffer,
        windowsHide: true,
      });
      const output = [stdout, stderr].filter(Boolean).join("\n").trim();
      return { ok: true, output: output || "(无输出)" };
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException & {
        code?: string | number;
        stdout?: string;
        stderr?: string;
        killed?: boolean;
      };

      if (e.killed) {
        return { ok: false, output: `命令超时（${timeout}ms）: ${input.command}` };
      }

      const exitCode = typeof e.code === "number" ? e.code : 1;
      const stderr = e.stderr?.trim() || "";
      const stdout = e.stdout?.trim() || "";
      const combined = [stderr, stdout].filter(Boolean).join("\n");
      return {
        ok: false,
        output: `exit code ${exitCode}\n${combined || e.message}`,
      };
    }
  },
});
