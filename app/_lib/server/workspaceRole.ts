import "server-only";

import type { WorkspaceRole } from "@/app/_lib/rbac";
import { normalizeWorkspaceRole } from "@/app/_lib/rbac";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { isWorkspaceUserActive, type WorkspaceUserProfile } from "@/app/_lib/workspace/userProfile";

export async function fetchWorkspaceRole(uid: string): Promise<WorkspaceRole | null> {
  const snap = await getAdminFirestore().collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() as WorkspaceUserProfile | undefined;
  if (!isWorkspaceUserActive(data)) return null;
  return normalizeWorkspaceRole(data?.role);
}
