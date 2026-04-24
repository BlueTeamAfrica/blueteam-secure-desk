import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { normalizeWorkspaceRole } from "@/app/_lib/rbac";
import { canAssignItem } from "@/app/_lib/workflow/permissions";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { getAdminAuth, getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { logSubmissionAudit } from "@/app/_lib/server/logSubmissionAudit";
import { assertWorkspaceRole, jsonForbidden } from "@/app/_lib/server/submissionCaseAccess";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    const roleDenied = assertWorkspaceRole(role);
    if (roleDenied) return roleDenied;
    if (!canAssignItem(role)) {
      return jsonForbidden();
    }

    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null || !("assigneeUid" in body)) {
      return NextResponse.json({ error: "Missing assigneeUid" }, { status: 400 });
    }
    const assigneeUid = (body as { assigneeUid: unknown }).assigneeUid;
    if (typeof assigneeUid !== "string" || assigneeUid.trim().length === 0) {
      return NextResponse.json({ error: "Invalid assigneeUid" }, { status: 400 });
    }
    const uid = assigneeUid.trim();

    const db = getAdminFirestore();
    const subRef = db.collection("submissions").doc(id);
    const subSnap = await subRef.get();
    if (!subSnap.exists) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const assigneeDoc = await db.collection("users").doc(uid).get();
    if (!assigneeDoc.exists) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const assigneeData = assigneeDoc.data() as Record<string, unknown>;
    const assigneeRole = normalizeWorkspaceRole(assigneeData.role);
    if (!assigneeRole) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    let displayName: string | null =
      typeof assigneeData.displayName === "string" && assigneeData.displayName.trim()
        ? assigneeData.displayName.trim()
        : null;
    let email: string | null =
      typeof assigneeData.email === "string" && assigneeData.email.trim()
        ? assigneeData.email.trim()
        : null;

    try {
      const u = await getAdminAuth().getUser(uid);
      if (!displayName && u.displayName) displayName = u.displayName;
      if (!email && u.email) email = u.email;
    } catch {
      /* Auth user may be missing; still use Firestore-derived label */
    }

    const assignedOwnerName = (displayName || email || uid).trim();

    await subRef.update({
      assignedOwnerId: uid,
      assignedOwnerName,
      assignedOwnerType: "person",
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      await logSubmissionAudit({
        submissionId: id,
        adminUid: admin.uid,
        adminEmail: admin.adminEmail,
        action: "assign_owner",
        details: { assigneeUid: uid, assignedOwnerName },
      });
    } catch {
      /* audit failure must not block assignment */
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("NOT_FOUND") || msg.includes("not-found")) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
