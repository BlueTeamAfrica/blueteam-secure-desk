import "server-only";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export type GraphFileItem = {
  id: string;
  name: string;
  webUrl: string | null;
};

/**
 * Encode a drive-relative path for the Graph API.
 * Each path segment is percent-encoded but slashes are preserved as separators.
 * e.g. "Atar Editorial/Editorial - Arabic/incoming" → "Atar%20Editorial/Editorial%20-%20Arabic/incoming"
 */
function encodeDrivePath(path: string): string {
  return path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function extractGraphError(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const err = (json as Record<string, unknown>).error;
  if (!err || typeof err !== "object") return null;
  const msg = (err as Record<string, unknown>).message;
  return typeof msg === "string" ? msg : null;
}

async function parseGraphJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * Upload file bytes to a specific path in /me/drive (creates or replaces).
 * Returns the Graph API item (id + webUrl).
 *
 * Uses the simple upload endpoint — suitable for files under ~4 MB.
 * For larger files a resumable upload session would be needed.
 */
export async function graphUploadFile(args: {
  accessToken: string;
  /** Drive-relative path including filename, e.g. "Editorial - Arabic/incoming/file.docx" */
  drivePath: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<GraphFileItem> {
  const encoded = encodeDrivePath(args.drivePath);
  const url = `${GRAPH_BASE}/me/drive/root:/${encoded}:/content`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": args.mimeType,
    },
    body: Buffer.from(args.bytes),
  });

  const json = await parseGraphJson(res);

  if (!res.ok) {
    const msg = extractGraphError(json) ?? `OneDrive upload failed (HTTP ${res.status}).`;
    throw new Error(msg);
  }

  const item = json as Record<string, unknown>;
  if (typeof item.id !== "string") {
    throw new Error("OneDrive upload: response missing item id.");
  }

  return {
    id: item.id,
    name: typeof item.name === "string" ? item.name : args.drivePath.split("/").pop() ?? "file",
    webUrl: typeof item.webUrl === "string" ? item.webUrl : null,
  };
}

/**
 * Fetch item metadata (id, name, webUrl) for a path in /me/drive.
 * Returns null if the path doesn't exist (404).
 */
export async function graphGetItemByPath(args: {
  accessToken: string;
  /** Drive-relative path, e.g. "Editorial - Arabic/incoming" */
  drivePath: string;
}): Promise<GraphFileItem | null> {
  const encoded = encodeDrivePath(args.drivePath);
  const url = `${GRAPH_BASE}/me/drive/root:/${encoded}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  });

  if (res.status === 404) return null;

  const json = await parseGraphJson(res);

  if (!res.ok) {
    const msg = extractGraphError(json) ?? `OneDrive item lookup failed (HTTP ${res.status}).`;
    throw new Error(msg);
  }

  const item = json as Record<string, unknown>;
  if (typeof item.id !== "string") return null;

  return {
    id: item.id,
    name: typeof item.name === "string" ? item.name : "",
    webUrl: typeof item.webUrl === "string" ? item.webUrl : null,
  };
}

/**
 * Fetch item metadata by Graph item ID.
 * Returns null if the item no longer exists (deleted) or on error.
 * Used to distinguish "deleted from OneDrive" from "moved to an untracked folder".
 */
export async function graphGetItemById(args: {
  accessToken: string;
  itemId: string;
}): Promise<GraphFileItem | null> {
  const url = `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(args.itemId)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  });

  if (res.status === 404) return null;

  const json = await parseGraphJson(res);
  if (!res.ok) return null; // treat unexpected errors as "not found" — non-fatal

  const item = json as Record<string, unknown>;
  if (typeof item.id !== "string") return null;

  return {
    id: item.id,
    name: typeof item.name === "string" ? item.name : "",
    webUrl: typeof item.webUrl === "string" ? item.webUrl : null,
  };
}

/**
 * Move an item to a new parent folder and optionally rename it.
 * Requires the destination folder to exist.
 *
 * Workflow:
 *  1. GET the destination folder to obtain its item ID.
 *  2. PATCH the source item with the new parentReference.
 */
