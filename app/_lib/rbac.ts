/**
 * Workspace RBAC — shared types, navigation policy, and UI permission helpers.
 */

import {
  CASE_STATUS_KEYS,
  type CaseStatus,
  type WorkspaceCase,
} from "@/app/_lib/caseWorkspaceModel";

export const WORKSPACE_ROLES = ["owner", "admin", "reviewer", "intake", "readonly"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

const ROLE_SET = new Set<string>(WORKSPACE_ROLES);

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  reviewer: "Reviewer",
  intake: "Intake",
  readonly: "Read-only",
};

/** Firestore `users/{uid}` role field — string, one of WORKSPACE_ROLES. */
export type UserRoleDocument = {
  role: WorkspaceRole;
  email?: string;
  updatedAt?: unknown;
};

export function normalizeWorkspaceRole(value: unknown): WorkspaceRole | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  if (ROLE_SET.has(t)) return t as WorkspaceRole;
  return null;
}

/** Nav keys matching sidebar routes (case views + analytics + settings). */
export type DashboardNavKey =
  | "inbox"
  | "new"
  | "needs_triage"
  | "assigned"
  | "in_review"
  | "waiting_follow_up"
  | "resolved"
  | "archive"
  | "team"
  | "analytics"
  | "settings";

/** Primary tabs visible for each role (strict UI permissions). */
export const ROLE_NAV: Record<WorkspaceRole, readonly DashboardNavKey[]> = {
  owner: [
    "inbox",
    "new",
    "needs_triage",
    "assigned",
    "in_review",
    "waiting_follow_up",
    "resolved",
    "archive",
    "team",
    "settings",
  ],
  admin: [
    "inbox",
    "new",
    "needs_triage",
    "assigned",
    "in_review",
    "waiting_follow_up",
    "resolved",
    "archive",
    "team",
    "settings",
  ],
  /** Editor desk: full visibility, limited authority. */
  reviewer: [
    "inbox",
    "new",
    "needs_triage",
    "assigned",
    "in_review",
    "waiting_follow_up",
    "resolved",
    "archive",
  ],
  /** Intake desk: full visibility, limited authority. */
  intake: [
    "inbox",
    "new",
    "needs_triage",
    "assigned",
    "in_review",
    "waiting_follow_up",
    "resolved",
    "archive",
  ],
  readonly: ["analytics"],
};

/** Firestore cases + decrypt APIs (not analytics-only). */
export function canAccessCaseData(role: WorkspaceRole | null): boolean {
  if (!role) return false;
  return role !== "readonly";
}

/** Mutations on submissions (reviewer-action API). */
export function canMutateSubmissions(role: WorkspaceRole | null): boolean {
  return canAccessCaseData(role);
}

/** Whether `?view=` is allowed for this role on `/dashboard`. */
export function isDashboardQueryViewAllowed(role: WorkspaceRole, view: string): boolean {
  const keys = ROLE_NAV[role].filter((k) => k !== "settings") as string[];
  return keys.includes(view);
}

export function defaultDashboardViewForRole(role: WorkspaceRole): string {
  if (role === "readonly") return "analytics";
  if (role === "intake") return "inbox";
  if (role === "reviewer") return "inbox";
  return "inbox";
}

export type WorkspaceUserContext = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

/** Assignment match: UID first, then display name / email / local-part vs assignedOwnerName. */
export function isCaseAssignedToWorkspaceUser(
  c: WorkspaceCase,
  ctx: WorkspaceUserContext,
): boolean {
  const ownerId = c.assignedOwnerId?.trim();
  if (ownerId && ownerId === ctx.uid) return true;
  const name = c.assignedOwnerName?.trim();
  if (!name) return false;
  const nl = name.toLowerCase();
  const em = ctx.email?.trim().toLowerCase() ?? "";
  if (em && nl === em) return true;
  const dn = ctx.displayName?.trim().toLowerCase() ?? "";
  if (dn && nl === dn) return true;
  const local = em.includes("@") ? em.slice(0, em.indexOf("@")) : em;
  if (local && nl === local) return true;
  return false;
}

