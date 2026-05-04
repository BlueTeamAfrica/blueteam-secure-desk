"use client";

import type { CaseStatus, WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import { PRIORITY_LABEL, ownerDisplayLine } from "@/app/_lib/caseWorkspaceModel";
import type { CachedCaseFiling } from "@/app/_lib/decryptedSubmissionReadout";
import { getSubmissionDisplay } from "@/app/_lib/items/getSubmissionDisplay";
import type { WorkspaceRole } from "@/app/_lib/rbac";
import { getOrgLabels } from "@/app/_lib/org/getOrgLabels";
import { ItemAssignmentPanel } from "@/components/items/ItemAssignmentPanel";
import { ItemStatusBadge } from "@/components/items/ItemStatusBadge";
import { getFirebaseAuth } from "@/app/_lib/firebase/auth";
import { fetchSubmissionAttachmentSignedUrl, openSignedUrlInNewTab } from "@/app/_lib/downloadSubmissionAttachment";
import type { ExportPackage } from "@/app/_lib/integrations/types";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";

type WorkspaceMemberRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
};

type SubmissionAuditEvent = {
  id: string;
  action: string;
  adminUid: string | null;
  adminEmail: string | null;
  createdAt: string | null;
  details: Record<string, unknown> | null;
};

type ExportPackagePreviewResponse = {
  package: ExportPackage;
};

