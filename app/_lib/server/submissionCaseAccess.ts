import "server-only";

import { NextResponse } from "next/server";
import type { VerifiedAdmin } from "@/app/_lib/server/adminApiAuth";
import { getAdminAuth, getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { normalizeSubmissionToCase, type WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import {
  canMutateSubmissions,
  mayRunLegacyReviewerStatusApi,
  maySaveReviewerNoteOnCase,
  mayShowDecryptUi,
  type WorkspaceRole,
  type WorkspaceUserContext,
} from "@/app/_lib/rbac";

export function jsonForbidden(): NextResponse {
  return NextResponse.json(
    { error: "You don't have permission to perform this action." },
    { status: 403 },
  );
}

export function jsonNotFound(): NextResponse {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function workspaceUserContextFromAdmin(
  admin: VerifiedAdmin,
): Promise<WorkspaceUserContext> {
  let displayName: string | null = null;
  try {
    const record = await getAdminAuth().getUser(admin.uid);
    displayName = record.displayName ?? null;
  } catch {
    /* Auth record missing — uid/email matching still applies */
  }
  return {
    uid: admin.uid,
    email: admin.adminEmail,
    displayName,
  };
}

export async function loadWorkspaceCaseForSubmission(id: string): Promise<WorkspaceCase | null> {
  const snap = await getAdminFirestore().collection("submissions").doc(id).get();
  const data = snap.data();
  if (!snap.exists || !data) return null;
  return normalizeSubmissionToCase(snap.id, data);
}

export function assertWorkspaceRole(role: WorkspaceRole | null): NextResponse | null {
  if (!role) return jsonForbidden();
  return null;
}

export function assertMayMutateSubmission(role: WorkspaceRole | null): NextResponse | null {
  if (!canMutateSubmissions(role)) return jsonForbidden();
  return null;
}

export function assertMayDecryptSubmission(
  role: WorkspaceRole | null,
  workspaceCase: WorkspaceCase,
  ctx: WorkspaceUserContext,
): NextResponse | null {
  if (!role || !mayShowDecryptUi(role, workspaceCase, ctx)) return jsonForbidden();
  return null;
}

export function assertMaySaveReviewerNote(
  role: WorkspaceRole | null,
  workspaceCase: WorkspaceCase,
  ctx: WorkspaceUserContext,
): NextResponse | null {
  if (!role || !maySaveReviewerNoteOnCase(role, workspaceCase, ctx)) return jsonForbidden();
  return null;
}

export function assertMayRunLegacyReviewerStatus(
  role: WorkspaceRole | null,
  workspaceCase: WorkspaceCase,
  ctx: WorkspaceUserContext,
): NextResponse | null {
  if (!role || !mayRunLegacyReviewerStatusApi(role, workspaceCase, ctx)) return jsonForbidden();
  return null;
}
