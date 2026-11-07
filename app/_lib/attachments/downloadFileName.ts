/**
 * File name for an attachment download: the reporter's original name (Arabic included), made
 * safe for a Content-Disposition header. Stored objects are named `<attachmentId>.<ext>`
 * (app >= test-0.8) or `<attachmentId>_<ASCII-sanitised name>` (older), so the object's own
 * name is never what the editor should see. Pure.
 *
 * Returns null when there is no usable name: the caller then signs the URL without a download
 * name, which is how every download worked before.
 */
const MAX_LENGTH = 150;

export function attachmentDownloadName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, "") // control characters
    .replace(/[\\/]/g, "_") // no path separators
    .replace(/["]/g, "'") // keeps the header's quoted filename intact
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return null;
  return [...cleaned].slice(0, MAX_LENGTH).join("");
}
