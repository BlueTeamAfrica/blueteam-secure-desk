import type { WorkspaceCase, CaseStatus } from "@/app/_lib/caseWorkspaceModel";
import type { WorkspaceRole, WorkspaceUserContext } from "@/app/_lib/rbac";
import {
  allowedCaseStatusTargets,
  canAssignCasesInWorkspace,
  canMutateSubmissions,
  isCaseAssignedToWorkspaceUser,
  mayRunLegacyReviewerStatusApi,
  maySaveReviewerNoteOnCase,
} from "@/app/_lib/rbac";
import { canTransitionStatus } from "@/app/_lib/workflow/transitions";
import "@/app/_lib/workflow/selfCheck";

/**
 * Workflow permission helpers.
 *
 * These are thin wrappers around the existing RBAC module today (by design) to keep
 * behavior unchanged while giving the workflow engine a single import surface.
 */

export function canAssignItem(role: WorkspaceRole | null): boolean {
  return canAssignCasesInWorkspace(role);
}

export function canDeleteItem(role: WorkspaceRole | null): boolean {
  // Destructive delete: Editor in Chief only.
  return role === "owner";
}

/**
 * Editorial .docx export — restricted to leadership roles.
 */
export function mayExportSubmissionDocx(args: {
  role: WorkspaceRole | null;
  workspaceCase: WorkspaceCase;
  ctx: WorkspaceUserContext;
}): boolean {
  const { role, workspaceCase, ctx } = args;
  if (!role) return false;
  void workspaceCase;
  void ctx;
  // Export produces a portable newsroom artifact; keep it limited to leadership.
  return role === "owner" || role === "admin";
}

export function canUseReviewerActions(role: WorkspaceRole | null): boolean {
  return canMutateSubmissions(role);
}

export function canViewUnassignedItem(role: WorkspaceRole | null): boolean {
  if (!role) return false;
  // Atar small newsroom: all desk roles (including Viewer) may view lists.
  return true;
}

export function canViewAssignedItem(
  role: WorkspaceRole | null,
  assignedOwnerId: string | null,
  currentUserId: string | null,
): boolean {
  void assignedOwnerId;
  void currentUserId;
  if (!role) return false;
  return true;
}

/**
 * Central workflow status change decision.
 * This keeps current role + assignment behavior by delegating to `allowedCaseStatusTargets`.
 */
export function canChangeWorkflowStatus(args: {
  role: WorkspaceRole | null;
  fromStatus: CaseStatus;
  toStatus: CaseStatus;
  workspaceCase: WorkspaceCase;
  ctx: WorkspaceUserContext;
}): boolean {
  const { role, fromStatus, toStatus, workspaceCase, ctx } = args;
  if (!role) return false;
  if (!canTransitionStatus(fromStatus, toStatus)) return false;
  const allowed = allowedCaseStatusTargets(role, fromStatus, workspaceCase, ctx);
  return allowed.includes(toStatus);
}

/**
 * Reviewer-only visibility helper mirroring the existing assignment matching rules
 * (UID primary, then name/email heuristics).
 */
export function isAssignedToCurrentUser(
  workspaceCase: WorkspaceCase,
  ctx: WorkspaceUserContext,
): boolean {
  return isCaseAssignedToWorkspaceUser(workspaceCase, ctx);
}

export function maySaveReviewerNote(args: {
  role: WorkspaceRole | null;
  workspaceCase: WorkspaceCase;
  ctx: WorkspaceUserContext;
}): boolean {
  const { role, workspaceCase, ctx } = args;
  if (!role) return false;
  return maySaveReviewerNoteOnCase(role, workspaceCase, ctx);
}

export function mayRunLegacyReviewerStatus(args: {
  role: WorkspaceRole | null;
  workspaceCase: WorkspaceCase;
  ctx: WorkspaceUserContext;
}): boolean {
  const { role, workspaceCase, ctx } = args;
  if (!role) return false;
  return mayRunLegacyReviewerStatusApi(role, workspaceCase, ctx);
}