function truncateMiddle(s: string, maxLen: number): string {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  if (maxLen < 12) return t.slice(0, Math.max(1, maxLen));
  const head = Math.ceil((maxLen - 1) / 2) - 1;
  const tail = Math.floor((maxLen - 1) / 2) - 1;
  return `${t.slice(0, Math.max(1, head))}…${t.slice(Math.max(0, t.length - Math.max(1, tail)))}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function relativeTimeShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return "—";
  const diffSec = Math.round((ms - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 48) return rtf.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  return rtf.format(diffDay, "day");
}

function formatAuditWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d >= startOfToday) return `Today ${time}`;
  if (d >= startOfYesterday && d < startOfToday) return `Yesterday ${time}`;
  // If not today/yesterday, keep it compact.
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function yyyyMmDdFromIso(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isOverdue(selected: WorkspaceCase): boolean {
  if (!selected.dueDate) return false;
  if (selected.status === "resolved" || selected.status === "archived") return false;
  const d = new Date(selected.dueDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function auditActionLabel(action: string, labels: ReturnType<typeof getOrgLabels>): string {
  const a = labels.actionLabels;
  if (action === "decrypt") {
    const variants = ["Viewed this report", "Reviewed this filing", "Opened the report"] as const;
    // Stable-ish variant per submission/action without additional state.
    const idx = action.length % variants.length;
    return variants[idx]!;
  }
  if (action === "save_reviewer_note") return "Added note";
  if (action === "mark_in_review" || action === "mark_verified") return "Updated review status";
  if (action === "download_attachment") return a.download || "Downloaded attachment";
  if (action === "export_docx") return a.exportDocx || "Exported Word";
  if (action === "delete") return a.delete || "Deleted report";
  if (action === "update_priority") return "Priority updated";
  if (action === "update_due_date") return "Due date updated";
  // These are rendered with richer lines (see below); keep a fallback.
  if (action === "assign_owner") return a.setLead || a.assign || "Assigned";
  if (action === "update_case_status") return a.applyStageChange || "Moved stage";
  return action.replace(/_/g, " ");
}

function isAuditEventNewer(a: SubmissionAuditEvent, b: SubmissionAuditEvent): number {
  const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  // Newest first
  return tb - ta;
}

function stableVariantIndex(s: string, mod: number): number {
  let acc = 0;
  for (let i = 0; i < s.length; i += 1) acc = (acc + s.charCodeAt(i)) % 1_000_000;
  return mod <= 0 ? 0 : acc % mod;
}

function auditActionLineFromEvent(ev: SubmissionAuditEvent, labels: ReturnType<typeof getOrgLabels>): string {
  const assigneeLine = assigneeLineFromDetails(ev.details);
  const attachmentLine = attachmentLineFromDetails(ev.details);

  if (ev.action === "assign_owner") {
    const whoAssigned = assigneeLine ? displayNameFromEmailOrId(assigneeLine) : "someone";
    return `Assigned to ${whoAssigned}`;
  }
  if (ev.action === "update_case_status") {
    const from = (() => {
      if (!ev.details) return null;
      const v = safeString(ev.details.from);
      return v ? statusLabelFromId(v, labels) : null;
    })();
    const to = (() => {
      if (!ev.details) return null;
      const v = safeString(ev.details.to);
      return v ? statusLabelFromId(v, labels) : null;
    })();
    if (from && to) return `Moved from ${from} to ${to}`;
    return to ? `Moved to ${to}` : "Moved stage";
  }
  if (ev.action === "mark_in_review") return "Reviewed progress";
  if (ev.action === "mark_verified") return "Reviewed and verified";
  if (ev.action === "save_reviewer_note") return "Updated review notes";
  if (ev.action === "download_attachment") {
    return attachmentLine ? `Downloaded ${attachmentLine}` : "Downloaded attachment";
  }
  if (ev.action === "decrypt") {
    const variants = ["Reviewed this filing", "Checked the filing", "Opened the report"] as const;
    const idx = stableVariantIndex(ev.id || ev.createdAt || "decrypt", variants.length);
    return variants[idx]!;
  }
  if (ev.action === "update_priority") {
    const from = ev.details ? safeString(ev.details.from) : null;
    const to = ev.details ? safeString(ev.details.to) : null;
    if (from && to) return `Priority changed from ${PRIORITY_LABEL[from as keyof typeof PRIORITY_LABEL] ?? from} to ${PRIORITY_LABEL[to as keyof typeof PRIORITY_LABEL] ?? to}`;
    if (to) return `Priority set to ${PRIORITY_LABEL[to as keyof typeof PRIORITY_LABEL] ?? to}`;
    return "Priority updated";
  }
  if (ev.action === "update_due_date") {
    const to = ev.details ? safeString(ev.details.to) : null;
    if (!to) return "Cleared due date";
    const d = new Date(to);
    const when = Number.isNaN(d.getTime()) ? to : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `Due date set to ${when}`;
  }
  if (ev.action === "export_docx") return labels.actionLabels.exportDocx || "Exported Word (.docx)";
  if (ev.action === "delete") return labels.actionLabels.delete || "Deleted report";

  return auditActionLabel(ev.action, labels);
}

function groupKeyForAuditEvent(ev: SubmissionAuditEvent): string {
  const actor = (ev.adminEmail ?? ev.adminUid ?? "").trim().toLowerCase();
  if (ev.action === "update_case_status") {
    const from = ev.details ? safeString(ev.details.from) : null;
    const to = ev.details ? safeString(ev.details.to) : null;
    return `${ev.action}|${actor}|${from ?? ""}->${to ?? ""}`;
  }
  if (ev.action === "assign_owner") {
    const assigneeUid = ev.details ? safeString(ev.details.assigneeUid) : null;
    const assignedOwnerName = ev.details ? safeString(ev.details.assignedOwnerName) : null;
    return `${ev.action}|${actor}|${assigneeUid ?? ""}|${assignedOwnerName ?? ""}`;
  }
  if (ev.action === "download_attachment") {
    const attachmentId = ev.details ? safeString(ev.details.attachmentId) : null;
    const name = ev.details ? safeString(ev.details.name) : null;
    return `${ev.action}|${actor}|${attachmentId ?? ""}|${name ?? ""}`;
  }
  if (ev.action === "update_priority") {
    const from = ev.details ? safeString(ev.details.from) : null;
    const to = ev.details ? safeString(ev.details.to) : null;
    return `${ev.action}|${actor}|${from ?? ""}->${to ?? ""}`;
  }
  if (ev.action === "update_due_date") {
    const to = ev.details ? safeString(ev.details.to) : null;
    return `${ev.action}|${actor}|${to ?? ""}`;
  }
  return `${ev.action}|${actor}`;
}

type CollapsedAuditEvent = {
  id: string;
  action: string;
  adminUid: string | null;
  adminEmail: string | null;
  latestAt: string | null;
  oldestAt: string | null;
  details: Record<string, unknown> | null;
  count: number;
};

function collapseAuditEvents(events: SubmissionAuditEvent[]): CollapsedAuditEvent[] {
  const sorted = [...events].sort(isAuditEventNewer);
  const out: CollapsedAuditEvent[] = [];
  for (const ev of sorted) {
    const key = groupKeyForAuditEvent(ev);
    const prev = out.length > 0 ? out[out.length - 1] : null;
    const prevKey = prev
      ? groupKeyForAuditEvent({
          id: prev.id,
          action: prev.action,
          adminUid: prev.adminUid,
          adminEmail: prev.adminEmail,
          createdAt: prev.latestAt,
          details: prev.details,
        })
      : null;

    if (prev && prevKey === key) {
      prev.count += 1;
      // Keep newest timestamp in latestAt; update oldestAt as we extend the group.
      prev.oldestAt = ev.createdAt ?? prev.oldestAt;
      continue;
    }
    out.push({
      id: ev.id,
      action: ev.action,
      adminUid: ev.adminUid,
      adminEmail: ev.adminEmail,
      latestAt: ev.createdAt,
      oldestAt: ev.createdAt,
      details: ev.details,
      count: 1,
    });
  }
  return out;
}

function displayNameFromEmailOrId(raw: string | null): string {
  const t = (raw ?? "").trim();
  if (!t) return "Staff";
  const looksLikeEmail = t.includes("@") && !t.includes(" ");
  if (!looksLikeEmail) return t;
  const local = t.slice(0, t.indexOf("@")).replace(/[._-]+/g, " ").trim();
  if (!local) return t;
  return local
    .split(/\s+/g)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function statusLabelFromId(statusId: string, labels: ReturnType<typeof getOrgLabels>): string {
  return (labels.caseStatusLabels as Record<string, string | undefined>)[statusId] ?? statusId;
}

function roleLabelFromEmailOrId(
  actorRaw: string | null,
  labels: ReturnType<typeof getOrgLabels>,
): string | null {
  const t = (actorRaw ?? "").trim().toLowerCase();
  if (!t) return null;
  // Lightweight heuristic: if the email contains "owner/admin/reviewer/intake/readonly" tokens, show label.
  // (We don't fetch team roster here; UI-only.)
  const map = labels.roleLabels as Record<string, string | undefined>;
  if (t.includes("owner")) return map.owner ?? null;
  if (t.includes("admin")) return map.admin ?? null;
  if (t.includes("reviewer") || t.includes("editor")) return map.reviewer ?? null;
  if (t.includes("intake") || t.includes("proof")) return map.intake ?? null;
  if (t.includes("readonly") || t.includes("viewer")) return map.readonly ?? null;
  return null;
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function assigneeLineFromDetails(details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  const name = safeString(details.assignedOwnerName);
  if (name) return name;
  const uid = safeString(details.assigneeUid);
  return uid;
}

function attachmentLineFromDetails(details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  const name = safeString(details.name);
  if (name) return name;
  const id = safeString(details.attachmentId);
  return id ? `Attachment ${id}` : null;
}

function formatBytes(size: number | null): string {
  if (size === null || size === undefined) return "—";
  if (!Number.isFinite(size)) return "—";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let v = size / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function humanizeChannel(s: string | null): string {
  if (!s) return "—";
  return s
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function apiErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  if (!("error" in body)) return null;
  const err = (body as { error?: unknown }).error;
  return typeof err === "string" && err.trim() ? err : null;
}

type DetailSectionKey = "reporter" | "filing" | "room" | "notes" | "attachments";

const DEFAULT_SECTION_OPEN: Record<DetailSectionKey, boolean> = {
  reporter: false,
  filing: true,
  room: false,
  notes: false,
  attachments: false,
};

function DetailReadSection({
  sectionKey,
  title,
  isOpen,
  onToggle,
  children,
}: {
  sectionKey: DetailSectionKey;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = `detail-read-${sectionKey}`;
  return (
    <section className="detail-read-section" aria-labelledby={`${panelId}-label`}>
      <h3 className="detail-read-section__heading">
        <button
          type="button"
          id={`${panelId}-label`}
          className="detail-read-section__toggle"
          aria-expanded={isOpen}
          aria-controls={`${panelId}-region`}
          onClick={onToggle}
        >
          <span className="detail-read-section__chevron" aria-hidden />
          <span className="detail-read-section__title">{title}</span>
        </button>
      </h3>
      {isOpen ? (
        <div id={`${panelId}-region`} role="region" className="detail-read-section__region" aria-labelledby={`${panelId}-label`}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function ItemDetailPanel({
  selected,
  selectedCaseFiling,
  role,
  editorDesk,
  managingEditorDesk,
  scaffoldMessage,
  setScaffoldMessage,
  showDecrypt,
  decryptError,
  decryptPanelLoading,
  stageLabel,
  leadLabel,
  priorityLabel,
  notesEnabled,
  noteDraft,
  setNoteDraft,
  actionPending,
  actionError,
  onSaveNote,
  showAssign,
  assignPanelOpen,
  setAssignPanelOpen,
  membersLoading,
  membersError,
  workspaceMembers,
  assigneeUidDraft,
  setAssigneeUidDraft,
  assignBusy,
  assignError,
  onConfirmAssignOwner,
  showPriorityScaffold,
  showResolveArchive,
  onResolve,
  onArchive,
  showDelete,
  deleteConfirmOpen,
  setDeleteConfirmOpen,
  deleteBusy,
  deleteError,
  onDeletePermanently,
  showExportDocx,
  exportDocxBusy,
  exportDocxError,
  onExportDocx,
  showExportOneDrive,
  exportOneDriveBusy,
  exportOneDriveError,
  onExportOneDrive,
  showStatusPicker,
  allowedStatusTargets,
  workflowStatusDraft,
  setWorkflowStatusDraft,
  workflowBusy,
  workflowError,
  onApplyWorkflowStatus,
}: {
  selected: WorkspaceCase | null;
  selectedCaseFiling: CachedCaseFiling | undefined;
  role: WorkspaceRole;
  editorDesk: boolean;
  managingEditorDesk: boolean;
  scaffoldMessage: string | null;
  setScaffoldMessage: (v: string | null) => void;
  showDecrypt: boolean;
  decryptError: string | null;
  decryptPanelLoading: boolean;
  stageLabel: string;
  leadLabel: string;
  priorityLabel: string;
  notesEnabled: boolean;
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  actionPending: boolean;
  actionError: string | null;
  onSaveNote: () => void;
  showAssign: boolean;
  assignPanelOpen: boolean;
  setAssignPanelOpen: (open: boolean) => void;
  membersLoading: boolean;
  membersError: string | null;
  workspaceMembers: WorkspaceMemberRow[];
  assigneeUidDraft: string;
  setAssigneeUidDraft: (v: string) => void;
  assignBusy: boolean;
  assignError: string | null;
  onConfirmAssignOwner: () => void;
  showPriorityScaffold: boolean;
  showResolveArchive: boolean;
  onResolve: () => void;
  onArchive: () => void;
  showDelete: boolean;
  deleteConfirmOpen: boolean;
  setDeleteConfirmOpen: (open: boolean) => void;
  deleteBusy: boolean;
  deleteError: string | null;
  onDeletePermanently: () => void;
  showExportDocx: boolean;
  exportDocxBusy: boolean;
  exportDocxError: string | null;
  onExportDocx: () => void;
  showExportOneDrive: boolean;
  exportOneDriveBusy: boolean;
  exportOneDriveError: string | null;
  onExportOneDrive: () => void;
  showStatusPicker: boolean;
  allowedStatusTargets: CaseStatus[];
  workflowStatusDraft: CaseStatus | null;
  setWorkflowStatusDraft: (v: CaseStatus) => void;
  workflowBusy: boolean;
  workflowError: string | null;
  onApplyWorkflowStatus: () => void;
}) {
  const { labels } = useDashboardBranding();
  const action = labels.actionLabels ?? ({} as Partial<(typeof labels)["actionLabels"]>);
  const desk = labels.deskLabels ?? ({} as Partial<(typeof labels)["deskLabels"]>);
  const section = labels.detailSectionLabels ?? ({} as Partial<(typeof labels)["detailSectionLabels"]>);
  const detailPanelClass = `detail-panel${managingEditorDesk ? " detail-panel--command" : ""}`;
  const [busyAttachmentIds, setBusyAttachmentIds] = useState<Set<string>>(() => new Set());
  const [attachmentErrorById, setAttachmentErrorById] = useState<Record<string, string | null>>({});
  const [openSections, setOpenSections] = useState(DEFAULT_SECTION_OPEN);

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<SubmissionAuditEvent[]>([]);

  const [priorityDraft, setPriorityDraft] = useState<WorkspaceCase["priority"]>("normal");
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [dueDateDraft, setDueDateDraft] = useState<string>("");
  const [dueDateBusy, setDueDateBusy] = useState(false);
  const [dueDateError, setDueDateError] = useState<string | null>(null);

  const [exportPreviewLoading, setExportPreviewLoading] = useState(false);
  const [exportPreviewError, setExportPreviewError] = useState<string | null>(null);
  const [exportPreview, setExportPreview] = useState<ExportPackage | null>(null);

  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const user = getFirebaseAuth().currentUser;
      if (!user) {
        throw new Error("No current user.");
      }
      const headers = new Headers(init?.headers ?? undefined);
      const run = async (forceRefresh: boolean) => {
        const token = await user.getIdToken(forceRefresh);
        headers.set("Authorization", `Bearer ${token}`);
        return await fetch(url, { ...init, headers });
      };
      let res = await run(false);
      if (res.status === 401) {
        res = await run(true);
        if (res.status === 401) console.warn("auth session valid but API authorization failed");
      }
      return res;
    },
    [],
  );

  useEffect(() => {
    setOpenSections(DEFAULT_SECTION_OPEN);
  }, [fetchWithAuth, selected?.id]);

  useEffect(() => {
    if (!selected) return;
    setPriorityDraft(selected.priority);
    setPriorityError(null);
    setDueDateDraft(yyyyMmDdFromIso(selected.dueDate));
    setDueDateError(null);
  }, [selected]);

  useEffect(() => {
    setBusyAttachmentIds(new Set());
    setAttachmentErrorById({});
  }, [fetchWithAuth, selected?.id]);

  useEffect(() => {
    if (!selected?.id) {
      setAuditLoading(false);
      setAuditError(null);
      setAuditEvents([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setAuditLoading(true);
      setAuditError(null);
      try {
        const res = await fetchWithAuth(`/api/admin/submissions/${selected.id}/audit`, {
          method: "GET",
        });
        const body = (await res.json().catch(() => null)) as unknown;
        if (!res.ok) {
          if (res.status === 401) {
            setAuditError("You’re signed in, but activity could not be loaded (authorization failed).");
            return;
          }
          const msg = (() => {
            if (!body || typeof body !== "object") return null;
            if (!("error" in body)) return null;
            const err = (body as { error?: unknown }).error;
            return typeof err === "string" && err.trim() ? err : null;
          })();
          setAuditError(msg ?? "Could not load activity.");
          return;
        }
        const eventsRaw =
          body && typeof body === "object" && body !== null && "events" in body
            ? (body as { events?: unknown }).events
            : null;
        const list = Array.isArray(eventsRaw) ? (eventsRaw as SubmissionAuditEvent[]) : [];
        if (!cancelled) setAuditEvents(list);
      } catch {
        if (!cancelled) setAuditError("Network error while loading activity.");
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchWithAuth, selected?.id]);

  useEffect(() => {
    if (!selected?.id) {
      setExportPreviewLoading(false);
      setExportPreviewError(null);
      setExportPreview(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setExportPreviewLoading(true);
      setExportPreviewError(null);
      try {
        const res = await fetchWithAuth(`/api/admin/submissions/${selected.id}/export-package-preview`, {
          method: "GET",
        });
        const body = (await res.json().catch(() => null)) as unknown;
        if (!res.ok) {
          if (res.status === 401) {
            setExportPreviewError("You’re signed in, but the export preview could not be loaded (authorization failed).");
            return;
          }
          const msg = (() => {
            if (!body || typeof body !== "object") return null;
            if (!("error" in body)) return null;
            const err = (body as { error?: unknown }).error;
            return typeof err === "string" && err.trim() ? err : null;
          })();
          setExportPreviewError(msg ?? "Could not load export preview.");
          return;
        }
        const pkg =
          body && typeof body === "object" && body !== null && "package" in body
            ? (body as ExportPackagePreviewResponse).package
            : null;
        if (!cancelled) setExportPreview(pkg ?? null);
      } catch {
        if (!cancelled) setExportPreviewError("Network error while loading export preview.");
      } finally {
        if (!cancelled) setExportPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchWithAuth, selected?.id]);

  const toggleSection = useCallback((key: DetailSectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  if (!selected) {
    return (
      <aside className={detailPanelClass}>
        <div className="detail-panel-header">
          <div className="header-title">
            {editorDesk
              ? labels.emptyPanelTitleEditor
              : managingEditorDesk
                ? labels.emptyPanelTitleManagingEditor
                : labels.emptyPanelTitleDefault}
          </div>
          <div className="header-subtitle">
            {editorDesk
              ? labels.emptyPanelSubtitleEditor
              : managingEditorDesk
                ? labels.emptyPanelSubtitleManagingEditor
                : labels.emptyPanelSubtitleDefault}
          </div>
        </div>
        <div className="detail-panel-body">
          <p className="subtext" style={{ margin: 0 }}>
            {editorDesk
              ? labels.emptyPanelBodyEditor
              : managingEditorDesk
                ? labels.emptyPanelBodyManagingEditor
                : labels.emptyPanelBodyDefault}
          </p>
        </div>
      </aside>
    );
  }

  const display = getSubmissionDisplay({ submission: selected, decryptedFiling: selectedCaseFiling });
  const attachments =
    (selected.attachments ?? []).length > 0
      ? (selected.attachments ?? [])
      : (selectedCaseFiling?.attachments ?? []);
  const priorityValue =
    (labels.priorityLabels as Record<string, string | undefined> | undefined)?.[selected.priority] ??
    PRIORITY_LABEL[selected.priority] ??
    "—";
  const ageValue = relativeTimeShort(selected.createdAt);
  const updatedValue = relativeTimeShort(selected.updatedAt);
  const overdue = isOverdue(selected);
  const dueValue = selected.dueDate ? formatWhen(selected.dueDate) : "—";

  const roomSectionTitle = editorDesk
    ? labels.detailRoomSnapshotTitle
    : managingEditorDesk
      ? labels.detailRoomCheckTitle
      : labels.detailOverviewTitle;
  const notesSectionTitle =
    role === "intake"
      ? labels.notesTriageTitle
      : editorDesk
        ? labels.notesDeskTitle
        : managingEditorDesk
          ? labels.notesNewsroomTitle
          : labels.notesInternalTitle;

  return (
    <aside className={detailPanelClass}>
      <div className="detail-panel-header">
        <div className="header-title" dir="auto">
          {display.displayTitle}
        </div>
        <div className="small-muted" style={{ marginTop: 8 }}>
          Ref: {display.displayRef}
        </div>
        <p className="subtext" style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.5 }}>
          {selected.summary}
        </p>
        <div className="detail-meta-strip" aria-label="Report metadata">
          <div className="detail-meta-chip">
            <div className="detail-meta-label">{stageLabel}</div>
            <div className="detail-meta-value">
              {labels.caseStatusLabels[selected.status] ?? selected.status}
            </div>
          </div>
          <div className="detail-meta-chip">
            <div className="detail-meta-label">{leadLabel}</div>
            <div className="detail-meta-value" dir="auto">
              {ownerDisplayLine(selected)}
            </div>
          </div>
          <div className="detail-meta-chip">
            <div className="detail-meta-label">{priorityLabel}</div>
            <div className="detail-meta-value">{priorityValue}</div>
          </div>
          <div className="detail-meta-chip">
            <div className="detail-meta-label">Age</div>
            <div className="detail-meta-value">{ageValue}</div>
          </div>
          <div className="detail-meta-chip">
            <div className="detail-meta-label">Updated</div>
            <div className="detail-meta-value">{updatedValue}</div>
          </div>
          <div className="detail-meta-chip">
            <div className="detail-meta-label">Due</div>
            <div className="detail-meta-value">{overdue ? "Overdue" : dueValue}</div>
          </div>
        </div>
      </div>

      <div className="detail-panel-body detail-panel-body--read">
        {scaffoldMessage ? (
          <p className="subtext detail-read-ambient" style={{ margin: 0 }}>
            {scaffoldMessage}
          </p>
        ) : null}

        <DetailReadSection
          sectionKey="reporter"
          title={section.reporterSectionTitle ?? "Reporter"}
          isOpen={openSections.reporter}
          onToggle={() => toggleSection("reporter")}
        >
          <dl className="detail-dl detail-dl--read">
            <div>
              <dt className="detail-dt">{desk.filedByLabel ?? "Filed by"}</dt>
              <dd className="detail-dd" dir="auto">
                {display.displayReporterName}
              </dd>
            </div>
            <div>
              <dt className="detail-dt">Region</dt>
              <dd className="detail-dd" dir="auto">
                {display.displayReporterRegion ?? "—"}
              </dd>
            </div>
            {display.displayReporterPhone ? (
              <div>
                <dt className="detail-dt">Phone</dt>
                <dd className="detail-dd" dir="auto">
                  {display.displayReporterPhone}
                </dd>
              </div>
            ) : null}
            {display.displayReporterAlias ? (
              <div>
                <dt className="detail-dt">Alias</dt>
                <dd className="detail-dd" dir="auto">
                  {display.displayReporterAlias}
                </dd>
              </div>
            ) : null}
          </dl>
        </DetailReadSection>

        {role === "intake" ? (
          <div className="desk-notice detail-read-ambient">
            <div className="detail-section-title">Triage workspace</div>
            <p className="subtext" style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
              Work from the summary above and your triage notes below. Editors carry the full reporter
              filing once this clears the triage queue.
            </p>
          </div>
        ) : null}

        {showDecrypt ? (
          <DetailReadSection
            sectionKey="filing"
            title={section.filingSectionTitle ?? "From the reporter"}
            isOpen={openSections.filing}
            onToggle={() => toggleSection("filing")}
          >
            {!selected.encryptedPayload?.trim() ? (
              <p className="subtext" style={{ margin: 0 }}>
                {section.noReporterLetter ?? "No reporter letter was stored for this submission."}
              </p>
            ) : decryptError ? (
              <div className="alert alert-danger" role="alert">
                {decryptError}
              </div>
            ) : decryptPanelLoading ? (
              <div className="row-between" style={{ gap: 12, marginTop: 4 }}>
                <div className="spinner" />
                <span className="muted" style={{ fontSize: 14 }}>
                  {section.decryptLoading ?? "Opening the filing…"}
                </span>
              </div>
            ) : selectedCaseFiling ? (
              (() => {
                const titleLine = display.displayTitle.trim() ? display.displayTitle.trim() : "—";
                const bodyText = display.displayBody?.trim()
                  ? display.displayBody
                  : (section.noBodyText ?? "No body text was found in this filing.");
                return (
                  <div className="stack-12">
                    <div>
                      <div className="editorial-read-kicker">{section.titleAsFiled ?? "Title as filed"}</div>
                      <div className="editorial-read-title" dir="auto">
                        {titleLine}
                      </div>
                    </div>
                    <div>
                      <div className="editorial-read-kicker">{section.theirWords ?? "Their words"}</div>
                      <div className="editorial-read-body" dir="auto">
                        {bodyText}
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : null}
          </DetailReadSection>
        ) : null}

        <DetailReadSection
          sectionKey="room"
          title={roomSectionTitle}
          isOpen={openSections.room}
          onToggle={() => toggleSection("room")}
        >
          <dl className="detail-dl detail-dl--read">
            <div>
              <dt className="detail-dt">{priorityLabel}</dt>
              <dd className="detail-dd">{PRIORITY_LABEL[selected.priority]}</dd>
            </div>
            <div>
              <dt className="detail-dt">{leadLabel}</dt>
              <dd className="detail-dd">{ownerDisplayLine(selected)}</dd>
            </div>
            <div>
              <dt className="detail-dt">{stageLabel}</dt>
              <dd className="detail-dd">
                <ItemStatusBadge status={selected.status} />
              </dd>
            </div>
          </dl>
        </DetailReadSection>

        <DetailReadSection
          sectionKey="notes"
          title={notesSectionTitle}
          isOpen={openSections.notes}
          onToggle={() => toggleSection("notes")}
        >
          <p className="small-muted" style={{ margin: "0 0 10px" }}>
            {role === "intake"
              ? (section.notesHintTriage ??
                "Short triage context (same internal field as staff notes until dedicated triage fields ship).")
              : editorDesk
                ? (section.notesHintDesk ?? "Visible only to staff in this newsroom — not to the person who filed.")
                : managingEditorDesk
                  ? (section.notesHintManagingEditor ?? "Only staff in this workspace — never shared back to the source.")
                  : "Private to staff in this workspace — not visible to the person who filed the report."}
          </p>
          <textarea
            className="input detail-read-notes-input"
            rows={4}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            disabled={actionPending || workflowBusy || !notesEnabled}
            placeholder={
              editorDesk
                ? "Angles checked, calls made, what the desk should know next…"
                : managingEditorDesk
                  ? "Decisions, holds, partner reads — what the next ME shift must know…"
                  : "Coordination, follow-up attempts, partner contacts…"
            }
            style={{ minHeight: 100, resize: "vertical" }}
          />
        </DetailReadSection>

        <div className="detail-read-ambient">
          <div className="detail-section-title">
            {editorDesk
              ? (section.detailMetaTitleEditor ?? "Story file")
              : managingEditorDesk
                ? (section.detailMetaTitleManagingEditor ?? "File & routing")
                : (section.detailMetaTitleDefault ?? "Case details")}
          </div>
          <dl className="detail-dl">
            <div>
              <dt className="detail-dt">{section.detailMetaSubmitted ?? "Submitted"}</dt>
              <dd className="detail-dd">{formatWhen(selected.createdAt)}</dd>
            </div>
            <div>
              <dt className="detail-dt">{section.detailMetaUpdated ?? "Updated"}</dt>
              <dd className="detail-dd">{formatWhen(selected.updatedAt)}</dd>
            </div>
            <div>
              <dt className="detail-dt">
                {editorDesk || managingEditorDesk
                  ? (section.detailMetaDeskLine ?? "Desk line")
                  : (section.detailMetaWorkflowStatus ?? "Workflow status")}
              </dt>
              <dd className="detail-dd">{humanizeChannel(selected.workflowStatus)}</dd>
            </div>
            <div>
              <dt className="detail-dt">{stageLabel}</dt>
              <dd className="detail-dd">{labels.caseStatusLabels[selected.status]}</dd>
            </div>
            <div>
              <dt className="detail-dt">{priorityLabel}</dt>
              <dd className="detail-dd">{PRIORITY_LABEL[selected.priority]}</dd>
            </div>
            <div>
              <dt className="detail-dt">{leadLabel}</dt>
              <dd className="detail-dd">{ownerDisplayLine(selected)}</dd>
            </div>
            <div>
              <dt className="detail-dt">
                {editorDesk || managingEditorDesk
                  ? (section.detailMetaHowItArrived ?? "How it arrived")
                  : (section.detailMetaSourceChannel ?? "Source channel")}
              </dt>
              <dd className="detail-dd">{humanizeChannel(selected.sourceChannel)}</dd>
            </div>
          </dl>

          <div style={{ marginTop: 12 }}>
            <div className="editorial-read-kicker">Export package preview</div>
            {exportPreviewLoading ? (
              <div className="row-between" style={{ gap: 12, marginTop: 6 }}>
                <div className="spinner" />
                <span className="muted" style={{ fontSize: 14 }}>
                  Loading export preview…
                </span>
              </div>
            ) : exportPreviewError ? (
              <div className="alert alert-danger" role="alert" style={{ marginTop: 10 }}>
                {exportPreviewError}
              </div>
            ) : exportPreview ? (
              (() => {
                const provider =
                  exportPreview.destination.provider === "manualDownload"
                    ? "Manual export / download"
                    : exportPreview.destination.provider;
                const folder = exportPreview.destination.folderName ?? "—";
                const plannedDocx = exportPreview.items.some((x) => x.kind === "docx");
                const plannedAttachments = exportPreview.items.filter((x) => x.kind === "attachment");
                const attachmentNames = plannedAttachments
                  .slice(0, 3)
                  .map((x) => truncateMiddle(x.filename, 46))
                  .filter(Boolean);
                const attachmentTail =
                  plannedAttachments.length > attachmentNames.length
                    ? ` +${plannedAttachments.length - attachmentNames.length} more`
                    : "";
                return (
                  <dl className="detail-dl" style={{ marginTop: 8 }}>
                    <div>
                      <dt className="detail-dt">Destination</dt>
                      <dd className="detail-dd">{provider}</dd>
                    </div>
                    <div>
                      <dt className="detail-dt">Folder</dt>
                      <dd className="detail-dd" dir="auto">
                        {folder}
                      </dd>
                    </div>
                    <div>
                      <dt className="detail-dt">Planned items</dt>
                      <dd className="detail-dd" dir="auto">
                        {plannedDocx ? "Word export" : "No Word export"}
                        {plannedAttachments.length > 0
                          ? ` · ${plannedAttachments.length} attachment${plannedAttachments.length === 1 ? "" : "s"}`
                          : ""}
                        {attachmentNames.length > 0 ? ` · ${attachmentNames.join(", ")}${attachmentTail}` : ""}
                      </dd>
                    </div>
                  </dl>
                );
              })()
            ) : (
              <div className="small-muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
                Preview not available yet.
              </div>
            )}
          </div>
        </div>

        <DetailReadSection
          sectionKey="attachments"
          title={section.attachmentsSectionTitle ?? "Attachments"}
          isOpen={openSections.attachments}
          onToggle={() => toggleSection("attachments")}
        >
          {attachments.length === 0 ? (
            <p className="subtext" style={{ margin: 0 }}>
              No attachments were uploaded with this report.
            </p>
          ) : (
            <div className="detail-attachment-list">
              {attachments.map((a) => (
                <div key={a.id} className="detail-attachment-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="strong" dir="auto" style={{ overflowWrap: "anywhere" }}>
                      {a.name}
                    </div>
                    <div className="small-muted" dir="auto" style={{ marginTop: 6, lineHeight: 1.6 }}>
                      {a.mimeType?.trim() ? a.mimeType : "—"} · {formatBytes(a.size)}{" "}
                      {a.uploadedAt ? `· ${formatWhen(a.uploadedAt)}` : ""}
                    </div>
                    {attachmentErrorById[a.id] ? (
                      <div className="small-muted" style={{ marginTop: 6, color: "var(--danger)" }} dir="auto">
                        {attachmentErrorById[a.id]}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busyAttachmentIds.has(a.id)}
                    onClick={() => {
                      void (async () => {
                        if (busyAttachmentIds.has(a.id)) return;
                        setAttachmentErrorById((prev) => ({ ...prev, [a.id]: null }));
                        setBusyAttachmentIds((prev) => {
                          const next = new Set(prev);
                          next.add(a.id);
                          return next;
                        });
                        try {
                          const user = getFirebaseAuth().currentUser;
                          if (!user) {
                            setAttachmentErrorById((prev) => ({ ...prev, [a.id]: "Please sign in again." }));
                            return;
                          }
                          const result = await fetchSubmissionAttachmentSignedUrl({
                            submissionId: selected.id,
                            attachmentId: a.id,
                            getIdToken: (forceRefresh) => user.getIdToken(!!forceRefresh),
                          });
                          if (!result.ok) {
                            setAttachmentErrorById((prev) => ({ ...prev, [a.id]: result.error }));
                            return;
                          }
                          openSignedUrlInNewTab(result.signedUrl);
                        } catch {
                          setAttachmentErrorById((prev) => ({
                            ...prev,
                            [a.id]: "Network error while opening attachment.",
                          }));
                        } finally {
                          setBusyAttachmentIds((prev) => {
                            const next = new Set(prev);
                            next.delete(a.id);
                            return next;
                          });
                        }
                      })();
                    }}
                  >
                    {busyAttachmentIds.has(a.id)
                      ? (action.opening ?? "Opening…")
                      : (action.download ?? "Download")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </DetailReadSection>

        <div className="detail-read-actions">
          <div className="detail-section-title">
            {editorDesk
              ? (section.detailActionsTitleEditor ?? "Next steps")
              : managingEditorDesk
                ? (section.detailActionsTitleManagingEditor ?? "Workflow control")
                : (section.detailActionsTitleDefault ?? "Actions")}
          </div>
          <div className="detail-action-groups">
            {showPriorityScaffold ? (
              <div className="detail-action-group">
                <div className="detail-section-title" style={{ marginBottom: 10 }}>
                  Priority & due date
                </div>
                <div className="stack-12">
                  <div>
                    <label className="label" htmlFor="priority-select">
                      Priority
                    </label>
                    <div className="row-between" style={{ gap: 10, alignItems: "center" }}>
                      <select
                        id="priority-select"
                        className="input"
                        value={priorityDraft}
                        onChange={(e) => setPriorityDraft(e.target.value as WorkspaceCase["priority"])}
                        disabled={priorityBusy || dueDateBusy}
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                      <button
                        type="button"
                        className="btn"
                        disabled={priorityBusy || dueDateBusy || priorityDraft === selected.priority}
                        onClick={() => {
                          if (!selected?.id) return;
                          setPriorityBusy(true);
                          setPriorityError(null);
                          void (async () => {
                            try {
                              const user = getFirebaseAuth().currentUser;
                              if (!user) {
                                setPriorityError("Please sign in again.");
                                return;
                              }
                              const token = await user.getIdToken(true);
                              const res = await fetch(
                                `/api/admin/submissions/${encodeURIComponent(selected.id)}/priority`,
                                {
                                  method: "POST",
                                  headers: {
                                    Authorization: `Bearer ${token}`,
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({ priority: priorityDraft }),
                                },
                              );
                              const text = await res.text();
                              let body: unknown = null;
                              try {
                                body = text.length ? JSON.parse(text) : null;
                              } catch {
                                /* ignore */
                              }
                              if (!res.ok) {
                                setPriorityError(apiErrorMessage(body) ?? "Priority update failed.");
                              }
                            } catch {
                              setPriorityError("Network error while updating priority.");
                            } finally {
                              setPriorityBusy(false);
                            }
                          })();
                        }}
                      >
                        {priorityBusy ? "Saving…" : "Save"}
                      </button>
                    </div>
                    {priorityError ? (
                      <div className="alert alert-danger" role="alert">
                        {priorityError}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <label className="label" htmlFor="due-date-input">
                      Due date
                    </label>
                    <div className="row-between" style={{ gap: 10, alignItems: "center" }}>
                      <input
                        id="due-date-input"
                        type="date"
                        className="input"
                        value={dueDateDraft}
                        onChange={(e) => setDueDateDraft(e.target.value)}
                        disabled={dueDateBusy || priorityBusy}
                      />
                      <button
                        type="button"
                        className="btn"
                        disabled={dueDateBusy || priorityBusy || dueDateDraft === yyyyMmDdFromIso(selected.dueDate)}
                        onClick={() => {
                          if (!selected?.id) return;
                          setDueDateBusy(true);
                          setDueDateError(null);
                          void (async () => {
                            try {
                              const user = getFirebaseAuth().currentUser;
                              if (!user) {
                                setDueDateError("Please sign in again.");
                                return;
                              }
                              const token = await user.getIdToken(true);
                              const res = await fetch(
                                `/api/admin/submissions/${encodeURIComponent(selected.id)}/due-date`,
                                {
                                  method: "POST",
                                  headers: {
                                    Authorization: `Bearer ${token}`,
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({ dueDate: dueDateDraft ? dueDateDraft : null }),
                                },
                              );
                              const text = await res.text();
                              let body: unknown = null;
                              try {
                                body = text.length ? JSON.parse(text) : null;
                              } catch {
                                /* ignore */
                              }
                              if (!res.ok) {
                                setDueDateError(apiErrorMessage(body) ?? "Due date update failed.");
                              }
                            } catch {
                              setDueDateError("Network error while updating due date.");
                            } finally {
                              setDueDateBusy(false);
                            }
                          })();
                        }}
                      >
                        {dueDateBusy ? "Saving…" : "Save"}
                      </button>
                      {selected.dueDate ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={dueDateBusy || priorityBusy}
                          onClick={() => setDueDateDraft("")}
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    {dueDateError ? (
                      <div className="alert alert-danger" role="alert">
                        {dueDateError}
                      </div>
                    ) : null}
                    {overdue ? (
                      <div className="small-muted" style={{ marginTop: 10 }}>
                        This {labels.itemSingular.toLowerCase()} is past due.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {showAssign || showPriorityScaffold ? (
              <div className="detail-action-group">
                <div className="action-row">
                  {showAssign ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={actionPending || assignBusy || workflowBusy}
                      onClick={() => {
                        setScaffoldMessage(null);
                        setAssignPanelOpen(true);
                      }}
                    >
                      {managingEditorDesk
                        ? (action.setLead ?? "Set lead")
                        : (action.assign ?? "Assign")}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {showResolveArchive ? (
              <div className="detail-action-group">
                <div className="action-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={actionPending || workflowBusy}
                    onClick={onResolve}
                  >
                    {action.resolve ?? "Resolve"}
                  </button>
                  <button type="button" className="btn" disabled={actionPending || workflowBusy} onClick={onArchive}>
                    {action.archive ?? "Archive"}
                  </button>
                </div>
              </div>
            ) : null}
            {showExportDocx ? (
              <div className="detail-action-group">
                <div className="action-row">
                  <button
                    type="button"
                    className="btn"
                    disabled={exportDocxBusy || actionPending || assignBusy || workflowBusy}
                    onClick={onExportDocx}
                  >
                    {exportDocxBusy
                      ? (action.exportingDocx ?? "Preparing DOCX…")
                      : (action.exportDocx ?? "Export \u2192 Download DOCX")}
                  </button>
                  {showExportOneDrive ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={exportOneDriveBusy || exportDocxBusy || actionPending || assignBusy || workflowBusy}
                      onClick={onExportOneDrive}
                    >
                      {exportOneDriveBusy ? "Sending…" : "Export \u2192 Send to OneDrive"}
                    </button>
                  ) : null}
                </div>
                {!selectedCaseFiling?.body?.trim() ? (
                  <div className="small-muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
                    This export may omit the full narrative if the filing cannot be opened for your role.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {showExportDocx && exportDocxError ? (
            <div className="alert alert-danger" role="alert" style={{ marginTop: 12 }}>
              {exportDocxError}
            </div>
          ) : null}
          {showExportOneDrive && exportOneDriveError ? (
            <div className="alert alert-danger" role="alert" style={{ marginTop: 12 }}>
              {exportOneDriveError}
            </div>
          ) : null}

          {showDelete ? (
            <div className="stack-12 detail-read-actions-stack">
              {!deleteConfirmOpen ? (
                <button
                  type="button"
                  className="btn btn-delete"
                  disabled={deleteBusy || actionPending || assignBusy || workflowBusy}
                  onClick={() => {
                    setDeleteConfirmOpen(true);
                  }}
                >
                  {action.deleteEllipsis ?? "Delete report…"}
                </button>
              ) : (
                <div className="delete-confirm-panel card stack-12">
                  <p className="subtext" style={{ margin: 0, lineHeight: 1.55 }}>
                    {action.deleteConfirmBody ??
                      "This permanently removes this report from the newsroom by deleting the Firestore submission document. Anyone viewing this record will lose access. This cannot be undone."}
                  </p>
                  <div className="action-row" style={{ flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn"
                      disabled={deleteBusy}
                      onClick={() => setDeleteConfirmOpen(false)}
                    >
                      {action.deleteKeep ?? "Keep this report"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-delete-solid"
                      disabled={deleteBusy || actionPending || assignBusy || workflowBusy}
                      onClick={onDeletePermanently}
                    >
                      {deleteBusy ? "Deleting…" : (action.deletePermanently ?? "Delete permanently")}
                    </button>
                  </div>
                </div>
              )}
              {deleteError ? (
                <div className="alert alert-danger" role="alert">
                  {deleteError}
                </div>
              ) : null}
            </div>
          ) : null}

          {showStatusPicker && allowedStatusTargets.length > 0 && workflowStatusDraft ? (
            <div className="stack-12 detail-read-actions-stack">
              <label className="label" htmlFor="workflow-status-select">
                {stageLabel}
              </label>
              <select
                id="workflow-status-select"
                className="input"
                style={{ width: "100%", maxWidth: "100%" }}
                value={workflowStatusDraft}
                onChange={(e) => setWorkflowStatusDraft(e.target.value as CaseStatus)}
                disabled={workflowBusy}
              >
                {allowedStatusTargets
                  .slice()
                  .sort((a, b) => {
                    const order = labels.workflow.stageOrder;
                    const ia = order.indexOf(a);
                    const ib = order.indexOf(b);
                    const aRank = ia === -1 ? Number.POSITIVE_INFINITY : ia;
                    const bRank = ib === -1 ? Number.POSITIVE_INFINITY : ib;
                    return aRank - bRank;
                  })
                  .map((s) => (
                  <option key={s} value={s}>
                    {labels.caseStatusLabels[s]}
                  </option>
                ))}
              </select>
              <div className="action-row" style={{ flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={workflowBusy || workflowStatusDraft === selected.status}
                  onClick={onApplyWorkflowStatus}
                >
                  {workflowBusy
                    ? "Saving…"
                    : editorDesk || managingEditorDesk
                      ? (action.applyStageChange ?? "Apply stage change")
                      : (action.updateStatus ?? "Update status")}
                </button>
              </div>
              {workflowError ? (
                <div className="alert alert-danger" role="alert">
                  {workflowError}
                </div>
              ) : null}
            </div>
          ) : null}

          {managingEditorDesk ? (
            <p className="small-muted detail-read-actions-hint">
              Resolve and archive update what downstream desks see. Priority flags are still a placeholder in this build.
            </p>
          ) : !editorDesk ? (
            <p className="small-muted detail-read-actions-hint">
              Resolve and archive update case status in Firestore. Priority changes are not wired yet.
            </p>
          ) : null}

          <ItemAssignmentPanel
            open={assignPanelOpen && showAssign}
            managingEditorDesk={managingEditorDesk}
            role={role}
            membersLoading={membersLoading}
            membersError={membersError}
            workspaceMembers={workspaceMembers}
            assigneeUidDraft={assigneeUidDraft}
            assignBusy={assignBusy}
            assignError={assignError}
            onChangeAssigneeUid={setAssigneeUidDraft}
            onConfirm={onConfirmAssignOwner}
            onCancel={() => {
              setAssignPanelOpen(false);
            }}
          />

          <div className="action-row detail-read-actions-save">
            <button
              type="button"
              className="btn btn-primary"
              disabled={actionPending || workflowBusy || !notesEnabled}
              onClick={onSaveNote}
            >
              {role === "intake"
                ? (action.saveTriageNote ?? "Save triage note")
                : editorDesk
                  ? (action.saveDeskNote ?? "Save desk note")
                  : managingEditorDesk
                    ? (action.saveNewsroomNote ?? "Save newsroom note")
                    : (action.saveInternalNote ?? "Save internal note")}
            </button>
          </div>
          {actionError ? (
            <div className="alert alert-danger" role="alert" style={{ marginTop: 12 }}>
              {actionError}
            </div>
          ) : null}
        </div>

        <div className="detail-read-ambient">
          <div className="detail-section-title">
            Activity
          </div>
          {auditLoading ? (
            <p className="subtext" style={{ margin: 0 }}>{section.activityLoading ?? "Loading activity…"}</p>
          ) : auditError ? (
            <div className="alert alert-danger" role="alert" style={{ marginTop: 12 }}>
              {auditError}
            </div>
          ) : auditEvents.length === 0 ? (
            <p className="subtext" style={{ margin: 0 }}>{section.activityEmpty ?? "No activity yet."}</p>
          ) : (
            <div className="stack-12" style={{ marginTop: 8 }}>
              {collapseAuditEvents(auditEvents).map((ev) => {
                const actorRaw = ev.adminEmail ?? ev.adminUid;
                const who = displayNameFromEmailOrId(actorRaw);
                const whoRole = roleLabelFromEmailOrId(actorRaw, labels);
                const subLine = whoRole ? `${who} · ${whoRole}` : who;

                const baseLine = auditActionLineFromEvent(
                  {
                    id: ev.id,
                    action: ev.action,
                    adminUid: ev.adminUid,
                    adminEmail: ev.adminEmail,
                    createdAt: ev.latestAt,
                    details: ev.details,
                  },
                  labels,
                );

                const actionLine =
                  ev.count <= 1
                    ? baseLine
                    : ev.action === "decrypt"
                      ? `Reviewed ${ev.count} times`
                      : `${baseLine} (${ev.count}×)`;

                const when = formatAuditWhen(ev.latestAt);
                const metaLine = ev.count <= 1 ? `${when} · ${subLine}` : `Latest ${when} · ${subLine}`;

                return (
                  <div key={ev.id} className="detail-activity-row">
                    <div className="detail-activity-action" dir="auto">
                      {actionLine}
                    </div>
                    <div className="detail-activity-meta">
                      {metaLine}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

