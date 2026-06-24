import type { WorkspaceRole } from "@/app/_lib/rbac";
import type { CaseStatus } from "@/app/_lib/caseWorkspaceModel";
import type { SidebarViewKey } from "@/app/_lib/caseWorkspaceModel";
import type { IntegrationConfig } from "@/app/_lib/integrations/types";

export type RoleLabelMap = Record<WorkspaceRole, string>;

/** Tenant + product identity (also used for metadata exports). */
export type WorkspaceBranding = {
  productName: string;
  workspaceName: string;
  workspaceShortName: string;
  workspaceType: string;
  dashboardTitle: string;
  productOwner: string;
  workspaceLogoPath: string;
};

/** Queue / stage / KPI wording shown across dashboard surfaces. */
export type WorkspaceCoreLabels = {
  itemSingular: string;
  itemPlural: string;
  inbox: string;
  assignments: string;
  myQueue: string;
  analytics: string;
  settings: string;
  managingEditorDesk: string;
  newsroomOperations: string;
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
  needsALead: string;
  resolvedToday: string;
  onTheBooks: string;
  unclaimedPickTheseUpFirst: string;
  roleLabels: RoleLabelMap;
  /** Friendly stage names for each `CaseStatus` (used in badges, run sheet, exports). */
  caseStatusLabels: Record<CaseStatus, string>;
};

export type WorkspaceWorkflowTemplate = {
  /** Canonical stage order for presentation (Firestore values unchanged). */
  stageOrder: readonly CaseStatus[];
  /** Which stages appear as sidebar case views, in order (hrefs are query-param aliases). */
  sidebarStageViews: readonly { key: SidebarViewKey; href: string }[];
  /** Managing Editor run sheet stage order for bottlenecks. */
  mePipelineStages: readonly CaseStatus[];
  /** Map a CaseStatus to the sidebar view that represents that stage. */
  viewKeyByStatus: Record<CaseStatus, SidebarViewKey>;
};

/** Shell chrome: sidebar, topbar fallbacks, nav section headings. */
export type WorkspaceChromeLabels = {
  poweredByPrefix: string;
  editorDeskSidebarTitle: string;
  navSectionYourDesk: string;
  navSectionQueues: string;
  navSectionMenu: string;
  teamNavManagingEditor: string;
  teamNavDefault: string;
  sidebarSuspenseFallbackBadge: string;
  sidebarSuspenseFallbackSubtitle: string;
  editorDeskHeaderSuspenseTitle: string;
  editorDeskHeaderSuspenseSubtitle: string;
  intakeTopbarTitle: string;
  intakeTopbarSubtitle: string;
};

export type WorkspaceDeskLabels = {
  leadNoun: string;
  reporterNoun: string;
  withLabel: string;
  filedByLabel: string;
  noLead: string;
  fromPrefix: string;
};

export type WorkspaceActionLabels = {
  open: string;
  download: string;
  downloading: string;
  opening: string;
  exportDocx: string;
  exportingDocx: string;
  exportOneDrive: string;
  applyStageChange: string;
  updateStatus: string;
  saveTriageNote: string;
  saveDeskNote: string;
  saveNewsroomNote: string;
  saveInternalNote: string;
  setLead: string;
  assign: string;
  assignToggle: string;
  moveStage: string;
  cancel: string;
  save: string;
  saving: string;
  deleting: string;
  sending: string;
  refreshing: string;
  refreshDone: string;
  refreshOneDrive: string;
  markHighPriority: string;
  resolve: string;
  archive: string;
  delete: string;
  deleteEllipsis: string;
  deleteKeep: string;
  deletePermanently: string;
  deleteConfirmBody: string;
  assignPanelTitleDesk: string;
  assignPanelTitleDefault: string;
  assignPanelHintDesk: string;
  assignPanelHintDefault: string;
  assignPanelLoadingMembers: string;
  assignPanelLabelDesk: string;
  assignPanelLabelDefault: string;
  assignPanelSelectPlaceholder: string;
  assignPanelSave: string;
};

export type WorkspacePriorityLabels = {
  urgent: string;
  highAttention: string;
  overdue: string;
  low: string;
  normal: string;
  high: string;
  critical: string;
  columnLabelDesk: string;    // "Attention" — column header in editor/managing-editor views
  columnLabelDefault: string; // "Priority"  — column header in all other views
};

