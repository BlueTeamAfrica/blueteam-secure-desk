import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { getWorkspaceConfig } from "@/app/_lib/org/getWorkspaceConfig";
import { getOneDriveTokenSet } from "@/app/_lib/server/onedriveTokenStore";
import { getValidWorkspaceAccessToken } from "@/app/_lib/server/workspaceOneDriveToken";
import { graphListFolderChildren } from "@/app/_lib/server/workspaceOneDriveGraph";
import { safeExportName } from "@/app/_lib/integrations/safeExportName";

export const runtime = "nodejs";

/**
 * GET /api/admin/onedrive/test
 *
 * Diagnostic endpoint — runs each step of the OneDrive integration and
 * returns a structured report so we can pinpoint exactly where it breaks.
 * Owner/admin only. Remove or gate behind a flag before sharing externally.
 */
export async function GET(request: NextRequest) {
  // In production always require auth. In dev allow unauthenticated for local diagnosis.
  if (process.env.NODE_ENV !== "development") {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
  }

  const report: Record<string, unknown> = {};

  // Step 1: required env vars
  report.env = {
    INTEGRATIONS_TOKEN_SECRET: !!process.env.INTEGRATIONS_TOKEN_SECRET,
    MICROSOFT_CLIENT_ID: !!process.env.MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET: !!process.env.MICROSOFT_CLIENT_SECRET,
    MICROSOFT_REDIRECT_URI: process.env.MICROSOFT_REDIRECT_URI ?? "(not set)",
    MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID ?? "(not set)",
  };
  // Legacy flag kept for compatibility
  report.INTEGRATIONS_TOKEN_SECRET_set = !!process.env.INTEGRATIONS_TOKEN_SECRET;

  // Step 2: workspace config
  const cfg = getWorkspaceConfig().integrations;
  report.exportProvider = cfg.exportProvider;
  report.oneDriveEnabled = cfg.oneDrive?.enabled ?? false;
  report.oneDriveRootFolder = cfg.oneDrive?.rootFolderName ?? null;
  report.isOneDriveEnabled =
    cfg.exportProvider === "oneDrive" || cfg.oneDrive?.enabled === true;

  // Step 3: raw token doc (can we read/decrypt it?)
  try {
    const raw = await getOneDriveTokenSet();
    if (!raw) {
      report.tokenStore = "missing — no document at settings/integrations.oneDrive";
    } else {
      report.tokenStore = "ok";
      report.tokenExpiresAt = raw.expires_at;
      report.tokenExpired = new Date(raw.expires_at).getTime() < Date.now();
      report.hasRefreshToken = !!raw.refresh_token;
    }
  } catch (e) {
    report.tokenStore = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Step 4: valid access token (auto-refresh)
  let accessToken: string | null = null;
  try {
    accessToken = await getValidWorkspaceAccessToken();
    report.accessToken = accessToken ? "obtained" : "null — not connected or refresh failed";
  } catch (e) {
    report.accessToken = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Step 5: if we have a token, probe the root folder
  if (accessToken && cfg.oneDrive?.rootFolderName) {
    const root = safeExportName(cfg.oneDrive.rootFolderName, { maxLen: 128 });
    try {
      const children = await graphListFolderChildren({
        accessToken,
        folderPath: root,
      });
      report.rootFolderProbe = `ok — ${children.length} item(s) in "${root}"`;
    } catch (e) {
      report.rootFolderProbe = `error: ${e instanceof Error ? e.message : String(e)}`;
    }

    // Step 6: probe each stage folder
    const stageFolderMap = cfg.oneDrive.stageFolderMap ?? {};
    const stageProbes: Record<string, unknown> = {};
    for (const [stage, folderName] of Object.entries(stageFolderMap)) {
      const safeName = safeExportName(folderName, { maxLen: 60 });
      const folderPath = `${root}/${safeName}`;
      try {
        const children = await graphListFolderChildren({ accessToken, folderPath });
        stageProbes[stage] = `ok (${children.length} file(s)) → "${folderPath}"`;
      } catch (e) {
        stageProbes[stage] = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    report.stageFolders = stageProbes;
  }

  return NextResponse.json(report, { status: 200 });
}
