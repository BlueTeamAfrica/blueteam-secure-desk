import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { requireFirebaseUser } from "@/app/_lib/server/userApiAuth";
import { buildAuthorizeUrl } from "@/app/_lib/server/microsoftDelegatedOAuth";
import { newPkceVerifier, saveAuthState } from "@/app/_lib/server/personalOneDriveTokenStore";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireFirebaseUser(request);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const role = await fetchWorkspaceRole(user.uid);
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "You don't have permission to connect OneDrive." }, { status: 403 });
    }

    const state = crypto.randomBytes(20).toString("hex");
    const { verifier, challenge } = newPkceVerifier();
    await saveAuthState({ state, uid: user.uid, codeVerifier: verifier });

    const scopes = ["offline_access", "Files.ReadWrite", "User.Read"];
    const url = buildAuthorizeUrl({ state, codeChallenge: challenge, scopes });
    return NextResponse.json({ ok: true, url }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not start OneDrive connection.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

