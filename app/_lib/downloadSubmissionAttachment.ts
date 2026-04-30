/**
 * Client-side helper for securely opening submission attachments.
 *
 * Attachments live in Supabase Storage and are accessed via short-lived signed URLs
 * generated server-side (dashboard never sees the Supabase service role key).
 */

export async function fetchSubmissionAttachmentSignedUrl(args: {
  submissionId: string;
  attachmentId: string;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  onSessionExpired?: () => void | Promise<void>;
}): Promise<{ ok: true; signedUrl: string } | { ok: false; error: string }> {
  const { submissionId, attachmentId, getIdToken, onSessionExpired } = args;

  const url = `/api/admin/submissions/${encodeURIComponent(submissionId)}/attachments/${encodeURIComponent(attachmentId)}/download`;

  async function run(forceRefresh?: boolean) {
    const token = await getIdToken(forceRefresh);
    return await fetch(url, {
      method: "GET",
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

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg =
      res.status === 401
        ? "Your session expired. Please sign in again."
        : res.status === 403
          ? "You don’t have access to this attachment."
          : res.status === 404
            ? "This attachment was not found."
            : typeof body === "object" &&
                body !== null &&
                "error" in body &&
                typeof (body as { error: unknown }).error === "string"
              ? (body as { error: string }).error
              : "Could not open attachment.";
    return { ok: false, error: msg };
  }

  const signedUrl =
    typeof body === "object" &&
    body !== null &&
    "signedUrl" in body &&
    typeof (body as { signedUrl: unknown }).signedUrl === "string"
      ? (body as { signedUrl: string }).signedUrl
      : null;
  if (!signedUrl) return { ok: false, error: "Server returned an unreadable download URL." };

  return { ok: true, signedUrl };
}

export function openSignedUrlInNewTab(signedUrl: string): void {
  window.open(signedUrl, "_blank", "noopener,noreferrer");
}

