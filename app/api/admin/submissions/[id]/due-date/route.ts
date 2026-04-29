import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { logSubmissionAudit } from "@/app/_lib/server/logSubmissionAudit";
import {
  assertMayMutateSubmission,
  jsonForbidden,
  jsonNotFound,
  loadWorkspaceCaseForSubmission,
} from "@/app/_lib/server/submissionCaseAccess";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";

type RouteParams = { params: Promise<{ id: string }> };

function parseDueDate(v: unknown): Date | null {
  if (v === null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  // Accept YYYY-MM-DD (from <input type="date">) or full ISO.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00:00.000Z` : t;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
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

    const raw = typeof body === "object" && body !== null ? (body as { dueDate?: unknown }).dueDate : undefined;
    const nextDate = raw === null ? null : parseDueDate(raw);
    if (raw !== null && !nextDate) return NextResponse.json({ error: "Invalid dueDate" }, { status: 400 });

    const workspaceCase = await loadWorkspaceCaseForSubmission(id);
    if (!workspaceCase) return jsonNotFound();

    const current = (workspaceCase.raw as Record<string, unknown>).dueDate ?? null;
    const db = getAdminFirestore();
    await db.collection("submissions").doc(id).update({
      dueDate: nextDate === null ? null : nextDate,
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      await logSubmissionAudit({
        submissionId: id,
        adminUid: admin.uid,
        adminEmail: admin.adminEmail,
        action: "update_due_date",
        details: { to: nextDate === null ? null : nextDate.toISOString(), from: current },
      });
    } catch {
      /* audit failure must not block */
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

