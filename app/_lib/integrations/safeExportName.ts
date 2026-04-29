export function safeExportName(input: string, opts?: { maxLen?: number }): string {
  const maxLen = opts?.maxLen ?? 80;
  const raw = (input ?? "").trim();
  const cleaned = raw
    .normalize("NFKD")
    // Replace path separators and other illegal filename characters.
    .replace(/[\\/:*?"<>|]+/g, " ")
    // Collapse whitespace.
    .replace(/\s+/g, " ")
    // Keep a conservative set of punctuation.
    .replace(/[^a-zA-Z0-9 .,_\-()[\]{}]+/g, "")
    .trim();
  const base = cleaned || "export";
  if (base.length <= maxLen) return base;
  return base.slice(0, Math.max(1, maxLen)).trim();
}

