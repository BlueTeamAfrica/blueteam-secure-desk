import "server-only";

import { getOneDriveTokenSet, setOneDriveTokenSet } from "@/app/_lib/server/onedriveTokenStore";
import { refreshAccessToken } from "@/app/_lib/server/onedriveOAuth";

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
    await setOneDriveTokenSet(refreshed);
    return refreshed.access_token;
  } catch {
    return null;
  }
}
