/**
 * Arabic (ar) locale override for the factsd workspace (Atar / Sudan Facts).
 *
 * Shape: a partial of OrgLabels — every key here overwrites the English base.
 * Nested label groups (deskLabels, actionLabels, etc.) are full replacements.
 * The `workflow` key is omitted intentionally — it contains routing data, not strings.
 * Stage names come from the canonical 7-value set supplied by Mohamed El-Daby.
 *
 * To add a new language: copy this file, translate, export, register in useLocale.ts.
 */

import type {
  WorkspaceDeskLabels,
  WorkspaceActionLabels,
  WorkspacePriorityLabels,
  WorkspaceDetailSectionLabels,
  WorkspaceExportDocxLabels,
  WorkspaceEditorDeskHeaders,
  WorkspaceSettingsLabels,
} from "@/app/_lib/org/types";
import type { OrgLabels } from "@/app/_lib/org/types";

// ─── Nested label groups (typed strictly so TS catches missing keys) ──────────

const deskLabels: WorkspaceDeskLabels = {
  leadNoun: "قائد",
  reporterNoun: "مراسل",
  withLabel: "مع",
  filedByLabel: "قدّمه",
  noLead: "لا قائد",
  fromPrefix: "من",
};

const actionLabels: WorkspaceActionLabels = {
  open: "فتح",
  download: "تحميل",
  downloading: "جارٍ التحميل…",
  opening: "جارٍ الفتح…",
  exportDocx: "تصدير Word (.docx)",
  exportingDocx: "جارٍ التحضير…",
  exportOneDrive: "تصدير ← إرسال إلى OneDrive",
  applyStageChange: "تطبيق تغيير المرحلة",
  updateStatus: "تحديث الحالة",
  saveTriageNote: "حفظ ملاحظة الفرز",
  saveDeskNote: "حفظ ملاحظة المكتب",
  saveNewsroomNote: "حفظ ملاحظة غرفة الأخبار",
  saveInternalNote: "حفظ ملاحظة داخلية",
  setLead: "تعيين قائد",
  assign: "إسناد",
  assignToggle: "إسناد",
  moveStage: "نقل",
  cancel: "إلغاء",
  save: "حفظ",
  saving: "جارٍ الحفظ…",
  deleting: "جارٍ الحذف…",
  sending: "جارٍ الإرسال…",
  refreshing: "جارٍ التحديث…",
  refreshDone: "✓ تم التحديث",
  refreshOneDrive: "تحديث تصدير OneDrive",
  markHighPriority: "تحديد أولوية عالية",
  resolve: "إنهاء",
  archive: "أرشفة",
  delete: "حذف التقرير",
  deleteEllipsis: "حذف التقرير…",
  deleteKeep: "الاحتفاظ بالتقرير",
  deletePermanently: "حذف نهائي",
  deleteConfirmBody:
    "يؤدي هذا إلى حذف التقرير نهائياً من غرفة الأخبار عبر حذف مستند التقديم من Firestore. سيفقد أي شخص يشاهد هذا السجل حق الوصول. لا يمكن التراجع عن هذا الإجراء.",
  assignPanelTitleDesk: "تعيين قائد التحرير",
  assignPanelTitleDefault: "تعيين مالك الحالة",
  assignPanelHintDesk: "اختر من سيتولى التحرير. ستظهر هذه المادة على طاولته فور الحفظ.",
  assignPanelHintDefault: "اختر عضواً من مساحة العمل. يُحدَّث الإسناد في Firestore؛ يرى المراجعون الحالة عند تعيينهم مالكاً لها.",
  assignPanelLoadingMembers: "جارٍ تحميل الأعضاء…",
  assignPanelLabelDesk: "القائد",
  assignPanelLabelDefault: "إسناد إلى",
  assignPanelSelectPlaceholder: "اختر شخصاً…",
  assignPanelSave: "حفظ الإسناد",
};

const priorityLabels: WorkspacePriorityLabels = {
  urgent: "عاجل",
  highAttention: "أولوية عالية",
  overdue: "متأخر",
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
  critical: "حرجة",
  columnLabelDesk: "انتباه",
  columnLabelDefault: "الأولوية",
};

