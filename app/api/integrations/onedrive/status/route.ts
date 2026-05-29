import { NextRequest, NextResponse } from "next/server";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { requireFirebaseUser } from "@/app/_lib/server/userApiAuth";
import { getOneDriveTokenSet } from "@/app/_lib/server/onedriveTokenStore";

export const runtime = "nodejs";

/**
 * GET /api/integrations/onedrive/status
 *
 * Returns whether the WORKSPACE-level OneDrive token is present and usable.
 * This is the token that background sync operations (stage moves, pull-sync)
 * actually use — not the personal token.
 *
 * Previously this checked the personal token, which created a false "Connected"
 * state: the personal token could exist while the workspace token was never
 * saved (e.g. due to a missing INTEGRATIONS_TOKEN_SECRET env var).
 */
export async function GET(request: NextRequest) {
  const auth = await requireFirebaseUser(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const role = await fetchWorkspaceRole(user.uid);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ connected: false }, { status: 200 });
  }

  try {
    const token = await getOneDriveTokenSet();
    if (!token) {
      return NextResponse.json({ connected: false }, { status: 200 });
    }

    const expiresAt = new Date(token.expires_at).getTime();
    const isUsable = !!token.refresh_token || (!Number.isNaN(expiresAt) && expiresAt > Date.now());

    const accountEmail = (() => {
      // Best-effort: email isn't stored on the workspace token but may be
      // derivable in future. For now return undefined.
      return undefined;
    })();

    return NextResponse.json(
      { connected: isUsable, ...(accountEmail ? { accountEmail } : {}) },
      { status: 200 },
    );
  } catch (e) {
    // Most likely: INTEGRATIONS_TOKEN_SECRET is not set on this environment.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[OneDrive status]", msg);
    return NextResponse.json(
      { connected: false, configError: "Token storage is misconfigured. Check server environment." },
      { status: 200 },
    );
  }
}
