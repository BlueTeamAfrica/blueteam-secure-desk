import "server-only";

import type { OneDriveOAuthTokenSet } from "@/app/_lib/server/onedriveTokenStore";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`${name} must be set for OneDrive integration.`);
  }
  return v.trim();
}

export function getMicrosoftOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tenant: string;
} {
  const clientId = requireEnv("ONEDRIVE_CLIENT_ID");
  const clientSecret = requireEnv("ONEDRIVE_CLIENT_SECRET");
  const redirectUri = requireEnv("ONEDRIVE_REDIRECT_URI");
  const tenant = (process.env.ONEDRIVE_TENANT ?? "common").trim() || "common";
  return { clientId, clientSecret, redirectUri, tenant };
}

export function buildMicrosoftAuthorizeUrl(args: {
  state: string;
  codeChallenge: string;
  scopes: string[];
}): string {
  const { clientId, redirectUri, tenant } = getMicrosoftOAuthConfig();
  const base = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`;
  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("response_type", "code");
  params.set("redirect_uri", redirectUri);
  params.set("response_mode", "query");
  params.set("scope", args.scopes.join(" "));
  params.set("state", args.state);
  params.set("code_challenge", args.codeChallenge);
  params.set("code_challenge_method", "S256");
  return `${base}?${params.toString()}`;
}

export async function exchangeAuthCodeForTokens(args: {
  code: string;
  codeVerifier: string;
}): Promise<OneDriveOAuthTokenSet> {
  const { clientId, clientSecret, redirectUri, tenant } = getMicrosoftOAuthConfig();
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("grant_type", "authorization_code");
  body.set("code", args.code);
  body.set("redirect_uri", redirectUri);
  body.set("code_verifier", args.codeVerifier);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) {
    const msg = typeof json?.error_description === "string" ? json.error_description : "OAuth token exchange failed.";
    throw new Error(msg);
  }
  const access_token = typeof json.access_token === "string" ? json.access_token : null;
  if (!access_token) throw new Error("OAuth response missing access_token.");
  const refresh_token = typeof json.refresh_token === "string" ? json.refresh_token : undefined;
  const expires_in = typeof json.expires_in === "number" ? json.expires_in : undefined;
  const scope = typeof json.scope === "string" ? json.scope : undefined;
  const token_type = typeof json.token_type === "string" ? json.token_type : undefined;
  const expires_at = new Date(Date.now() + Math.max(30, expires_in ?? 3600) * 1000).toISOString();
  return { access_token, refresh_token, expires_in, expires_at, scope, token_type };
}

export async function refreshAccessToken(refreshToken: string): Promise<OneDriveOAuthTokenSet> {
  const { clientId, clientSecret, redirectUri, tenant } = getMicrosoftOAuthConfig();
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  body.set("redirect_uri", redirectUri);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) {
    const msg = typeof json?.error_description === "string" ? json.error_description : "OAuth refresh failed.";
    throw new Error(msg);
  }
  const access_token = typeof json.access_token === "string" ? json.access_token : null;
  if (!access_token) throw new Error("OAuth response missing access_token.");
  const refresh_token = typeof json.refresh_token === "string" ? json.refresh_token : refreshToken;
  const expires_in = typeof json.expires_in === "number" ? json.expires_in : undefined;
  const scope = typeof json.scope === "string" ? json.scope : undefined;
  const token_type = typeof json.token_type === "string" ? json.token_type : undefined;
  const expires_at = new Date(Date.now() + Math.max(30, expires_in ?? 3600) * 1000).toISOString();
  return { access_token, refresh_token, expires_in, expires_at, scope, token_type };
}

