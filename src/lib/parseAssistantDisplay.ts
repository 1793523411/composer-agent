/** 终端友好：标题、围栏代码、分隔线；正文里支持 **粗体** 与 `行内代码`（按行处理）。 */

export type DisplayChunk =
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "txt"; text: string }
  | { type: "code"; lang: string; body: string }
  | { type: "rule" };

export function parseAssistantDisplay(src: string): DisplayChunk[] {
  const chunks: DisplayChunk[] = [];
  const lines = src.split("\n");
  let proseBuf: string[] = [];
  let inFence = false;
  let fenceLang = "";
  let codeBuf: string[] = [];

  const flushProse = () => {
    if (proseBuf.length === 0) return;
    chunks.push({ type: "txt", text: proseBuf.join("\n") });
    proseBuf = [];
  };

  for (const line of lines) {
    if (inFence) {
      if (line.trim().startsWith("```")) {
        chunks.push({ type: "code", lang: fenceLang, body: codeBuf.join("\n") });
        codeBuf = [];
        inFence = false;
        fenceLang = "";
      } else {
        codeBuf.push(line);
      }
      continue;
    }

    if (line.startsWith("```")) {
      flushProse();
      fenceLang = line.slice(3).trim();
      inFence = true;
      continue;
    }

    const hm = /^(#{1,3})\s+(.*)$/.exec(line);
    if (hm) {
      flushProse();
      const level = hm[1]!.length as 1 | 2 | 3;
      chunks.push({ type: "h", level, text: hm[2] ?? "" });
      continue;
    }

    if (/^\s*-{3,}\s*$/.test(line) || /^\s*\*{3,}\s*$/.test(line)) {
      flushProse();
      chunks.push({ type: "rule" });
      continue;
    }

    proseBuf.push(line);
  }

  flushProse();
  if (inFence && codeBuf.length > 0) {
    chunks.push({ type: "code", lang: fenceLang, body: codeBuf.join("\n") });
  }

  return chunks;
}
