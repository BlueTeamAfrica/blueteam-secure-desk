import { NextRequest, NextResponse } from "next/server";
import { canAssignCasesInWorkspace, normalizeWorkspaceRole } from "@/app/_lib/rbac";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { getAdminAuth, getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { assertWorkspaceRole, jsonForbidden } from "@/app/_lib/server/submissionCaseAccess";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { isWorkspaceUserActive, type WorkspaceUserProfile } from "@/app/_lib/workspace/userProfile";

export type WorkspaceMemberDto = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
};

/**
 * Lists workspace members from Firestore `users` (document id = Auth UID), enriched with Auth profile when needed.
 * Only owner/admin may load the assignee picker.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;

    const role = await fetchWorkspaceRole(auth.admin.uid);
    const roleDenied = assertWorkspaceRole(role);
    if (roleDenied) return roleDenied;
    if (!canAssignCasesInWorkspace(role)) {
      return jsonForbidden();
    }

    const db = getAdminFirestore();
    const adminAuth = getAdminAuth();
    const snap = await db.collection("users").get();

    const members: WorkspaceMemberDto[] = [];

    for (const doc of snap.docs) {
      const uid = doc.id;
      const data = doc.data() as WorkspaceUserProfile;
      if (!isWorkspaceUserActive(data)) continue;
      const r = normalizeWorkspaceRole(data.role);
      if (!r) continue;

      let email: string | null = typeof data.email === "string" && data.email.trim() ? data.email.trim() : null;
      let displayName: string | null =
        typeof data.displayName === "string" && data.displayName.trim() ? data.displayName.trim() : null;

      try {
        const u = await adminAuth.getUser(uid);
        if (!email && u.email) email = u.email;
        if (!displayName && u.displayName) displayName = u.displayName;
      } catch {
        /* user missing from Auth — still list if Firestore row is enough */
      }

      members.push({
        uid,
        email,
        displayName,
        role: r,
      });
    }

    members.sort((a, b) => {
      const la = (a.displayName || a.email || a.uid).toLowerCase();
      const lb = (b.displayName || b.email || b.uid).toLowerCase();
      return la.localeCompare(lb);
    });

    return NextResponse.json({ members });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
