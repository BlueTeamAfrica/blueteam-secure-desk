import "server-only";

import type { WorkspaceRole } from "@/app/_lib/rbac";
import { normalizeWorkspaceRole } from "@/app/_lib/rbac";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";

export async function fetchWorkspaceRole(uid: string): Promise<WorkspaceRole | null> {
  const db = getAdminFirestore();
  const snap = await db.collection("users").doc(uid).get();

  // TEMPORARY DEBUG: intentionally bypasses "active" validation to confirm server project + doc visibility.
  // Do NOT log payload/body/title or any secrets.
  const data = snap.data() as Record<string, unknown> | undefined;
  console.warn("[ROLE DEBUG]", {
    projectId: process.env.FIREBASE_PROJECT_ID ?? null,
    uid,
    exists: snap.exists,
    role: typeof data?.role === "string" ? data.role : null,
    status: typeof data?.status === "string" ? data.status : null,
    active: data?.active === true || data?.active === "true" ? true : data?.active === false || data?.active === "false" ? false : null,
    enabled: data?.enabled === true ? true : data?.enabled === false ? false : null,
    keys: data ? Object.keys(data).sort().slice(0, 25) : [],
  });

  if (!snap.exists) return null;

  return normalizeWorkspaceRole(data?.role);
}
