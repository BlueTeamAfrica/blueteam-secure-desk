import "server-only";

import type { WorkspaceRole } from "@/app/_lib/rbac";
import { normalizeWorkspaceRole } from "@/app/_lib/rbac";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";

export async function fetchWorkspaceRole(uid: string): Promise<WorkspaceRole | null> {
  const snap = await getAdminFirestore().collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return normalizeWorkspaceRole(snap.data()?.role);
}
