import type { WorkspaceRole } from "@/app/_lib/rbac";
import { getOrgSettings } from "@/app/_lib/org/getOrgSettings";

export type OrgLabels = {
  productName: string;
  itemSingular: string;
  itemPlural: string;
  inbox: string;
  assignments: string;
  myQueue: string;
  analytics: string;
  settings: string;
  managingEditorDesk: string;
  newsroomOperations: string;
  /** Managing Editor — line under the desk title (operational, not marketing). */
  managingEditorDeskSubline: string;
  runSheet: string;
  activeReports: string;
  new: string;
  needsTriage: string;
  withLead: string;
  inReview: string;
  awaitingFollowUp: string;
  resolved: string;
  archive: string;
  noLeadYet: string;
  /** Managing Editor hero KPI — unclaimed in motion. */
  needsALead: string;
  /** Managing Editor hero KPI — resolved same calendar day (local). */
  resolvedToday: string;
  onTheBooks: string;
  unclaimedPickTheseUpFirst: string;
  roleLabels: Record<WorkspaceRole, string>;
};

/**
 * Central source of truth for dashboard wording.
 *
 * Phase 4: returns default labels only (no org context yet).
 * Later: can safely merge org-specific overrides from settings/docs.
 */
export function getOrgLabels(): OrgLabels {
  const settings = getOrgSettings();
  return {
    productName: settings.productName,
    itemSingular: "report",
    itemPlural: "reports",
    inbox: "Inbox",
    assignments: "Assigned",
    myQueue: "Your queue",
    analytics: "Analytics",
    settings: "Settings",
    managingEditorDesk: "Managing Editor Desk",
    newsroomOperations: "Newsroom command center",
    managingEditorDeskSubline:
      "Command center for the room — leads, stages, and filings in one sweep.",
    runSheet: "Run sheet",
    activeReports: "Inbox",
    new: "Raw Materials",
    needsTriage: "First Editing",
    withLead: "Second Editing",
    inReview: "Proofreading",
    awaitingFollowUp: "Designed",
    resolved: "Published",
    archive: "Archive",
    noLeadYet: "No lead yet",
    needsALead: "Needs a lead",
    resolvedToday: "Published today",
    onTheBooks: "On the books",
    unclaimedPickTheseUpFirst: "Unclaimed — pick these up first",
    roleLabels: {
      owner: "Owner",
      admin: "Admin",
      reviewer: "Reviewer",
      intake: "Intake",
      readonly: "Read-only",
    },
  };
}

