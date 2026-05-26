import "server-only";

import { getOneDriveTokenSet, setOneDriveTokenSet } from "@/app/_lib/server/onedriveTokenStore";
import { refreshAccessToken } from "@/app/_lib/server/microsoftDelegatedOAuth";

/**
 * Returns a valid access token for the workspace-level OneDrive integration.
 * Automatically refreshes using the stored refresh token when the access token
 * is within 60 seconds of expiry.
 *
 * Returns null when:
 * - No token is stored (OneDrive not connected for this workspace).
 * - The token has expired and no refresh token is available.
 * - The refresh call fails.
 */
export async function getValidWorkspaceAccessToken(): Promise<string | null> {
  const token = await getOneDriveTokenSet();
  if (!token) return null;

  const expiresAt = new Date(token.expires_at).getTime();
  const needsRefresh = Number.isNaN(expiresAt) || expiresAt < Date.now() + 60_000;

  if (!needsRefresh) return token.access_token;

  if (!token.refresh_token) return null;

  try {
    const refreshed = await refreshAccessToken(token.refresh_token);
    // microsoftDelegatedOAuth returns camelCase; onedriveTokenStore expects snake_case.
    const expiresAt = new Date(
      Date.now() + Math.max(30, refreshed.expiresIn ?? 3600) * 1000,
    ).toISOString();
    const tokenSet = {
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken ?? token.refresh_token,
      expires_in: refreshed.expiresIn,
      expires_at: expiresAt,
      scope: refreshed.scope,
      token_type: refreshed.tokenType,
    };
    await setOneDriveTokenSet(tokenSet);
    return tokenSet.access_token;
  } catch {
    return null;
  }
}
