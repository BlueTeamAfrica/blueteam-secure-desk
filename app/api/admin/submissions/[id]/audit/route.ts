import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { canAccessCaseData } from "@/app/_lib/rbac";
import { jsonForbidden, jsonNotFound, loadWorkspaceCaseForSubmission } from "@/app/_lib/server/submissionCaseAccess";
import type { Firestore } from "firebase-admin/firestore";

type RouteParams = { params: Promise<{ id: string }> };

function toIso(v: unknown): string | null {
  // Firestore admin Timestamp has toDate().
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    const d = (v as { toDate: () => Date }).toDate();
    const ms = d.getTime();
    if (Number.isNaN(ms)) return null;
    return d.toISOString();
  }
  return null;
}

async function fetchAuditEvents(db: Firestore, submissionId: string) {
  // Primary query: filter by submissionId and order by createdAt (best UX).
  // This can fail in some environments if the required composite index is missing.
  try {
    return await db
      .collection("submissionAudit")
      .where("submissionId", "==", submissionId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const looksLikeIndexError =
      msg.includes("FAILED_PRECONDITION") ||
      msg.toLowerCase().includes("requires an index") ||
      msg.toLowerCase().includes("create index");
    if (!looksLikeIndexError) throw e;

    // Fallback: no orderBy. Still returns recent-ish docs if writes were roughly sequential.
    // Most importantly: keeps the Desk Log from hard-failing when indexes aren't configured yet.
    return await db
      .collection("submissionAudit")
      .where("submissionId", "==", submissionId)
      .limit(50)
      .get();
  }
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    if (!canAccessCaseData(role)) return jsonForbidden();

    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Missing submission id" }, { status: 400 });
    }

    const workspaceCase = await loadWorkspaceCaseForSubmission(id);
    if (!workspaceCase) return jsonNotFound();

    const db = getAdminFirestore();
    let snap;
    try {
      snap = await fetchAuditEvents(db, id);
    } catch (e) {
      // Never crash the detail panel for audit log issues.
      console.warn("[audit-route] failed to load submissionAudit events", {
        submissionId: id,
        error: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json(
        { events: [], warning: "Activity is temporarily unavailable." },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const events = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        action: typeof data.action === "string" ? data.action : "unknown",
        adminUid: typeof data.adminUid === "string" ? data.adminUid : null,
        adminEmail: typeof data.adminEmail === "string" ? data.adminEmail : null,
        createdAt: toIso(data.createdAt),
        details: typeof data.details === "object" && data.details !== null ? data.details : null,
      };
    });

    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