const detailSectionLabels: WorkspaceDetailSectionLabels = {
  reporterSectionTitle: "المراسل",
  filingSectionTitle: "من المراسل",
  attachmentsSectionTitle: "المرفقات",
  notesHintTriage:
    "ملاحظة فرز مختصرة (نفس حقل ملاحظات الموظفين حتى يصدر حقل الفرز المخصص).",
  notesHintDesk: "مرئية للموظفين فقط في هذه الغرفة — لا تُشارك مع المُقدِّم.",
  notesHintManagingEditor:
    "للموظفين في هذا الفضاء فقط — لا تُشارك مع المصدر أبداً.",
  notesHintDefault:
    "خاصة بموظفي هذا الفضاء — لا تظهر للشخص الذي قدّم التقرير.",
  detailMetaTitleEditor: "ملف القصة",
  detailMetaTitleManagingEditor: "الملف والتوجيه",
  detailMetaTitleDefault: "تفاصيل الحالة",
  detailMetaSubmitted: "قُدِّم",
  detailMetaUpdated: "حُدِّث",
  detailMetaDeskLine: "خط المكتب",
  detailMetaWorkflowStatus: "حالة سير العمل",
  detailMetaHowItArrived: "كيف وصل",
  detailMetaSourceChannel: "قناة المصدر",
  detailActionsTitleEditor: "الخطوات التالية",
  detailActionsTitleManagingEditor: "التحكم في سير العمل",
  detailActionsTitleDefault: "الإجراءات",
  detailActivityTitleEditor: "النشاط",
  detailActivityTitleManagingEditor: "سجل المكتب",
  detailActivityTitleDefault: "المراجعة / النشاط",
  detailActivityBodyEditor:
    "سيظهر هنا جدول زمني للتحركات على هذا التقديم عند تفعيل تتبع النشاط.",
  detailActivityBodyManagingEditor:
    "سيظهر هنا سجل متجدد لمن حرّك ماذا عند إطلاق تتبع النشاط لهذا الفضاء.",
  detailActivityBodyDefault:
    "سيظهر هنا تدفق نشاط زمني عند ربطه بسجل المراجعة. لا يوجد شيء حالياً.",
  decryptLoading: "جارٍ فتح الملف…",
  activityLoading: "جارٍ تحميل النشاط…",
  activityEmpty: "لا يوجد نشاط بعد.",
  noReporterLetter: "لم يُخزَّن خطاب المراسل لهذا التقديم.",
  noBodyText: "لم يُعثر على نص أساسي في هذا الملف.",
  titleAsFiled: "العنوان كما قُدِّم",
  theirWords: "كلماتهم",
  noSummaryFallback: "لم يُضف ملخص بعد. راجع زملاءك أو تحقق من الملف عندما يُوجّهه المحررون.",
  metaRef: "المرجع:",
  metaAge: "العمر",
  metaDue: "الموعد النهائي",
  metaOverdue: "متأخر",
  reporterRegion: "المنطقة",
  reporterPhone: "الهاتف",
  reporterAlias: "الاسم المستعار",
  attachmentEmpty: "لم تُرفق ملفات مع هذا التقرير.",
  exportPreviewTitle: "معاينة حزمة التصدير",
  exportPreviewLoading: "جارٍ تحميل المعاينة…",
  exportPreviewEmpty: "المعاينة غير متاحة بعد.",
  exportDestination: "الوجهة",
  exportFolder: "المجلد",
  exportPlannedItems: "العناصر المخططة",
  exportWordIncluded: "تصدير Word",
  exportWordExcluded: "لا يوجد تصدير Word",
  exportManualProvider: "تصدير / تنزيل يدوي",
  exportNarrativeWarning: "قد يفتقر هذا التصدير إلى النص الكامل إذا لم يتمكن دورك من فتح الملف.",
  priorityDueSectionTitle: "الأولوية والموعد النهائي",
  priorityFieldLabel: "الأولوية",
  dueDateFieldLabel: "الموعد النهائي",
  dueDateClear: "مسح",
  dueDatePastDue: "تجاوز هذا التقرير موعده النهائي.",
  triageWorkspaceTitle: "مساحة الفرز",
  triageWorkspaceBody: "اعمل من الملخص أعلاه وملاحظات الفرز أدناه. يتولى المحررون الملف الكامل بعد مغادرته قائمة الفرز.",
};