export type WorkspaceDetailSectionLabels = {
  reporterSectionTitle: string;
  filingSectionTitle: string;
  attachmentsSectionTitle: string;
  notesHintTriage: string;
  notesHintDesk: string;
  notesHintManagingEditor: string;
  notesHintDefault: string;
  detailMetaTitleEditor: string;
  detailMetaTitleManagingEditor: string;
  detailMetaTitleDefault: string;
  detailMetaSubmitted: string;
  detailMetaUpdated: string;
  detailMetaDeskLine: string;
  detailMetaWorkflowStatus: string;
  detailMetaHowItArrived: string;
  detailMetaSourceChannel: string;
  detailActionsTitleEditor: string;
  detailActionsTitleManagingEditor: string;
  detailActionsTitleDefault: string;
  detailActivityTitleEditor: string;
  detailActivityTitleManagingEditor: string;
  detailActivityTitleDefault: string;
  detailActivityBodyEditor: string;
  detailActivityBodyManagingEditor: string;
  detailActivityBodyDefault: string;
  decryptLoading: string;
  activityLoading: string;
  activityEmpty: string;
  noReporterLetter: string;
  noBodyText: string;
  titleAsFiled: string;
  theirWords: string;
  // Summary fallback (rendered when Firestore doc has no summary yet)
  noSummaryFallback: string;
  // Meta chip labels
  metaRef: string;
  metaAge: string;
  metaDue: string;
  metaOverdue: string;
  // Reporter section field labels
  reporterRegion: string;
  reporterPhone: string;
  reporterAlias: string;
  // Attachment empty state
  attachmentEmpty: string;
  // Export preview section
  exportPreviewTitle: string;
  exportPreviewLoading: string;
  exportPreviewEmpty: string;
  exportDestination: string;
  exportFolder: string;
  exportPlannedItems: string;
  exportWordIncluded: string;
  exportWordExcluded: string;
  exportManualProvider: string;
  exportNarrativeWarning: string;
  // Priority & due date action section
  priorityDueSectionTitle: string;
  priorityFieldLabel: string;
  dueDateFieldLabel: string;
  dueDateClear: string;
  dueDatePastDue: string;
  // Triage workspace notice
  triageWorkspaceTitle: string;
  triageWorkspaceBody: string;
};

export type WorkspaceExportDocxLabels = {
  filedBy: string;
  status: string;
  attachments: string;
  generatedByPrefix: string;
  // DOCX section headings
  sectionMetadata: string;
  sectionReport: string;
  sectionChangeLog: string;
  // DOCX field labels
  fieldReferenceId: string;
  fieldSubmitted: string;
  fieldReporterRegion: string;
  fieldReporterPhone: string;
  fieldReporterAlias: string;
  fieldSource: string;
  fieldAssignedOwner: string;
  fieldPriority: string;
  fieldSourceChannel: string;
  // Fallback body text when encrypted payload is unavailable
  noPayloadFallback: string;
};

/** Editor desk top header lines keyed by the same `inferred` string the layout switch used. */
export type EditorDeskHeaderPair = { title: string; subtitle: string };

export type WorkspaceEditorDeskHeaders = {
  default: EditorDeskHeaderPair;
  byInferredView: Record<string, EditorDeskHeaderPair>;
};

export type WorkspaceDetailInspectorCopy = {
  detailRoomSnapshotTitle: string;
  detailRoomCheckTitle: string;
  detailOverviewTitle: string;
  notesTriageTitle: string;
  notesDeskTitle: string;
  notesNewsroomTitle: string;
  notesInternalTitle: string;
  emptyPanelTitleEditor: string;
  emptyPanelTitleManagingEditor: string;
  emptyPanelTitleDefault: string;
  emptyPanelSubtitleEditor: string;
  emptyPanelSubtitleManagingEditor: string;
  emptyPanelSubtitleDefault: string;
  emptyPanelBodyEditor: string;
  emptyPanelBodyManagingEditor: string;
  emptyPanelBodyDefault: string;
};

export type WorkspaceRunSheetCopy = {
  runSheetAriaLabel: string;
  runSheetIntroLede: string;
  mePipelineInMotionLabel: string;
  mePipelineInMotionHint: string;
  meOnTheBooksHint: string;
  meResolvedStillOpenLabel: string;
  meResolvedStillOpenHint: string;
  meWhereItStacksTitle: string;
  meBottleneckBalancedCopy: string;
  meAssignmentStatusAriaLabel: string;
  meAllClaimedMessage: string;
  /** Shown after a leading “+{n}” count in the unclaimed tail line. */
  meUnclaimedOverflowSuffix: string;
};

export type WorkspaceBoardCopy = {
  loadingSession: string;
  loadingRole: string;
  openingAnalytics: string;
  redirectingAnalytics: string;
  analyticsTitle: string;
  analyticsDesc: string;
  errorSomethingWentWrong: string;
  emptyNoCasesTitleEditor: string;
  emptyNoCasesTitleManagingEditor: string;
  emptyNoCasesTitleDefault: string;
  emptyNoCasesBodyEditor: string;
  emptyNoCasesBodyManagingEditor: string;
  emptyNoCasesBodyDefault: string;
  emptyReviewerNothingAssignedTitle: string;
  emptyReviewerNothingAssignedBody: string;
  intakeEmptyTitle: string;
  intakeEmptyBeforeStates: string;
  intakeEmptyStateNewLabel: string;
  intakeEmptyOrWord: string;
  intakeEmptyStateTriageLabel: string;
  intakeEmptyAfterStates: string;
  /** View-specific empty state strings for getDashboardViewConfig */
  viewEmptyMyQueueTitle: string;
  viewEmptyMyQueueBody: string;
  viewEmptyAssignedWorkTitle: string;
  viewEmptyAssignedWorkBody: string;
  viewEmptyNeedsLeadTitle: string;
  viewEmptyNeedsLeadBody: string;
  viewEmptyWithLeadBody: string;
  viewEmptyResolvedBody: string;
  viewEmptyArchiveBody: string;
  viewEmptyActiveReportsBody: string;
  viewEmptyQueueClearTitle: string;
  viewEmptyDefaultTitle: string;
  viewEmptyDefaultBody: string;
  stageColumnTitleDesk: string;
  stageColumnTitleDefault: string;
  leadColumnTitleDesk: string;
  leadColumnTitleDefault: string;
  cardOpenLabel: string;
  cardAssignLabel: string;
};

