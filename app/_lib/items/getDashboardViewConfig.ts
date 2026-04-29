import type { WorkspaceRole } from "@/app/_lib/rbac";
import type { OrgLabels } from "@/app/_lib/org/types";

export type DashboardPresentationView =
  | "activeReports"
  | "new"
  | "needsTriage"
  | "withLead"
  | "assignedWork"
  | "needsLead"
  | "inReview"
  | "awaitingFollowUp"
  | "resolved"
  | "archive"
  | "myQueue"
  | "other";

function normalizePresentationView(view: string | null | undefined): DashboardPresentationView {
  const raw = (view ?? "").trim();
  if (!raw) return "activeReports";
  const t = raw.replace(/[\s-]+/g, "_");
  switch (t) {
    case "inbox":
    case "activeReports":
    case "active_reports":
      return "activeReports";
    case "new":
      return "new";
    case "needsTriage":
    case "needs_triage":
      return "needsTriage";
    case "withLead":
    case "with_lead":
      return "withLead";
    case "assigned_work":
    case "assignedWork":
      return "assignedWork";
    case "needs_lead":
    case "needsLead":
    case "unassigned":
      return "needsLead";
    case "inReview":
    case "in_review":
      return "inReview";
    case "awaitingFollowUp":
    case "awaiting_follow_up":
    case "waiting_follow_up":
      return "awaitingFollowUp";
    case "resolved":
      return "resolved";
    case "archive":
    case "archived":
      return "archive";
    case "myQueue":
    case "my_queue":
    case "yourQueue":
    case "your_queue":
      return "myQueue";
    default:
      return "other";
  }
}

export type DashboardViewConfig = {
  presentationView: DashboardPresentationView;
  showRunSheet: boolean;
  showKpis: boolean;
  showWhereItStacks: boolean;
  showUnclaimed: boolean;
  emptyTitle: string;
  emptyBody: string;
};

export function getDashboardViewConfig(args: {
  view: string | null;
  role: WorkspaceRole;
  labels: OrgLabels;
}): DashboardViewConfig {
  const { view, role, labels } = args;
  const presentationView = normalizePresentationView(view);
  const managingEditorDesk = role === "owner" || role === "admin";
  const isActive = presentationView === "activeReports";

  const showRunSheet = managingEditorDesk && isActive;
  const showKpis = showRunSheet;
  const showWhereItStacks = showRunSheet;
  const showUnclaimed = showRunSheet;

  const emptyTitle =
    presentationView === "resolved"
      ? `No ${labels.resolved.toLowerCase()} ${labels.itemPlural} yet.`
      : presentationView === "archive"
        ? `No ${labels.archive.toLowerCase()} ${labels.itemPlural} yet.`
        : presentationView === "myQueue"
          ? "Nothing is assigned to you right now."
          : presentationView === "withLead"
            ? `No ${labels.withLead.toLowerCase()} ${labels.itemPlural} yet.`
            : presentationView === "assignedWork"
              ? "No assigned work right now."
              : presentationView === "needsLead"
                ? "No items need a lead right now."
            : presentationView === "new"
              ? `No new ${labels.itemPlural} yet.`
              : presentationView === "needsTriage"
                ? `No ${labels.needsTriage.toLowerCase()} items right now.`
                : presentationView === "inReview"
                  ? `No ${labels.inReview.toLowerCase()} items right now.`
                  : presentationView === "awaitingFollowUp"
                    ? `No ${labels.awaitingFollowUp.toLowerCase()} items right now.`
                    : managingEditorDesk
                      ? "This queue is clear"
                      : "Nothing in this view";

  const emptyBody =
    presentationView === "resolved"
      ? "When work is filed as resolved, it will appear here."
      : presentationView === "archive"
        ? "When items are archived, they will appear here."
        : presentationView === "myQueue"
          ? "When you’re set as the lead on a report, it will show up here for quick access."
          : presentationView === "withLead"
            ? "Assigned work will appear here once a lead is set."
            : presentationView === "assignedWork"
              ? "Items that already have a lead."
              : presentationView === "needsLead"
                ? "Unclaimed items waiting for assignment."
            : presentationView === "activeReports"
              ? "Switch queues on the left or wait for new filings — the run sheet above still reflects the whole room."
              : "Try another tab on the left, or check back as cases move through the workflow.";

  return {
    presentationView,
    showRunSheet,
    showKpis,
    showWhereItStacks,
    showUnclaimed,
    emptyTitle,
    emptyBody,
  };
}