const exportDocxLabels: WorkspaceExportDocxLabels = {
  filedBy: "قدّمه",
  status: "الحالة",
  attachments: "المرفقات",
  generatedByPrefix: "صدر بواسطة",
  sectionMetadata: "البيانات الوصفية",
  sectionReport: "التقرير",
  sectionChangeLog: "سجل التغييرات",
  fieldReferenceId: "رقم المرجع",
  fieldSubmitted: "تاريخ التقديم",
  fieldReporterRegion: "منطقة المراسل",
  fieldReporterPhone: "هاتف المراسل",
  fieldReporterAlias: "اسم مستعار للمراسل",
  fieldSource: "المصدر",
  fieldAssignedOwner: "المسؤول المُكلَّف",
  fieldPriority: "الأولوية",
  fieldSourceChannel: "قناة المصدر",
  noPayloadFallback:
    "النص الكامل غير مُدرج في هذا التصدير (المحتوى المشفر غير متاح لهذا الدور أو تعذّر فكّ تشفيره على الخادم). افتح لوحة التحكم للاطلاع على المحتوى الموثوق.",
};

// ─── Editor desk headers ──────────────────────────────────────────────────────
// Reviewed and finalised by Mohamed El-Daby, 2026-06-21.

const editorDeskHeaders: WorkspaceEditorDeskHeaders = {
  default: {
    title: "مكتب التحرير",
    subtitle: "اعمل بوضوح وحرّك الملفات إلى الأمام.",
  },
  byInferredView: {
    inbox: {
      title: "الوارد",
      subtitle: "جميع التقديمات.",
    },
    raw: {
      title: "تقديم",
      subtitle: "التقديمات الواردة الجديدة بانتظار التوجيه.",
    },
    new: {
      title: "تقديم",
      subtitle: "التقديمات الواردة الجديدة بانتظار التوجيه.",
    },
    "raw-materials": {
      title: "تقديم",
      subtitle: "التقديمات الواردة الجديدة بانتظار التوجيه.",
    },
    edit1: {
      title: "مواد خام",
      subtitle: "مواد جديدة بانتظار التحرير الأول.",
    },
    "first-editing": {
      title: "مواد خام",
      subtitle: "مواد جديدة بانتظار التحرير الأول.",
    },
    needs_triage: {
      title: "مواد خام",
      subtitle: "مواد جديدة بانتظار التحرير الأول.",
    },
    assigned: {
      title: "تحرير أول",
      subtitle: "مواد بانتظار التحرير الثاني.",
    },
    "your-queue": {
      title: "تحرير أول",
      subtitle: "مواد بانتظار التحرير الثاني.",
    },
    edit2: {
      title: "تحرير أول",
      subtitle: "مواد بانتظار التحرير الثاني.",
    },
    proof: {
      title: "تحرير ثاني",
      subtitle: "مواد محررة.",
    },
    proofreading: {
      title: "تحرير ثاني",
      subtitle: "مواد محررة.",
    },
    in_review: {
      title: "تصحيح",
      subtitle: "القصص قيد المراجعة قبل الموافقة النهائية.",
    },
    design: {
      title: "مصحح",
      subtitle: "القصص الجاهزة للتصميم.",
    },
    designed: {
      title: "مصمم",
      subtitle: "القصص المصممة.",
    },
    waiting_follow_up: {
      title: "مصحح",
      subtitle: "القصص الجاهزة للتصميم.",
    },
    published: {
      title: "مراجعة",
      subtitle: "القصص الجاهزة للنشر.",
    },
    resolved: {
      title: "مراجعة",
      subtitle: "القصص الجاهزة للنشر.",
    },
    archive: {
      title: "مصمم",
      subtitle: "الأرشيف.",
    },
    archived: {
      title: "مصمم",
      subtitle: "الأرشيف.",
    },
  },
};

// ─── Settings labels ─────────────────────────────────────────────────────────

