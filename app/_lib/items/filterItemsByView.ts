import type { WorkspaceCase, CaseStatus } from "@/app/_lib/caseWorkspaceModel";
import type { WorkspaceRole, WorkspaceUserContext } from "@/app/_lib/rbac";
import { filterCasesVisibleToRole, isCaseAssignedToWorkspaceUser } from "@/app/_lib/rbac";

export type DashboardViewKey =
  | "activeReports"
  | "inbox"
  | "needs_lead"
  | "assigned_work"
  | "new"
  | "needsTriage"
  | "needs_triage"
  | "withLead"
  | "assigned"
  | "inReview"
  | "in_review"
  | "awaitingFollowUp"
  | "waiting_follow_up"
  | "resolved"
  | "archive"
  | "myQueue"
  | "yourQueue"
  | "team"
  | "analytics";

function hasOwner(c: WorkspaceCase): boolean {
  return (
    (c.assignedOwnerId !== null && c.assignedOwnerId.trim() !== "") ||
    (c.assignedOwnerName !== null && c.assignedOwnerName.trim() !== "")
  );
}

function normalizeView(raw: string | null | undefined): DashboardViewKey {
  const v = (raw ?? "").trim();
  if (!v) return "inbox";

  // Accept both old internal keys and newer label-ish keys.
  const t = v.replace(/[\s-]+/g, "_");
  switch (t) {
    case "activeReports":
    case "active_reports":
      return "activeReports";
    case "needsTriage":
    case "needs_triage":
      return "needs_triage";
    case "withLead":
    case "with_lead":
      return "withLead";
    case "needs_lead":
    case "needslead":
    case "unassigned":
      return "needs_lead";
    case "assigned_work":
    case "assignedwork":
      return "assigned_work";
    case "inReview":
    case "in_review":
      return "in_review";
    case "awaitingFollowUp":
    case "awaiting_follow_up":
    case "waiting_follow_up":
      return "waiting_follow_up";
    case "myQueue":
    case "my_queue":
    case "yourQueue":
    case "your_queue":
      return t === "your_queue" || t === "yourQueue" ? "yourQueue" : "myQueue";
    case "archive":
      return "archive";
    case "analytics":
      return "analytics";
    case "team":
      return "team";
    case "resolved":
      return "resolved";
    // Atar workflow aliases (query param friendly).
    case "raw":
    case "raw_materials":
      return "new";
    case "edit1":
    case "first_editing":
      return "needs_triage";
    case "edit2":
    case "second_editing":
      return "assigned";
    case "proof":
    case "proofreading":
      return "in_review";
    case "design":
    case "designed":
      return "waiting_follow_up";
    case "published":
      return "resolved";
    case "assigned":
      return "assigned";
    case "new":
      return "new";
    case "inbox":
      return "inbox";
    default:
      return "inbox";
  }
}

function matchesStatus(c: WorkspaceCase, status: CaseStatus): boolean {
  return c.status === status;
}

/**
 * Central dashboard view filtering.
 *
 * Important: this function MUST be the only place we map views → subsets
 * so the sidebar, URL, and rendering cannot drift.
 */
export function filterItemsByView(args: {
  submissions: WorkspaceCase[];
  view: string | null;
  role: WorkspaceRole | null;
  userCtx: WorkspaceUserContext | null;
  /** If true, `submissions` are already filtered for role visibility. */
  skipRoleVisibilityFilter?: boolean;
}): WorkspaceCase[] {
  const { submissions, view, role, userCtx, skipRoleVisibilityFilter } = args;
  if (!role || !userCtx) return [];

  // First apply role visibility exactly as today.
  const visible = skipRoleVisibilityFilter ? submissions : filterCasesVisibleToRole(role, submissions, userCtx);

  const v = normalizeView(view);
  switch (v) {
    // Non-case tabs never render lists.
    case "team":
    case "analytics":
      return [];

    // "Active reports" / inbox = everything not archived (matches current behavior).
    case "activeReports":
    case "inbox":
      return visible.filter((c) => c.status !== "archived");

    case "new":
      return visible.filter((c) => matchesStatus(c, "new"));

    case "needsTriage":
    case "needs_triage":
      return visible.filter((c) => matchesStatus(c, "needs_triage"));

    case "withLead":
      return visible.filter((c) => hasOwner(c));

    case "needs_lead":
      return visible.filter((c) => !hasOwner(c) && c.status !== "archived");

    case "assigned_work":
      return visible.filter((c) => hasOwner(c) && c.status !== "archived");

    case "assigned":
      // Stage lane: Second Editing (strict status).
      return visible.filter((c) => matchesStatus(c, "assigned"));

    case "inReview":
    case "in_review":
      return visible.filter((c) => matchesStatus(c, "in_review"));

    case "awaitingFollowUp":
    case "waiting_follow_up":
      return visible.filter((c) => matchesStatus(c, "waiting_follow_up"));

    case "resolved":
      return visible.filter((c) => matchesStatus(c, "resolved"));

    case "archive":
      return visible.filter((c) => matchesStatus(c, "archived"));

    case "myQueue":
    case "yourQueue":
      return visible.filter((c) => isCaseAssignedToWorkspaceUser(c, userCtx));
  }
}

