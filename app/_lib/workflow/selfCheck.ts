import type { CaseStatus, WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import type { WorkspaceRole, WorkspaceUserContext } from "@/app/_lib/rbac";
import { WORKFLOW_STATUSES, canTransitionStatus, getAllowedTransitions } from "@/app/_lib/workflow/transitions";
import {
  canAssignItem,
  canChangeWorkflowStatus,
  canDeleteItem,
  canViewAssignedItem,
  canViewUnassignedItem,
  mayExportSubmissionDocx,
} from "@/app/_lib/workflow/permissions";
import { canAccessCaseData, mayShowDecryptUi } from "@/app/_lib/rbac";

/**
 * Lightweight validation for workflow helpers.
 * This is not a full test framework — it is a small, dev-safe guardrail.
 */
export function runWorkflowSelfCheck() {
  const failures: string[] = [];
  const fail = (msg: string) => failures.push(msg);
  const flush = () => {
    if (failures.length === 0) return;
    // Dev-safe: never crash UI for diagnostic checks.
    console.warn(`[workflow-self-check] ${failures.length} issue(s):\n- ${failures.join("\n- ")}`);
  };

  const all = [...WORKFLOW_STATUSES] as CaseStatus[];
  for (const from of all) {
    const targets = getAllowedTransitions(from);
    if (!Array.isArray(targets) || targets.length === 0) {
      fail(`no transitions from ${from}`);
      continue;
    }
    for (const to of all) {
      if (!canTransitionStatus(from, to)) {
        fail(`expected transition allowed ${from} → ${to}`);
      }
    }
  }

  // Basic role invariants matching current behavior.
  if (canAssignItem("reviewer")) fail("editor should not assign");
  if (canAssignItem("intake")) fail("proofreader should not assign");
  if (!canAssignItem("admin")) fail("admin should assign");
  if (!canAssignItem("owner")) fail("owner should assign");

  if (!canDeleteItem("owner")) fail("owner should delete");
  if (canDeleteItem("admin")) fail("admin should not delete");
  if (canDeleteItem("reviewer")) fail("editor should not delete");
  if (canDeleteItem("intake")) fail("proofreader should not delete");

  const ctx: WorkspaceUserContext = { uid: "u1", email: "a@b.c", displayName: "A" };
  const baseCase = { status: "new" } as WorkspaceCase;
  if (!mayExportSubmissionDocx({ role: "owner", workspaceCase: baseCase, ctx }))
    fail("owner should export");
  if (!mayExportSubmissionDocx({ role: "admin", workspaceCase: baseCase, ctx }))
    fail("admin should export");
  if (mayExportSubmissionDocx({ role: "reviewer", workspaceCase: baseCase, ctx }))
    fail("editor should not export");
  if (mayExportSubmissionDocx({ role: "intake", workspaceCase: baseCase, ctx }))
    fail("proofreader should not export");
  if (mayExportSubmissionDocx({ role: "readonly", workspaceCase: baseCase, ctx })) fail("viewer should not export");

  // Permission matrix invariants (dev guardrails).
  const roles: WorkspaceRole[] = ["owner", "admin", "reviewer", "intake", "readonly"];
  for (const r of roles) {
    if (!canViewUnassignedItem(r)) fail(`${r} should view lists (unassigned)`);
    if (!canViewAssignedItem(r, "u2", "u1")) fail(`${r} should view lists (assigned)`);
    if (!canAccessCaseData(r)) fail(`${r} should view audit (case data access)`);
  }
  if (mayShowDecryptUi("readonly", baseCase, ctx)) fail("viewer should not decrypt/open attachments");
  if (!mayShowDecryptUi("reviewer", baseCase, ctx)) fail("editor should decrypt/open attachments");

  // Stage change expectations (per allowedCaseStatusTargets).
  const from: CaseStatus = "new";
  if (!canChangeWorkflowStatus({ role: "owner", fromStatus: from, toStatus: "archived", workspaceCase: baseCase, ctx }))
    fail("owner should change stage to archive");
  if (!canChangeWorkflowStatus({ role: "admin", fromStatus: from, toStatus: "resolved", workspaceCase: baseCase, ctx }))
    fail("admin should change stage to resolved");
  if (
    canChangeWorkflowStatus({ role: "reviewer", fromStatus: from, toStatus: "resolved", workspaceCase: baseCase, ctx })
  )
    fail("editor should not publish/resolved");
  if (
    canChangeWorkflowStatus({ role: "intake", fromStatus: from, toStatus: "assigned", workspaceCase: baseCase, ctx })
  )
    fail("proofreader should not set assigned");

  flush();
}

if (process.env.NODE_ENV !== "production") {
  // Run on import in dev/test builds only.
  runWorkflowSelfCheck();
}

