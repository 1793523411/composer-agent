const secretKeyPattern =
  "[A-Z0-9_]*(?:API[_-]?KEY|APIKEY|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|ACCESS[_-]?KEY|REFRESH[_-]?TOKEN|AUTH[_-]?TOKEN)[A-Z0-9_]*";

const assignmentSecret = new RegExp(
  String.raw`(\b${secretKeyPattern}\b\s*[=:]\s*)(["']?)([^\s"',}\]]{8,})(\2)`,
  "gi",
);

const jsonSecret = new RegExp(
  String.raw`((?:"|')?${secretKeyPattern}(?:"|')?\s*:\s*)(["'])([^"']{8,})(\2)`,
  "gi",
);

function shouldRedact(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return ![
    "<redacted>",
    "redacted",
    "placeholder",
    "example",
    "your_api_key",
    "your-token",
    "changeme",
  ].includes(normalized);
}

function redactValue(value: string): string {
  return shouldRedact(value) ? "<redacted>" : value;
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      "<redacted-private-key>",
    )
    .replace(assignmentSecret, (_match, prefix: string, quote: string, value: string, closingQuote: string) => {
      return `${prefix}${quote}${redactValue(value)}${closingQuote}`;
    })
    .replace(jsonSecret, (_match, prefix: string, quote: string, value: string, closingQuote: string) => {
      return `${prefix}${quote}${redactValue(value)}${closingQuote}`;
    })
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1<redacted>")
    .replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "<redacted-aws-key>")
    .replace(/\b(?:sk-proj-|sk-ant-|sk-)[A-Za-z0-9_-]{20,}\b/g, "<redacted-secret>")
    .replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, "<redacted-google-api-key>")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "<redacted-github-token>")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{50,}\b/g, "<redacted-github-token>")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "<redacted-slack-token>")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "<redacted-jwt>")
    .replace(
      /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
      "<redacted-private-ip>",
    )
    .replace(
      /\b(?:[a-z0-9-]+\.)+(?:corp|internal|intra|lan|local|byted\.org|bytedance\.net|byteintl\.com)\b/gi,
      "<redacted-internal-host>",
    )
    .replace(/\/Users\/[^/\s"'`<>]+/g, "/Users/<user>")
    .replace(/\b[A-Z]:\\Users\\[^\\\s"'`<>]+/gi, "C:\\Users\\<user>");
}
