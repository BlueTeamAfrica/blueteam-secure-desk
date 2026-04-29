import type {
  EditorDeskHeaderPair,
  WorkspaceBoardCopy,
  WorkspaceBranding,
  WorkspaceChromeLabels,
  WorkspaceConfig,
  WorkspaceCoreLabels,
  WorkspaceActionLabels,
  WorkspaceDeskLabels,
  WorkspaceDetailInspectorCopy,
  WorkspaceEditorDeskHeaders,
  WorkspaceRunSheetCopy,
  WorkspaceTeamCopy,
} from "@/app/_lib/org/types";

const branding: WorkspaceBranding = {
  productName: "Blue Team Secure Desk",
  workspaceName: "Atar / Sudan Facts",
  workspaceShortName: "Atar",
  workspaceType: "Editorial Desk",
  dashboardTitle: "Atar Editorial Desk",
  productOwner: "Blue Team Africa",
  workspaceLogoPath: "/editorial/sf1.png",
};

const labels: WorkspaceCoreLabels = {
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
    owner: "Editor in Chief",
    admin: "Managing Editor",
    reviewer: "Editor",
    intake: "Proofreader",
    readonly: "Viewer",
  },
  caseStatusLabels: {
    new: "Raw Materials",
    needs_triage: "First Editing",
    assigned: "Second Editing",
    in_review: "Proofreading",
    waiting_follow_up: "Designed",
    resolved: "Published",
    archived: "Archive",
  },
};

const chrome: WorkspaceChromeLabels = {
  poweredByPrefix: "Powered by",
  editorDeskSidebarTitle: "Editor desk",
  navSectionYourDesk: "Your desk",
  navSectionQueues: "Queues",
  navSectionMenu: "Menu",
  teamNavManagingEditor: "Team roster",
  teamNavDefault: "Team",
  sidebarSuspenseFallbackBadge: "SR",
  sidebarSuspenseFallbackSubtitle: "Case management",
  editorDeskHeaderSuspenseTitle: "Editor desk",
  editorDeskHeaderSuspenseSubtitle: "Work the desk clearly and move filings forward.",
  intakeTopbarTitle: "News desk",
  intakeTopbarSubtitle: "Route tips, keep the trail clear, move work forward.",
};

const deskLabels: WorkspaceDeskLabels = {
  leadNoun: "lead",
  reporterNoun: "reporter",
  withLabel: "With",
  filedByLabel: "Filed by",
};

const actionLabels: WorkspaceActionLabels = {
  open: "Open",
  download: "Download",
  downloading: "Downloading…",
  opening: "Opening…",
  exportDocx: "Export Word (.docx)",
  exportingDocx: "Preparing Word…",
  applyStageChange: "Apply stage change",
  updateStatus: "Update status",
  saveTriageNote: "Save triage note",
  saveDeskNote: "Save desk note",
  saveNewsroomNote: "Save newsroom note",
  saveInternalNote: "Save internal note",
  setLead: "Set lead",
  assign: "Assign",
  markHighPriority: "Mark high priority",
  resolve: "Resolve",
  archive: "Archive",
  delete: "Delete report",
  deleteEllipsis: "Delete report…",
  deleteKeep: "Keep this report",
  deletePermanently: "Delete permanently",
  deleteConfirmBody:
    "This permanently removes this report from the newsroom by deleting the Firestore submission document. Anyone viewing this record will lose access. This cannot be undone.",
};

const priorityLabels = {
  urgent: "Urgent",
  highAttention: "High attention",
} satisfies import("@/app/_lib/org/types").WorkspacePriorityLabels;

const detailSectionLabels = {
  reporterSectionTitle: "Reporter",
  filingSectionTitle: "From the reporter",
  attachmentsSectionTitle: "Attachments",
  notesHintTriage: "Short triage context (same internal field as staff notes until dedicated triage fields ship).",
  notesHintDesk: "Visible only to staff in this newsroom — not to the person who filed.",
  notesHintManagingEditor: "Only staff in this workspace — never shared back to the source.",
  notesHintDefault: "Private to staff in this workspace — not visible to the person who filed the report.",
  detailMetaTitleEditor: "Story file",
  detailMetaTitleManagingEditor: "File & routing",
  detailMetaTitleDefault: "Case details",
  detailMetaSubmitted: "Submitted",
  detailMetaUpdated: "Updated",
  detailMetaDeskLine: "Desk line",
  detailMetaWorkflowStatus: "Workflow status",
  detailMetaHowItArrived: "How it arrived",
  detailMetaSourceChannel: "Source channel",
  detailActionsTitleEditor: "Next steps",
  detailActionsTitleManagingEditor: "Workflow control",
  detailActionsTitleDefault: "Actions",
  detailActivityTitleEditor: "Activity",
  detailActivityTitleManagingEditor: "Desk log",
  detailActivityTitleDefault: "Audit / activity",
  detailActivityBodyEditor:
    "A timeline of moves on this submission will appear here when activity tracking is turned on.",
  detailActivityBodyManagingEditor:
    "A rolling log of who moved what will sit here once activity tracking ships for this workspace.",
  detailActivityBodyDefault:
    "A chronological activity feed will appear here once it is connected to your audit log. Nothing is shown yet.",
  decryptLoading: "Opening the filing…",
  activityLoading: "Loading activity…",
  activityEmpty: "No activity yet.",
  noReporterLetter: "No reporter letter was stored for this submission.",
  noBodyText: "No body text was found in this filing.",
  titleAsFiled: "Title as filed",
  theirWords: "Their words",
} satisfies import("@/app/_lib/org/types").WorkspaceDetailSectionLabels;

