import type { SubmissionAttachment } from "@/app/_lib/caseWorkspaceModel";

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function timestampToIsoBestEffort(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "object" && v !== null) {
    const d = v as { toDate?: () => Date; seconds?: number };
    if (typeof d.toDate === "function") {
      try {
        return d.toDate()!.toISOString();
      } catch {
        return null;
      }
    }
    if (typeof d.seconds === "number") {
      try {
        return new Date(d.seconds * 1000).toISOString();
      } catch {
        return null;
      }
    }
  }
  return null;
}

function pickCandidateArray(root: Record<string, unknown>): unknown[] | null {
  const direct =
    root.attachments ??
    root.files ??
    root.uploads ??
    root.media ??
    root.assets ??
    root.evidence ??
    null;
  if (Array.isArray(direct)) return direct;

  const nested = root.payload;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const o = nested as Record<string, unknown>;
    const inner = o.attachments ?? o.files ?? o.uploads ?? o.media ?? o.assets ?? null;
    if (Array.isArray(inner)) return inner;
  }

  return null;
}

function stableIdFromStoragePath(storagePath: string): string {
  // Keep it stable + URL-safe for routing without pulling crypto into client bundles.
  return `path:${encodeURIComponent(storagePath)}`;
}

export function extractSubmissionAttachments(data: unknown): SubmissionAttachment[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const candidate = pickCandidateArray(root);
  if (!candidate) return [];

  return candidate
    .map((entry): SubmissionAttachment | null => {
      if (!entry || typeof entry !== "object") return null;
      const o = entry as Record<string, unknown>;

      const storagePath = str(o.storagePath) ?? str(o.path) ?? str(o.objectPath) ?? str(o.storage_path);
      const name = str(o.name) ?? str(o.filename) ?? str(o.fileName) ?? str(o.file_name);
      if (!storagePath || !name) return null;

      const id =
        str(o.id) ?? str(o.attachmentId) ?? str(o.fileId) ?? str(o.file_id) ?? stableIdFromStoragePath(storagePath);

      const mimeType = str(o.mimeType) ?? str(o.contentType) ?? str(o.type) ?? str(o.mime_type);
      const size = num(o.size) ?? num(o.sizeBytes) ?? num(o.bytes) ?? num(o.size_bytes);
      const uploadedAt =
        str(o.uploadedAt) ??
        str(o.uploaded_at) ??
        timestampToIsoBestEffort(o.uploadedAt) ??
        timestampToIsoBestEffort(o.uploaded_at);

      const downloadUrl = str(o.downloadUrl) ?? str(o.url) ?? null;

      return {
        id,
        name,
        mimeType,
        size,
        storagePath,
        uploadedAt,
        downloadUrl,
        raw: entry,
      };
    })
    .filter((x): x is SubmissionAttachment => x !== null);
}

