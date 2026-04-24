import type { CaseStatus, WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import type { WorkspaceUserContext } from "@/app/_lib/rbac";
import { WORKFLOW_STATUSES, canTransitionStatus, getAllowedTransitions } from "@/app/_lib/workflow/transitions";
import { canAssignItem, canDeleteItem, mayExportSubmissionDocx } from "@/app/_lib/workflow/permissions";

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
  if (canAssignItem("reviewer")) fail("reviewer should not assign");
  if (canAssignItem("intake")) fail("intake should not assign");
  if (!canAssignItem("admin")) fail("admin should assign");
  if (!canAssignItem("owner")) fail("owner should assign");

  if (!canDeleteItem("owner")) fail("owner should delete");
  if (!canDeleteItem("admin")) fail("admin should delete");
  if (canDeleteItem("reviewer")) fail("reviewer should not delete");
  if (canDeleteItem("intake")) fail("intake should not delete");

  const ctx: WorkspaceUserContext = { uid: "u1", email: "a@b.c", displayName: "A" };
  const baseCase = { status: "new" } as WorkspaceCase;
  if (!mayExportSubmissionDocx({ role: "owner", workspaceCase: baseCase, ctx }))
    fail("owner should export");
  if (mayExportSubmissionDocx({ role: "readonly", workspaceCase: baseCase, ctx }))
    fail("readonly should not export");

  flush();
}

if (process.env.NODE_ENV !== "production") {
  // Run on import in dev/test builds only.
  runWorkflowSelfCheck();
}

