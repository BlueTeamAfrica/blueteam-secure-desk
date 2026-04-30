"use client";

export async function fetchOneDriveStatus(args: {
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  onSessionExpired?: () => void | Promise<void>;
}): Promise<{ ok: true; connected: boolean; accountEmail?: string } | { ok: false; error: string }> {
  try {
    const run = async (forceRefresh?: boolean) => {
      const token = await args.getIdToken(forceRefresh);
      return await fetch("/api/integrations/onedrive/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
    };

    let res = await run(false);
    if (res.status === 401) {
      res = await run(true);
      if (res.status === 401) await args.onSessionExpired?.();
    }
    const body = (await res.json().catch(() => null)) as { connected?: unknown; accountEmail?: unknown } | null;
    if (!res.ok) return { ok: false, error: "Could not check OneDrive status." };
    const accountEmail = typeof body?.accountEmail === "string" ? body.accountEmail : undefined;
    return { ok: true, connected: body?.connected === true, ...(accountEmail ? { accountEmail } : {}) };
  } catch {
    return { ok: false, error: "Network error while checking OneDrive." };
  }
}

export async function startOneDriveConnect(args: {
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  onSessionExpired?: () => void | Promise<void>;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const run = async (forceRefresh?: boolean) => {
      const token = await args.getIdToken(forceRefresh);
      return await fetch("/api/integrations/onedrive/connect", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
    };

    let res = await run(false);
    if (res.status === 401) {
      res = await run(true);
      if (res.status === 401) await args.onSessionExpired?.();
    }
    const body = (await res.json().catch(() => null)) as { url?: unknown; error?: unknown } | null;
    if (!res.ok) {
      const msg = typeof body?.error === "string" ? body.error : "Could not start OneDrive connection.";
      return { ok: false, error: msg };
    }
    const url = typeof body?.url === "string" ? body.url : null;
    if (!url) return { ok: false, error: "Server did not return an authorization URL." };
    return { ok: true, url };
  } catch {
    return { ok: false, error: "Network error while connecting OneDrive." };
  }
}

export async function exportSubmissionToOneDrive(args: {
  submissionId: string;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  onSessionExpired?: () => void | Promise<void>;
}): Promise<{ ok: true; webUrl: string | null } | { ok: false; error: string }> {
  try {
    const url = `/api/admin/submissions/${encodeURIComponent(args.submissionId)}/export-onedrive`;
    const run = async (forceRefresh?: boolean) => {
      const token = await args.getIdToken(forceRefresh);
      return await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    };

    let res = await run(false);
    if (res.status === 401) {
      res = await run(true);
      if (res.status === 401) await args.onSessionExpired?.();
    }
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      const msg =
        typeof body === "object" && body !== null && "error" in body && typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : res.status === 401
            ? "Your session expired. Please sign in again."
          : res.status === 409
            ? "OneDrive is not connected yet."
            : "OneDrive upload failed.";
      return { ok: false, error: msg };
    }
    const webUrl =
      typeof body === "object" && body !== null && "webUrl" in body
        ? (() => {
            const v = (body as { webUrl?: unknown }).webUrl;
            return typeof v === "string" || v === null ? v : null;
          })()
        : null;
    return { ok: true, webUrl };
  } catch {
    return { ok: false, error: "Network error while uploading to OneDrive." };
  }
}