const exportDocxLabels = {
  filedBy: "Filed by",
  status: "Status",
  attachments: "Attachments",
  generatedByPrefix: "Generated by",
} satisfies import("@/app/_lib/org/types").WorkspaceExportDocxLabels;

const hdrRawMaterials: EditorDeskHeaderPair = {
  title: "Raw Materials",
  subtitle: "New incoming material waiting for movement.",
};

const hdrFirstEditing: EditorDeskHeaderPair = {
  title: "First Editing",
  subtitle: "Stories currently in the first editorial pass.",
};

const hdrYourQueue: EditorDeskHeaderPair = {
  title: "Your queue",
  subtitle: "Items currently on your desk.",
};

const hdrProofreading: EditorDeskHeaderPair = {
  title: "Proofreading",
  subtitle: "Copy and correction stage.",
};

const hdrDesigned: EditorDeskHeaderPair = {
  title: "Designed",
  subtitle: "Stories currently in design.",
};

const hdrPublished: EditorDeskHeaderPair = {
  title: "Published",
  subtitle: "Released pieces kept visible for reference.",
};

const hdrArchive: EditorDeskHeaderPair = {
  title: "Archive",
  subtitle: "Past work retained for search and review.",
};

const editorDeskHeaders: WorkspaceEditorDeskHeaders = {
  default: {
    title: "Editor desk",
    subtitle: "Work the desk clearly and move filings forward.",
  },
  byInferredView: {
    inbox: {
      title: "Inbox",
      subtitle: "All visible filings across the desk.",
    },
    raw: hdrRawMaterials,
    new: hdrRawMaterials,
    "raw-materials": hdrRawMaterials,
    edit1: hdrFirstEditing,
    "first-editing": hdrFirstEditing,
    needs_triage: hdrFirstEditing,
    assigned: hdrYourQueue,
    "your-queue": hdrYourQueue,
    proof: hdrProofreading,
    proofreading: hdrProofreading,
    in_review: hdrProofreading,
    design: hdrDesigned,
    designed: hdrDesigned,
    waiting_follow_up: hdrDesigned,
    published: hdrPublished,
    resolved: hdrPublished,
    archive: hdrArchive,
    archived: hdrArchive,
  },
};

const detailInspector: WorkspaceDetailInspectorCopy = {
  detailRoomSnapshotTitle: "Snapshot",
  detailRoomCheckTitle: "Room check",
  detailOverviewTitle: "Overview",
  notesTriageTitle: "Triage notes",
  notesDeskTitle: "Desk notes",
  notesNewsroomTitle: "Newsroom notes",
  notesInternalTitle: "Internal notes",
  emptyPanelTitleEditor: "Your queue",
  emptyPanelTitleManagingEditor: "Command center",
  emptyPanelTitleDefault: "Pick a report",
  emptyPanelSubtitleEditor: "One story at a time — tap a card to work it.",
  emptyPanelSubtitleManagingEditor: "Choose a card to steer leads, stages, and the full filing.",
  emptyPanelSubtitleDefault: "Select a card to read, route, and close the loop.",
  emptyPanelBodyEditor:
    "Cards are ordered for focus. Open one to see the summary, the reporter’s words, and your desk notes together.",
  emptyPanelBodyManagingEditor:
    "The board is live. Open any card to move ownership, shift stages, or read what came in from the field.",
  emptyPanelBodyDefault: "Tap a card to read what came in, coordinate with the team, and keep the trail clean.",
};

