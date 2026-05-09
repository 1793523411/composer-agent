import { spawn } from "node:child_process";
import { z } from "zod";
import { defineTool } from "./Tool.js";

const inputSchema = z.object({
  patch: z.string().describe("完整 apply_patch 补丁文本，必须以 *** Begin Patch 开头，以 *** End Patch 结尾"),
});

export const applyPatchTool = defineTool({
  name: "apply_patch",
  description:
    "Apply a structured patch to files in the current workspace. Prefer this for code edits because it is reviewable and reversible. The patch must use the apply_patch format with Add File, Update File, or Delete File hunks.",
  inputSchema,
  isReadOnly: false,
  isConcurrencySafe: false,

  async execute(input, ctx) {
    if (!input.patch.trim().startsWith("*** Begin Patch")) {
      return { ok: false, output: "patch must start with *** Begin Patch" };
    }
    if (!input.patch.trimEnd().endsWith("*** End Patch")) {
      return { ok: false, output: "patch must end with *** End Patch" };
    }

    return new Promise((resolve) => {
      const child = spawn("apply_patch", [], {
        cwd: ctx.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({ ok: false, output: "apply_patch timed out after 30s" });
      }, 30_000);

      child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));
      child.on("error", (err) => {
        clearTimeout(timeout);
        resolve({ ok: false, output: `apply_patch failed to start: ${err.message}` });
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(chunks).toString("utf-8").trim();
        const stderr = Buffer.concat(errChunks).toString("utf-8").trim();
        const output = [stdout, stderr].filter(Boolean).join("\n");
        resolve({
          ok: code === 0,
          output: output || `apply_patch exited with code ${code ?? "unknown"}`,
        });
      });

      child.stdin.end(input.patch);
    });
  },
});
