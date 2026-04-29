import "server-only";

import crypto from "node:crypto";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { decryptJson, encryptJson } from "@/app/_lib/server/secureTokens";

export type PersonalOneDriveTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string; // ISO
  connectedAt: string; // ISO
  accountEmail?: string;
  providerUserId?: string;
};

type StoredTokenDoc = {
  provider: "oneDrive";
  encrypted: string;
  updatedAt: string;
};

type PendingAuthStateDoc = {
  uid: string;
  codeVerifier: string;
  createdAt: string;
};

export function newPkceVerifier(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function saveAuthState(args: { state: string; uid: string; codeVerifier: string }): Promise<void> {
  const db = getAdminFirestore();
  await db.collection("onedriveAuthStates").doc(args.state).set({
    uid: args.uid,
    codeVerifier: args.codeVerifier,
    createdAt: new Date().toISOString(),
  } satisfies PendingAuthStateDoc);
}

export async function consumeAuthState(state: string): Promise<PendingAuthStateDoc | null> {
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

function tokenRef(uid: string) {
  return getAdminFirestore()
    .collection("integrations")
    .doc("onedrive")
    .collection("users")
    .doc(uid);
}

export async function setPersonalOneDriveToken(uid: string, token: PersonalOneDriveTokenSet): Promise<void> {
  const stored: StoredTokenDoc = {
    provider: "oneDrive",
    encrypted: encryptJson(token),
    updatedAt: new Date().toISOString(),
  };
  await tokenRef(uid).set(stored, { merge: true });
}

export async function getPersonalOneDriveToken(uid: string): Promise<PersonalOneDriveTokenSet | null> {
  const snap = await tokenRef(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<StoredTokenDoc> | undefined;
  if (!data || data.provider !== "oneDrive" || typeof data.encrypted !== "string") return null;
  const json = decryptJson(data.encrypted);
  if (!json || typeof json !== "object") return null;
  const o = json as Partial<PersonalOneDriveTokenSet>;
  if (typeof o.accessToken !== "string" || typeof o.expiresAt !== "string" || typeof o.connectedAt !== "string")
    return null;
  return {
    accessToken: o.accessToken,
    refreshToken: typeof o.refreshToken === "string" ? o.refreshToken : undefined,
    expiresAt: o.expiresAt,
    connectedAt: o.connectedAt,
    accountEmail: typeof o.accountEmail === "string" ? o.accountEmail : undefined,
    providerUserId: typeof o.providerUserId === "string" ? o.providerUserId : undefined,
  };
}