const runSheet: WorkspaceRunSheetCopy = {
  runSheetAriaLabel: "Newsroom run sheet",
  runSheetIntroLede:
    "Live counts from your queue — who still needs a lead, what is in motion, and where work is stacking.",
  mePipelineInMotionLabel: "In motion",
  mePipelineInMotionHint: "Not resolved or archived",
  meOnTheBooksHint: "Everything not archived",
  meResolvedStillOpenLabel: "Resolved, still open",
  meResolvedStillOpenHint: "Ready to archive or file",
  meWhereItStacksTitle: "Where it stacks (in motion)",
  meBottleneckBalancedCopy: "No single stage is holding more than the rest right now.",
  meAssignmentStatusAriaLabel: "Assignment status",
  meAllClaimedMessage: "Every in-motion submission already has someone on it.",
  meUnclaimedOverflowSuffix:
    " more in motion still need someone on them — scan Active reports or Needs triage in the queue.",
};

const board: WorkspaceBoardCopy = {
  emptyNoCasesTitleEditor: "Nothing on your desk yet",
  emptyNoCasesTitleManagingEditor: "The wire is quiet",
  emptyNoCasesTitleDefault: "No cases yet",
  emptyNoCasesBodyEditor:
    "When the desk assigns a submission to you, it will land here. Check back after the next routing round.",
  emptyNoCasesBodyManagingEditor:
    "When tips start filing, they will appear here with live leads and stages so you can steer the room.",
  emptyNoCasesBodyDefault: "When a new report arrives, it will appear here for your team to work on.",
  emptyReviewerNothingAssignedTitle: "Nothing assigned to you right now",
  emptyReviewerNothingAssignedBody:
    "Your list only shows submissions where you are the lead. If you expected work here, ask the desk to confirm the assignment — they may still be routing it.",
  intakeEmptyTitle: "Nothing in triage",
  intakeEmptyBeforeStates: "Intake only sees reports in ",
  intakeEmptyStateNewLabel: "New",
  intakeEmptyOrWord: " or ",
  intakeEmptyStateTriageLabel: "Needs Triage",
  intakeEmptyAfterStates: ". When submissions arrive in those states, they will appear here.",
  stageColumnTitleDesk: "Where it stands",
  stageColumnTitleDefault: "Case status",
  leadColumnTitleDesk: "Who has it",
  leadColumnTitleDefault: "Owner",
  cardOpenLabel: "Open",
  cardAssignLabel: "Assign",
};

const team: WorkspaceTeamCopy = {
  teamPageTitle: "Team",
  teamRosterLimitedBody: "Team roster is limited to owner and administrator roles in this workspace.",
  teamPageIntro:
    "A simple picture of who is in this workspace today. Invitations and roster editing will arrive in a later phase.",
};

export const factsdWorkspaceConfig: WorkspaceConfig = {
  id: "factsd",
  branding,
  locale: "en",
  theme: "light",
  labels,
  workflow: {
    stageOrder: ["new", "needs_triage", "assigned", "in_review", "waiting_follow_up", "resolved", "archived"],
    sidebarStageViews: [
      { key: "inbox", href: "/dashboard" },
      { key: "needs_lead", href: "/dashboard?view=needs_lead" },
      { key: "assigned_work", href: "/dashboard?view=assigned_work" },
      { key: "new", href: "/dashboard?view=raw" },
      { key: "needs_triage", href: "/dashboard?view=edit1" },
      { key: "assigned", href: "/dashboard?view=edit2" },
      { key: "in_review", href: "/dashboard?view=proof" },
      { key: "waiting_follow_up", href: "/dashboard?view=design" },
      { key: "resolved", href: "/dashboard?view=published" },
      { key: "archive", href: "/dashboard?view=archive" },
      { key: "team", href: "/dashboard?view=team" },
      { key: "analytics", href: "/dashboard?view=analytics" },
    ],
    mePipelineStages: ["new", "needs_triage", "assigned", "in_review", "waiting_follow_up"],
    viewKeyByStatus: {
      new: "new",
      needs_triage: "needs_triage",
      assigned: "assigned",
      in_review: "in_review",
      waiting_follow_up: "waiting_follow_up",
      resolved: "resolved",
      archived: "archive",
    },
  },
  integrations: {
    exportProvider: "manualDownload",
    oneDrive: {
      enabled: false,
      rootFolderName: "Atar Secure Desk",
      stageFolderMap: {
        new: "01 Raw Materials",
        needs_triage: "02 First Editing",
        assigned: "03 Second Editing",
        in_review: "04 Proofreading",
        waiting_follow_up: "05 Designed",
        resolved: "06 Published",
        archived: "07 Archive",
      },
    },
  },
  deskLabels,
  actionLabels,
  priorityLabels,
  detailSectionLabels,
  exportDocxLabels,
  chrome,
  editorDeskHeaders,
  detailInspector,
  runSheet,
  board,
  team,
};