export type WorkspaceTeamCopy = {
  teamPageTitle: string;
  teamRosterLimitedBody: string;
  teamPageIntro: string;
  teamYouLabel: string;
  teamColleaguesLabel: string;
  teamColleaguesCountNote: string;
};

export type WorkspaceSettingsLabels = {
  pageTitle: string;
  pageDesc: string;
  unavailableTitle: string;
  unavailableBody: string;
  sectionWorkspaceProfileTitle: string;
  sectionWorkspaceProfileBody: string;
  sectionSecurityTitle: string;
  sectionSecurityBody: string;
  sectionDataHandlingTitle: string;
  sectionDataHandlingBody: string;
  sectionIntegrationsTitle: string;
  sectionIntegrationsBody: string;
  oneDriveConnect: string;
  oneDriveReconnect: string;
  oneDriveCheckingStatus: string;
  oneDriveConnected: string;
  oneDriveNotConnected: string;
  oneDriveDiagHint: string;
  oneDriveDiagRunning: string;
  oneDriveDiagButton: string;
  oneDriveRestrictedNotice: string;
  sectionTeamAccessTitle: string;
  sectionTeamAccessBody: string;
};

export type WorkspaceConfig = {
  id: string;
  branding: WorkspaceBranding;
  locale: string;
  theme: "light";
  labels: WorkspaceCoreLabels;
  workflow: WorkspaceWorkflowTemplate;
  integrations: IntegrationConfig;
  deskLabels: WorkspaceDeskLabels;
  actionLabels: WorkspaceActionLabels;
  priorityLabels: WorkspacePriorityLabels;
  detailSectionLabels: WorkspaceDetailSectionLabels;
  exportDocxLabels: WorkspaceExportDocxLabels;
  chrome: WorkspaceChromeLabels;
  editorDeskHeaders: WorkspaceEditorDeskHeaders;
  detailInspector: WorkspaceDetailInspectorCopy;
  runSheet: WorkspaceRunSheetCopy;
  board: WorkspaceBoardCopy;
  team: WorkspaceTeamCopy;
  settingsLabels: WorkspaceSettingsLabels;
  notificationLabels: WorkspaceNotificationLabels;
};

export type WorkspaceNotificationLabels = {
  bellAriaLabel: string;
  emptyState: string;
  markAllRead: string;
  /** In-app title for assignment notification. */
  assignedTitle: string;
  /** In-app body. Use {ref} as placeholder — replaced at write time. */
  assignedBody: string;
  /** In-app title for designed-stage notification. */
  designedTitle: string;
  /** In-app body. Use {ref} as placeholder — replaced at write time. */
  designedBody: string;
  /** Email subject for assignment. Use {ref} as placeholder. */
  emailSubjectAssigned: string;
  /** Email subject for designed stage. Use {ref} as placeholder. */
  emailSubjectDesigned: string;
  /** CTA label in email body. */
  emailViewCase: string;
  /** Footer line in email. */
  emailFooter: string;
  /** Prefix shown before actor display name in bell, e.g. "By:" / "بواسطة:" */
  byActor: string;
  /** Relative time strings for bell timestamps. Use {n} for the numeric value. */
  relativeTimeJustNow: string;
  relativeTimeMinutesAgo: string;
  relativeTimeHoursAgo: string;
  relativeTimeDaysAgo: string;
};

/** Flattened labels consumed across dashboard UI (back-compat shape). */
export type OrgLabels = WorkspaceBranding &
  WorkspaceCoreLabels &
  { workflow: WorkspaceWorkflowTemplate } &
  {
    deskLabels: WorkspaceDeskLabels;
    actionLabels: WorkspaceActionLabels;
    priorityLabels: WorkspacePriorityLabels;
    detailSectionLabels: WorkspaceDetailSectionLabels;
    exportDocxLabels: WorkspaceExportDocxLabels;
    settingsLabels: WorkspaceSettingsLabels;
    notificationLabels: WorkspaceNotificationLabels;
    /** Locale-aware editor desk headers. Falls back to WorkspaceConfig.editorDeskHeaders when absent. */
    editorDeskHeaders?: WorkspaceEditorDeskHeaders;
  } &
  WorkspaceChromeLabels &
  WorkspaceDetailInspectorCopy &
  WorkspaceRunSheetCopy &
  WorkspaceBoardCopy &
  WorkspaceTeamCopy;

export type OrgSettings = WorkspaceBranding & {
  locale: string;
  theme: "light";
};