const settingsLabels: WorkspaceSettingsLabels = {
  pageTitle: "الإعدادات",
  pageDesc: "تفضيلات مساحة العمل وكيفية تعامل مؤسستك مع المعلومات الحساسة.",
  unavailableTitle: "الإعدادات غير متاحة",
  unavailableBody: "لا يتضمن دورك صلاحية الوصول إلى الإعدادات. تواصل مع مالك المساحة أو مديرها إذا احتجت إلى تغيير.",
  sectionWorkspaceProfileTitle: "ملف مساحة العمل",
  sectionWorkspaceProfileBody: "سيظهر اسم مساحة العمل ومنطقتها هنا بعد الإعداد لمؤسستك.",
  sectionSecurityTitle: "الأمان",
  sectionSecurityBody: "تُدار سياسات تسجيل الدخول وتذكيرات الجلسة من قِبل مسؤول تقنية المعلومات في مؤسستك.",
  sectionDataHandlingTitle: "التعامل مع البيانات",
  sectionDataHandlingBody:
    "قواعد الاحتفاظ بالبيانات وتصديرها محددة مع فريق القيادة وتُطبَّق على مستوى البنية التحتية.",
  sectionIntegrationsTitle: "التكاملات",
  sectionIntegrationsBody: "اربط أدوات غرفة الأخبار لتبسيط عمليات التصدير.",
  oneDriveConnect: "ربط OneDrive",
  oneDriveReconnect: "إعادة ربط OneDrive",
  oneDriveCheckingStatus: "جارٍ التحقق من الحالة…",
  oneDriveConnected: "مرتبط",
  oneDriveNotConnected: "غير مرتبط",
  oneDriveDiagHint: "إذا لم تعمل المزامنة، شغّل التشخيص لمعرفة المشكلة بدقة.",
  oneDriveDiagRunning: "جارٍ التشغيل…",
  oneDriveDiagButton: "تشخيص الاتصال",
  oneDriveRestrictedNotice: "اتصالات OneDrive متاحة لمالكي مساحة العمل والمديرين فقط.",
  sectionTeamAccessTitle: "وصول الفريق",
  sectionTeamAccessBody:
    "ستتوفر الدعوات وتغييرات الأدوار هنا بعد تفعيل إدارة الأعضاء في مساحتك.",
};

// ─── Flat OrgLabels override ──────────────────────────────────────────────────

