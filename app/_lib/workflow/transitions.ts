import { CASE_STATUS_KEYS, type CaseStatus } from "@/app/_lib/caseWorkspaceModel";

/**
 * Workflow transitions are intentionally permissive right now to preserve current behavior:
 * owners/admins/reviewers can set any status; intake can set a subset via permissions.
 *
 * This module centralizes the transition "shape" so it can be tightened later without
 * scattering rules across UI + API routes.
 */

export const WORKFLOW_STATUSES = CASE_STATUS_KEYS;

const STATUS_SET = new Set<string>(WORKFLOW_STATUSES);

export function isWorkflowStatus(v: unknown): v is CaseStatus {
  return typeof v === "string" && STATUS_SET.has(v);
}

/**
 * Canonical allowed status transitions.
 * For now: allow any status to transition to any other status (including itself),
 * to match the app's current permissive workflow editing behavior.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<CaseStatus, readonly CaseStatus[]>> = (() => {
  const all = [...WORKFLOW_STATUSES] as CaseStatus[];
  const m: Partial<Record<CaseStatus, CaseStatus[]>> = {};
  for (const from of all) m[from] = all;
  return m as Record<CaseStatus, readonly CaseStatus[]>;
})();

export function getAllowedTransitions(fromStatus: CaseStatus): readonly CaseStatus[] {
  return ALLOWED_TRANSITIONS[fromStatus] ?? [];
}

export function canTransitionStatus(fromStatus: CaseStatus, toStatus: CaseStatus): boolean {
  return getAllowedTransitions(fromStatus).includes(toStatus);
}

function devAssertTransitionsCoverAllStatuses() {
  const all = [...WORKFLOW_STATUSES] as CaseStatus[];
  for (const from of all) {
    const targets = ALLOWED_TRANSITIONS[from];
    if (!targets || targets.length === 0) {
      throw new Error(`Workflow transitions missing targets for status: ${from}`);
    }
    for (const t of targets) {
      if (!STATUS_SET.has(t)) {
        throw new Error(`Workflow transitions contain invalid target status: ${String(t)}`);
      }
    }
  }
}

if (process.env.NODE_ENV !== "production") {
  devAssertTransitionsCoverAllStatuses();
}

