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
};

export type WorkspaceActionLabels = {
  open: string;
  download: string;
  downloading: string;
  opening: string;
  exportDocx: string;
  exportingDocx: string;
  applyStageChange: string;
  updateStatus: string;
  saveTriageNote: string;
  saveDeskNote: string;
  saveNewsroomNote: string;
  saveInternalNote: string;
  setLead: string;
  assign: string;
  markHighPriority: string;
  resolve: string;
  archive: string;
  delete: string;
  deleteEllipsis: string;
  deleteKeep: string;
  deletePermanently: string;
  deleteConfirmBody: string;
};

export type WorkspacePriorityLabels = {
  urgent: string;
  highAttention: string;
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
};

export type WorkspaceExportDocxLabels = {
  filedBy: string;
  status: string;
  attachments: string;
  generatedByPrefix: string;
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
