import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { SDKImage, SDKUserMessage } from "@cursor/sdk";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export interface PreparedUserPrompt {
  displayText: string;
  sessionText: string;
  message: string | SDKUserMessage;
  imageCount: number;
}

export type PrepareUserPromptResult =
  | { ok: true; prompt: PreparedUserPrompt }
  | { ok: false; error: string };

interface ImageReference {
  raw: string;
  start: number;
  end: number;
}

interface ImageAttachment {
  image: SDKImage;
  label: string;
}

type LoadImageAttachmentResult =
  | { ok: true; attachment: ImageAttachment }
  | { ok: false; error: string };

export function prepareUserPrompt(input: string, cwd: string, systemPrompt?: string): PrepareUserPromptResult {
  const references = extractImageReferences(input);
  const attachments: ImageAttachment[] = [];

  for (const reference of references) {
    const loaded = loadImageAttachment(reference.raw, cwd);
    if (!loaded.ok) return loaded;
    attachments.push(loaded.attachment);
  }

  const textWithoutRefs = removeRanges(input, references).trim();
  const userText = textWithoutRefs || (attachments.length > 0 ? "请根据附件图片回答。" : "");
  if (!userText) return { ok: false, error: "请输入内容，或用 @/path/to/image.png 附加图片。" };

  const messageText = systemPrompt
    ? `[System: ${systemPrompt}]\n\n${userText}`
    : userText;
  const message = attachments.length > 0
    ? { text: messageText, images: attachments.map((attachment) => attachment.image) }
    : messageText;
  const imageLines = attachments.map((attachment) => `[image: ${attachment.label}]`);
  const displayText = [userText, ...imageLines].join("\n");

  return {
    ok: true,
    prompt: {
      displayText,
      sessionText: displayText,
      message,
      imageCount: attachments.length,
    },
  };
}

function extractImageReferences(input: string): ImageReference[] {
  const references: ImageReference[] = [];
  let index = 0;

  while (index < input.length) {
    if (input[index] !== "@" || !isReferenceBoundary(input[index - 1])) {
      index++;
      continue;
    }

    const parsed = parseImageReference(input, index + 1);
    if (!parsed || !isImagePathCandidate(parsed.raw)) {
      index++;
      continue;
    }

    references.push({ raw: parsed.raw, start: index, end: parsed.end });
    index = parsed.end;
  }

  return references;
}

function parseImageReference(input: string, start: number): { raw: string; end: number } | null {
  const quote = input[start];
  if (quote === "\"" || quote === "'") {
    const end = input.indexOf(quote, start + 1);
    if (end === -1) return null;
    return { raw: input.slice(start + 1, end), end: end + 1 };
  }

  let end = start;
  let raw = "";
  while (end < input.length) {
    const char = input[end] ?? "";
    if (/\s/.test(char)) {
      if (input[end - 1] === "\\") {
        raw = `${raw.slice(0, -1)} `;
        end++;
        continue;
      }
      break;
    }
    raw += char;
    end++;
  }

  return raw ? { raw, end } : null;
}

function isReferenceBoundary(char: string | undefined): boolean {
  return char === undefined || /\s|[([{]/.test(char);
}

function isImagePathCandidate(raw: string): boolean {
  const path = pathFromRaw(raw);
  const extension = extensionOf(path);
  return extension in MIME_BY_EXTENSION;
}

function loadImageAttachment(raw: string, cwd: string): LoadImageAttachmentResult {
  const filePath = normalizeImagePath(raw, cwd);
  if (!existsSync(filePath)) {
    return { ok: false, error: `图片不存在：${filePath}` };
  }

  const stats = statSync(filePath);
  if (!stats.isFile()) {
    return { ok: false, error: `图片路径不是文件：${filePath}` };
  }
  if (stats.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: `图片过大：${basename(filePath)} 超过 20MB` };
  }

  const mimeType = MIME_BY_EXTENSION[extensionOf(filePath)];
  if (!mimeType) {
    return { ok: false, error: `不支持的图片格式：${basename(filePath)}` };
  }

  return {
    ok: true,
    attachment: {
      label: basename(filePath),
      image: {
        data: readFileSync(filePath).toString("base64"),
        mimeType,
      },
    },
  };
}

function normalizeImagePath(raw: string, cwd: string): string {
  const path = pathFromRaw(raw);
  return resolve(cwd, path);
}

function pathFromRaw(raw: string): string {
  if (!raw.startsWith("file://")) return raw;

  try {
    return fileURLToPath(raw);
  } catch {
    return raw;
  }
}

function extensionOf(path: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(path);
  return match?.[1]?.toLowerCase() ?? "";
}

function removeRanges(input: string, ranges: ImageReference[]): string {
  if (ranges.length === 0) return input;

  let output = "";
  let cursor = 0;
  for (const range of ranges) {
    output += input.slice(cursor, range.start);
    cursor = range.end;
  }
  output += input.slice(cursor);
  return output.replace(/[ \t]{2,}/g, " ");
}
