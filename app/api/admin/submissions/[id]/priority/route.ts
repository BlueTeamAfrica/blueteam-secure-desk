import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { PriorityLevel } from "@/app/_lib/caseWorkspaceModel";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { logSubmissionAudit } from "@/app/_lib/server/logSubmissionAudit";
import { assertMayMutateSubmission, jsonForbidden, jsonNotFound, loadWorkspaceCaseForSubmission } from "@/app/_lib/server/submissionCaseAccess";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";

type RouteParams = { params: Promise<{ id: string }> };

const PRIORITY_SET = new Set<string>(["low", "normal", "high", "critical"]);

function parsePriority(v: unknown): PriorityLevel | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (!PRIORITY_SET.has(t)) return null;
  return t as PriorityLevel;
}

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    const mutateDenied = assertMayMutateSubmission(role);
    if (mutateDenied) return mutateDenied;
    if (role !== "owner" && role !== "admin") return jsonForbidden();

    const { id } = await context.params;
    if (!id?.trim()) return NextResponse.json({ error: "Missing submission id" }, { status: 400 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const next = parsePriority(typeof body === "object" && body !== null ? (body as { priority?: unknown }).priority : null);
    if (!next) return NextResponse.json({ error: "Invalid priority" }, { status: 400 });

    const workspaceCase = await loadWorkspaceCaseForSubmission(id);
    if (!workspaceCase) return jsonNotFound();

    const current = workspaceCase.priority;
    const db = getAdminFirestore();
    await db.collection("submissions").doc(id).update({
      priority: next,
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      await logSubmissionAudit({
        submissionId: id,
        adminUid: admin.uid,
        adminEmail: admin.adminEmail,
        action: "update_priority",
        details: { from: current, to: next },
      });
    } catch {
      /* audit failure must not block */
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

