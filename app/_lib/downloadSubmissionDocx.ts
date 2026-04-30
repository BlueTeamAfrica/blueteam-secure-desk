/**
 * Client-side helpers for downloading submission .docx exports (used from dashboard views).
 */

export function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/^"+|"+$/g, ""));
    } catch {
      return null;
    }
  }
  const q = header.match(/filename="((?:[^"\\]|\\.)*)"/i);
  if (q?.[1]) {
    return q[1].replace(/\\"/g, '"');
  }
  return null;
}

export async function fetchSubmissionDocxDownload(args: {
  submissionId: string;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  onSessionExpired?: () => void | Promise<void>;
}): Promise<{ ok: true; blob: Blob; filename: string } | { ok: false; error: string }> {
  const { submissionId, getIdToken, onSessionExpired } = args;
  const url = `/api/admin/submissions/${encodeURIComponent(submissionId)}/export-docx`;

  async function run(forceRefresh?: boolean) {
    const token = await getIdToken(forceRefresh);
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  let res = await run(false);
  if (res.status === 401) {
    res = await run(true);
    if (res.status === 401) {
      await onSessionExpired?.();
    }
  }
  const disposition = res.headers.get("content-disposition");
  const filename =
    parseFilenameFromContentDisposition(disposition) ?? `Secure-Reporter-${submissionId}.docx`;

  if (!res.ok) {
    const ct = res.headers.get("content-type") ?? "";
    let error = "Export failed.";
    if (ct.includes("application/json")) {
      try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body.error === "string") error = body.error;
      } catch {
        /* ignore */
      }
    } else if (res.status === 401) {
      error = "Your session expired. Please sign in again.";
    } else if (res.status === 403) {
      error = "You don't have permission to export this report.";
    } else if (res.status === 404) {
      error = "This submission was not found.";
    }
    return { ok: false, error };
  }

  const blob = await res.blob();
  return { ok: true, blob, filename };
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
