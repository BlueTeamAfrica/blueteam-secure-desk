import "server-only";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (typeof v !== "string" || v.trim().length === 0) throw new Error(`${name} must be set for Microsoft OAuth.`);
  return v.trim();
}

export function getMicrosoftDelegatedConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tenantId: string;
} {
  const clientId = requireEnv("MICROSOFT_CLIENT_ID");
  const clientSecret = requireEnv("MICROSOFT_CLIENT_SECRET");
  const redirectUri = requireEnv("MICROSOFT_REDIRECT_URI");
  const tenantId = (process.env.MICROSOFT_TENANT_ID ?? "common").trim() || "common";
  return { clientId, clientSecret, redirectUri, tenantId };
}

export function buildAuthorizeUrl(args: { state: string; codeChallenge: string; scopes: string[] }): string {
  const { clientId, redirectUri, tenantId } = getMicrosoftDelegatedConfig();
  const base = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`;
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

export async function exchangeAuthCode(args: { code: string; codeVerifier: string }): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  tokenType?: string;
}> {
  const { clientId, clientSecret, redirectUri, tenantId } = getMicrosoftDelegatedConfig();
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
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
  const accessToken = typeof json.access_token === "string" ? json.access_token : null;
  if (!accessToken) throw new Error("OAuth response missing access_token.");
  const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : undefined;
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : undefined;
  const scope = typeof json.scope === "string" ? json.scope : undefined;
  const tokenType = typeof json.token_type === "string" ? json.token_type : undefined;
  return { accessToken, refreshToken, expiresIn, scope, tokenType };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  tokenType?: string;
}> {
  const { clientId, clientSecret, redirectUri, tenantId } = getMicrosoftDelegatedConfig();
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
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
  const accessToken = typeof json.access_token === "string" ? json.access_token : null;
  if (!accessToken) throw new Error("OAuth response missing access_token.");
  const nextRefresh = typeof json.refresh_token === "string" ? json.refresh_token : refreshToken;
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : undefined;
  const scope = typeof json.scope === "string" ? json.scope : undefined;
  const tokenType = typeof json.token_type === "string" ? json.token_type : undefined;
  return { accessToken, refreshToken: nextRefresh, expiresIn, scope, tokenType };
}