export function filterCasesVisibleToRole(
  role: WorkspaceRole,
  cases: WorkspaceCase[],
  ctx: WorkspaceUserContext,
): WorkspaceCase[] {
  void ctx;
  if (role === "owner" || role === "admin") return cases;
  // Collaborative newsroom: all editor-level roles see all reports.
  if (role === "reviewer" || role === "intake") return cases;
  return cases;
}

export function mayAccessTeamInUi(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

export function mayAccessSettingsInUi(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

export function mayShowDecryptUi(
  role: WorkspaceRole,
  _c: WorkspaceCase,
  _ctx: WorkspaceUserContext,
): boolean {
  void _c;
  void _ctx;
  // Collaborative newsroom: any editor-level user may open filings/attachments.
  return role !== "readonly";
}

export function mayAssignInUi(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

/** Server + API: only these roles may change case assignment. */
export function canAssignCasesInWorkspace(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function mayEditInternalNotesInUi(role: WorkspaceRole): boolean {
  return role !== "readonly";
}

/** Server + client: who may persist `reviewerNote` on a submission. */
export function maySaveReviewerNoteOnCase(
  role: WorkspaceRole,
  _c: WorkspaceCase,
  _ctx: WorkspaceUserContext,
): boolean {
  void _c;
  void _ctx;
  // Collaborative newsroom: editor-level users may add notes on any report.
  return role !== "readonly";
}

/** Legacy reviewer-action mutations (prefer workflow-status for status changes). */
export function mayRunLegacyReviewerStatusApi(
  role: WorkspaceRole,
  _c: WorkspaceCase,
  _ctx: WorkspaceUserContext,
): boolean {
  void _c;
  void _ctx;
  // Authority narrow: only chief roles may run legacy status mutations.
  return role === "owner" || role === "admin";
}

export function mayResolveOrArchiveInUi(
  role: WorkspaceRole,
  _c: WorkspaceCase,
  _ctx: WorkspaceUserContext,
): boolean {
  void _c;
  void _ctx;
  // Authority narrow: only chief roles may publish/archive.
  return role === "owner" || role === "admin";
}

/** Real workflow status control (Firestore-backed). */
export function mayChangeCaseStatusInUi(
  role: WorkspaceRole,
  _c: WorkspaceCase,
  _ctx: WorkspaceUserContext,
): boolean {
  void _c;
  void _ctx;
  if (role === "readonly") return false;
  // Authority narrow: workflow stage changes are chief-only.
  return role === "owner" || role === "admin";
}

/** Approved targets the given role may set from the current case state. */
export function allowedCaseStatusTargets(
  role: WorkspaceRole,
  _current: CaseStatus,
  _c: WorkspaceCase,
  _ctx: WorkspaceUserContext,
): CaseStatus[] {
  void _current;
  void _c;
  void _ctx;
  const all = [...CASE_STATUS_KEYS] as CaseStatus[];
  if (role === "owner" || role === "admin") return all;
  return [];
}

/** Priority scaffold (not wired to backend yet). */
export function mayChangePriorityScaffoldInUi(
  role: WorkspaceRole,
  _c: WorkspaceCase,
  _ctx: WorkspaceUserContext,
): boolean {
  void _c;
  void _ctx;
  // Authority narrow: priority flags are chief-only.
  return role === "owner" || role === "admin";
}

/** @deprecated Use mayChangePriorityScaffoldInUi; kept for call-site clarity. */
export function mayUseCaseWorkflowScaffoldInUi(
  role: WorkspaceRole,
  c: WorkspaceCase,
  ctx: WorkspaceUserContext,
): boolean {
  return mayChangePriorityScaffoldInUi(role, c, ctx);
}