export async function graphMoveItemToFolder(args: {
  accessToken: string;
  /** Graph API item ID of the file to move. */
  itemId: string;
  /**
   * Drive-relative path of the destination FOLDER (no filename).
   * e.g. "Editorial - Arabic/raw"
   */
  newFolderPath: string;
  /** Keep the current filename (must be provided to avoid a rename). */
  filename: string;
}): Promise<GraphFileItem> {
  // Resolve destination folder ID — create it if it doesn't exist yet.
  const folder = await graphEnsureFolder({
    accessToken: args.accessToken,
    folderPath: args.newFolderPath,
  });

  const url = `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(args.itemId)}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parentReference: { id: folder.id },
      name: args.filename,
    }),
  });

  const json = await parseGraphJson(res);

  if (!res.ok) {
    const msg = extractGraphError(json) ?? `OneDrive move failed (HTTP ${res.status}).`;
    throw new Error(msg);
  }

  const item = json as Record<string, unknown>;

  return {
    id: typeof item.id === "string" ? item.id : args.itemId,
    name: typeof item.name === "string" ? item.name : args.filename,
    webUrl: typeof item.webUrl === "string" ? item.webUrl : null,
  };
}

/**
 * Ensure a folder exists at `folderPath` in /me/drive, creating it (and any
 * missing parent folders) if it doesn't. Returns the folder item.
 *
 * Uses GET-first, then POST-to-create if 404. If two callers race and both
 * hit 409 on the POST, a second GET is attempted as a fallback.
 */
export async function graphEnsureFolder(args: {
  accessToken: string;
  /** Drive-relative folder path, e.g. "SecureDesk-Test/raw" */
  folderPath: string;
}): Promise<GraphFileItem> {
  // Fast path — folder already exists.
  const existing = await graphGetItemByPath({ accessToken: args.accessToken, drivePath: args.folderPath });
  if (existing) return existing;

  // Split into parent path + folder name.
  const lastSlash = args.folderPath.lastIndexOf("/");
  const parentPath = lastSlash >= 0 ? args.folderPath.slice(0, lastSlash) : "";
  const folderName = lastSlash >= 0 ? args.folderPath.slice(lastSlash + 1) : args.folderPath;

  // Ensure parent exists recursively (noop when parentPath is empty = drive root).
  if (parentPath) {
    await graphEnsureFolder({ accessToken: args.accessToken, folderPath: parentPath });
  }

  const createUrl = parentPath
    ? `${GRAPH_BASE}/me/drive/root:/${encodeDrivePath(parentPath)}:/children`
    : `${GRAPH_BASE}/me/drive/root/children`;

  const res = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });

  // 409 = already exists (race condition) — GET it.
  if (res.status === 409) {
    const retry = await graphGetItemByPath({ accessToken: args.accessToken, drivePath: args.folderPath });
    if (retry) return retry;
    throw new Error(`OneDrive folder creation conflict but folder not found: "${args.folderPath}"`);
  }

  const json = await parseGraphJson(res);
  if (!res.ok) {
    const msg = extractGraphError(json) ?? `OneDrive folder creation failed (HTTP ${res.status}).`;
    throw new Error(msg);
  }

  const item = json as Record<string, unknown>;
  return {
    id: typeof item.id === "string" ? item.id : "",
    name: typeof item.name === "string" ? item.name : folderName,
    webUrl: typeof item.webUrl === "string" ? item.webUrl : null,
  };
}

/**
 * List immediate children (files only — no sub-folders) of a folder path.
 * Returns an empty array if the folder doesn't exist or is empty.
 * Follows @odata.nextLink to return all pages (Graph API caps at 200/page by default).
 */
export async function graphListFolderChildren(args: {
  accessToken: string;
  /** Drive-relative folder path, e.g. "Editorial - Arabic/incoming" */
  folderPath: string;
}): Promise<GraphFileItem[]> {
  const encoded = encodeDrivePath(args.folderPath);
  const results: GraphFileItem[] = [];

  // Request 500 items per page (Graph API max).
  let nextUrl: string | null =
    `${GRAPH_BASE}/me/drive/root:/${encoded}:/children?$select=id,name,webUrl,file&$top=500`;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${args.accessToken}` },
    });

    if (res.status === 404) return results;

    const json = await parseGraphJson(res);
    if (!res.ok) return results;

    const page = json as Record<string, unknown>;
    const value = page?.value;

    if (Array.isArray(value)) {
      for (const raw of value) {
        if (typeof raw !== "object" || raw === null) continue;
        const it = raw as Record<string, unknown>;
        // Include files AND subfolders. Subfolders group DOCX + attachments per
        // submission; files remain for backward-compat with pre-subfolder exports.
        if (!it.file && !it.folder) continue;
        if (typeof it.id !== "string") continue;
        results.push({
          id: it.id,
          name: typeof it.name === "string" ? it.name : "",
          webUrl: typeof it.webUrl === "string" ? it.webUrl : null,
        });
      }
    }

    // Follow the next page link if present.
    const link = page?.["@odata.nextLink"];
    nextUrl = typeof link === "string" ? link : null;
  }

  return results;
}
