import "server-only";

import crypto from "node:crypto";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { decryptJson, encryptJson } from "@/app/_lib/server/secureTokens";

export type OneDriveOAuthTokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at: string; // ISO
  scope?: string;
  token_type?: string;
};

type StoredOneDriveTokenDoc = {
  provider: "oneDrive";
  encrypted: string;
  updatedAt: string;
};

type PendingAuthStateDoc = {
  uid: string;
  codeVerifier: string;
  createdAt: string;
};

const TOKEN_DOC_PATH = { col: "settings", doc: "integrations" } as const;
const TOKEN_FIELD = "oneDrive" as const;

export function newPkceVerifier(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function saveOneDriveAuthState(args: {
  state: string;
  uid: string;
  codeVerifier: string;
}): Promise<void> {
  const db = getAdminFirestore();
  const ref = db.collection("onedriveAuthStates").doc(args.state);
  const doc: PendingAuthStateDoc = {
    uid: args.uid,
    codeVerifier: args.codeVerifier,
    createdAt: new Date().toISOString(),
  };
  await ref.set(doc);
}

export async function consumeOneDriveAuthState(state: string): Promise<PendingAuthStateDoc | null> {
  const db = getAdminFirestore();
  const ref = db.collection("onedriveAuthStates").doc(state);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<PendingAuthStateDoc> | undefined;
  try {
    await ref.delete();
  } catch {
    /* ignore */
  }
  if (!data || typeof data.uid !== "string" || typeof data.codeVerifier !== "string") return null;
  return {
    uid: data.uid,
    codeVerifier: data.codeVerifier,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
  };
}

export async function setOneDriveTokenSet(tokenSet: OneDriveOAuthTokenSet): Promise<void> {
  const db = getAdminFirestore();
  const ref = db.collection(TOKEN_DOC_PATH.col).doc(TOKEN_DOC_PATH.doc);
  const stored: StoredOneDriveTokenDoc = {
    provider: "oneDrive",
    encrypted: encryptJson(tokenSet as unknown as Record<string, unknown>),
    updatedAt: new Date().toISOString(),
  };
  await ref.set({ [TOKEN_FIELD]: stored }, { merge: true });
}

export async function getOneDriveTokenSet(): Promise<OneDriveOAuthTokenSet | null> {
  const db = getAdminFirestore();
  const ref = db.collection(TOKEN_DOC_PATH.col).doc(TOKEN_DOC_PATH.doc);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const raw = (snap.data() as Record<string, unknown> | undefined)?.[TOKEN_FIELD];
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Partial<StoredOneDriveTokenDoc>;
  if (doc.provider !== "oneDrive" || typeof doc.encrypted !== "string") return null;
  const json = decryptJson(doc.encrypted);
  if (!json || typeof json !== "object") return null;
  const o = json as Partial<OneDriveOAuthTokenSet>;
  if (typeof o.access_token !== "string" || typeof o.expires_at !== "string") return null;
  return {
    access_token: o.access_token,
    refresh_token: typeof o.refresh_token === "string" ? o.refresh_token : undefined,
    expires_in: typeof o.expires_in === "number" ? o.expires_in : undefined,
    expires_at: o.expires_at,
    scope: typeof o.scope === "string" ? o.scope : undefined,
    token_type: typeof o.token_type === "string" ? o.token_type : undefined,
  };
}