export const arLabels: Partial<OrgLabels> = {
  // ── Core labels ─────────────────────────────────────────────────────────────
  itemSingular: "تقرير",
  itemPlural: "تقارير",
  inbox: "البريد الوارد",
  assignments: "تحرير أول",
  myQueue: "قائمتك",
  analytics: "التحليلات",
  settings: "الإعدادات",
  managingEditorDesk: "مكتب رئيس التحرير",
  newsroomOperations: "مركز عمليات غرفة الأخبار",
  managingEditorDeskSubline:
    "مركز القيادة — القيادة والمراحل والملفات في لمحة واحدة.",
  runSheet: "ورقة العمل",
  activeReports: "تقديم",
  new: "تقديم",
  needsTriage: "مواد خام",
  withLead: "تحرير أول",
  inReview: "تحرير ثاني",
  awaitingFollowUp: "تصحيح",
  resolved: "مصحح",
  archive: "مصمم",
  noLeadYet: "لا قائد بعد",
  needsALead: "الوارد",
  resolvedToday: "مراجعة اليوم",
  onTheBooks: "في السجل",
  unclaimedPickTheseUpFirst: "غير مُسندة — ابدأ بهذه أولاً",

  // ── Role labels ──────────────────────────────────────────────────────────────
  roleLabels: {
    owner: "رئيس التحرير",
    admin: "مدير التحرير",
    reviewer: "محرر",
    intake: "مدقق",
    readonly: "مشاهد",
  },

  // ── Stage labels (canonical 7-value set) ─────────────────────────────────────
  caseStatusLabels: {
    incoming: "تقديم",
    raw: "مواد خام",
    first_edit: "تحرير أول",
    second_edit: "تحرير ثاني",
    in_review: "تصحيح",
    reviewed: "مصحح",
    designed: "مصمم",
  },

  // ── Chrome / shell ───────────────────────────────────────────────────────────
  poweredByPrefix: "مدعوم من",
  editorDeskSidebarTitle: "مكتب التحرير",
  navSectionYourDesk: "مكتبك",
  navSectionQueues: "القوائم",
  navSectionMenu: "القائمة",
  teamNavManagingEditor: "قائمة الفريق",
  teamNavDefault: "الفريق",
  sidebarSuspenseFallbackBadge: "SR",
  sidebarSuspenseFallbackSubtitle: "إدارة الحالات",
  editorDeskHeaderSuspenseTitle: "مكتب التحرير",
  editorDeskHeaderSuspenseSubtitle: "اعمل بوضوح وحرّك الملفات إلى الأمام.",
  intakeTopbarTitle: "مكتب الأخبار",
  intakeTopbarSubtitle:
    "وجّه النصائح، احتفظ بالمسار واضحاً، حرّك العمل إلى الأمام.",

  // ── Detail inspector ─────────────────────────────────────────────────────────
  detailRoomSnapshotTitle: "لقطة",
  detailRoomCheckTitle: "فحص الغرفة",
  detailOverviewTitle: "نظرة عامة",
  notesTriageTitle: "ملاحظات الفرز",
  notesDeskTitle: "ملاحظات المكتب",
  notesNewsroomTitle: "ملاحظات غرفة الأخبار",
  notesInternalTitle: "ملاحظات داخلية",
  emptyPanelTitleEditor: "قائمتك",
  emptyPanelTitleManagingEditor: "مركز القيادة",
  emptyPanelTitleDefault: "اختر تقريراً",
  emptyPanelSubtitleEditor: "قصة واحدة في كل مرة — اضغط على البطاقة للعمل عليها.",
  emptyPanelSubtitleManagingEditor:
    "اختر بطاقة لتوجيه القادة والمراحل والملف الكامل.",
  emptyPanelSubtitleDefault: "اختر بطاقة للقراءة والتوجيه وإغلاق الحلقة.",
  emptyPanelBodyEditor:
    "البطاقات مرتبة للتركيز. افتح إحداها لرؤية الملخص وكلمات المراسل وملاحظات مكتبك معاً.",
  emptyPanelBodyManagingEditor:
    "اللوحة حية. افتح أي بطاقة لتحريك الملكية وتغيير المراحل أو قراءة ما وصل من الميدان.",
  emptyPanelBodyDefault:
    "اضغط على بطاقة لقراءة ما وصل والتنسيق مع الفريق والحفاظ على المسار واضحاً.",

  // ── Run sheet ────────────────────────────────────────────────────────────────
  runSheetAriaLabel: "ورقة عمل غرفة الأخبار",
  runSheetIntroLede:
    "أعداد حية من قائمتك — الوارد، ما هو قيد التنفيذ، وأين يتراكم العمل.",
  mePipelineInMotionLabel: "قيد التنفيذ",
  mePipelineInMotionHint: "غير منتهية أو مؤرشفة",
  meOnTheBooksHint: "كل شيء غير مؤرشف",
  meResolvedStillOpenLabel: "منتهية، لا تزال مفتوحة",
  meResolvedStillOpenHint: "جاهزة للأرشفة أو الحفظ",
  meWhereItStacksTitle: "أين يتراكم (قيد التنفيذ)",
  meBottleneckBalancedCopy: "لا توجد مرحلة واحدة تحمل أكثر من غيرها الآن.",
  meAssignmentStatusAriaLabel: "حالة الإسناد",
  meAllClaimedMessage: "كل تقديم قيد التنفيذ لديه شخص مسند إليه.",
  meUnclaimedOverflowSuffix:
    " أخرى قيد التنفيذ لا تزال تحتاج من يتولاها — تصفح التقارير النشطة أو المواد الخام في القائمة.",

  // ── Board / case list ────────────────────────────────────────────────────────
  emptyNoCasesTitleEditor: "لا يوجد شيء على مكتبك بعد",
  emptyNoCasesTitleManagingEditor: "الخط هادئ",
  emptyNoCasesTitleDefault: "لا توجد حالات بعد",
  emptyNoCasesBodyEditor:
    "عندما يُسند المكتب تقديماً إليك، سيظهر هنا. تحقق مجدداً بعد جولة التوجيه القادمة.",
  emptyNoCasesBodyManagingEditor:
    "عندما تبدأ النصائح في الوصول، ستظهر هنا مع القادة والمراحل الحية حتى تتمكن من إدارة الغرفة.",
  emptyNoCasesBodyDefault:
    "عند وصول تقرير جديد، سيظهر هنا لفريقك للعمل عليه.",
  emptyReviewerNothingAssignedTitle: "لا يوجد شيء مُسند إليك الآن",
  emptyReviewerNothingAssignedBody:
    "تظهر قائمتك فقط التقديمات التي أنت القائد فيها. إذا توقعت عملاً هنا، اطلب من المكتب تأكيد الإسناد — قد يكون لا يزال في مرحلة التوجيه.",
  intakeEmptyTitle: "لا يوجد شيء في الفرز",
  intakeEmptyBeforeStates: "يرى الاستقبال فقط التقارير في حالة ",
  intakeEmptyStateNewLabel: "تقديم",
  intakeEmptyOrWord: " أو ",
  intakeEmptyStateTriageLabel: "مواد خام",
  intakeEmptyAfterStates: ". عند وصول التقديمات في هذه الحالات، ستظهر هنا.",
  viewEmptyMyQueueTitle: "لا يوجد شيء مُسند إليك الآن.",
  viewEmptyMyQueueBody: "عندما تُعيَّن قائداً على تقرير، سيظهر هنا لوصول سريع.",
  viewEmptyAssignedWorkTitle: "لا يوجد عمل مُسند الآن.",
  viewEmptyAssignedWorkBody: "العناصر التي لديها قائد بالفعل.",
  viewEmptyNeedsLeadTitle: "لا توجد عناصر تحتاج قائداً الآن.",
  viewEmptyNeedsLeadBody: "عناصر غير مُسندة تنتظر التكليف.",
  viewEmptyWithLeadBody: "العمل المُسند سيظهر هنا بمجرد تعيين قائد.",
  viewEmptyResolvedBody: "عندما يُحفظ العمل بحالة منتهية، سيظهر هنا.",
  viewEmptyArchiveBody: "عندما يُؤرشف العمل، سيظهر هنا.",
  viewEmptyActiveReportsBody:
    "انتقل إلى قائمة أخرى على اليسار أو انتظر تقديمات جديدة — ورقة العمل أعلاه تعكس الغرفة كاملة.",
  viewEmptyQueueClearTitle: "القائمة فارغة",
  viewEmptyDefaultTitle: "لا يوجد شيء في هذه القائمة",
  viewEmptyDefaultBody: "جرّب تبويباً آخر، أو تابع عندما تتقدم التقارير في المراحل.",
  stageColumnTitleDesk: "أين وصل",
  stageColumnTitleDefault: "حالة التقرير",
  leadColumnTitleDesk: "من يتولاه",
  leadColumnTitleDefault: "المسؤول",
  cardOpenLabel: "فتح",
  cardAssignLabel: "إسناد",
  loadingSession: "ستُحمَّل الحالات عند اكتمال جلسة العمل.",
  loadingRole: "تعذّر تحميل دور مساحة العمل.",
  openingAnalytics: "جارٍ فتح التحليلات…",
  redirectingAnalytics: "جارٍ التحويل إلى مساحتك…",
  analyticsTitle: "تحليلات مساحة العمل",
  analyticsDesc: "وصول للقراءة فقط: مقاييس ملخصة. قوائم الحالات والملفات الكاملة وإجراءات الكتابة مخفية لهذا الدور.",
  errorSomethingWentWrong: "حدث خطأ ما",

  // ── Team page ────────────────────────────────────────────────────────────────
  teamPageTitle: "الفريق",
  teamRosterLimitedBody:
    "قائمة الفريق مقتصرة على أدوار المالك والمدير في هذا الفضاء.",
  teamPageIntro:
    "صورة بسيطة عمّن في هذا الفضاء اليوم. ستصل الدعوات وتحرير القائمة في مرحلة لاحقة.",
  teamYouLabel: "أنت",
  teamColleaguesLabel: "الزملاء (معاينة)",
  teamColleaguesCountNote:
    "ستعكس الأعداد الإسنادات الحية عند تخزين حقل المالك على كل حالة. إدارة الأعضاء والدعوات غير متاحة في هذا الإصدار.",

  // ── Nested label group replacements ─────────────────────────────────────────
  deskLabels,
  actionLabels,
  priorityLabels,
  detailSectionLabels,
  exportDocxLabels,
  editorDeskHeaders,
  settingsLabels,
  notificationLabels: {
    bellAriaLabel: "الإشعارات",
    emptyState: "لا توجد إشعارات بعد",
    markAllRead: "تعليم الكل كمقروء",
    assignedTitle: "تم إسناد حالة",
    assignedBody: "تم تعيينك على الحالة {ref}.",
    designedTitle: "حالة جاهزة للنشر",
    designedBody: "الحالة {ref} جاهزة للنشر.",
    emailSubjectAssigned: "تم تعيينك على الحالة {ref}",
    emailSubjectDesigned: "الحالة {ref} جاهزة للنشر",
    emailViewCase: "عرض الحالة",
    emailFooter: "Secure Desk — غرفة أخبار Sudan Facts",
    byActor: "بواسطة:",
    relativeTimeJustNow: "الآن",
    relativeTimeMinutesAgo: "منذ {n} دقيقة",
    relativeTimeHoursAgo: "منذ {n} ساعة",
    relativeTimeDaysAgo: "منذ {n} يوم",
  },
};
