import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthCode } from "@/app/_lib/server/microsoftDelegatedOAuth";
import { consumeAuthState, setPersonalOneDriveToken } from "@/app/_lib/server/personalOneDriveTokenStore";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    const msg = errorDescription || "OneDrive connection was cancelled.";
    return NextResponse.redirect(new URL(`/settings?onedrive=error&msg=${encodeURIComponent(msg)}`, url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?onedrive=error&msg=Missing%20OAuth%20code", url));
  }

  try {
    const pending = await consumeAuthState(state);
    if (!pending) {
      return NextResponse.redirect(new URL("/settings?onedrive=error&msg=Invalid%20OAuth%20state", url));
    }

    const token = await exchangeAuthCode({ code, codeVerifier: pending.codeVerifier });
    const expiresAt = new Date(Date.now() + Math.max(30, token.expiresIn ?? 3600) * 1000).toISOString();

    // Fetch account identity for display (email/id), without storing raw tokens client-side.
    let accountEmail: string | undefined;
    let providerUserId: string | undefined;
    try {
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      const me = (await meRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (me && typeof me.id === "string") providerUserId = me.id;
      const email = typeof me?.mail === "string" ? me.mail : typeof me?.userPrincipalName === "string" ? me.userPrincipalName : null;
      if (email) accountEmail = email;
    } catch {
      /* ignore */
    }

    await setPersonalOneDriveToken(pending.uid, {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt,
      connectedAt: new Date().toISOString(),
      accountEmail,
      providerUserId,
    });

    return NextResponse.redirect(new URL("/settings?onedrive=connected", url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not connect OneDrive.";
    return NextResponse.redirect(new URL(`/settings?onedrive=error&msg=${encodeURIComponent(msg)}`, url));
  }
}

