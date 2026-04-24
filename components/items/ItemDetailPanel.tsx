"use client";

import type { CaseStatus, WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import { CASE_STATUS_LABEL, PRIORITY_LABEL, ownerDisplayLine } from "@/app/_lib/caseWorkspaceModel";
import type { CachedCaseFiling } from "@/app/_lib/decryptedSubmissionReadout";
import { getSubmissionDisplay } from "@/app/_lib/items/getSubmissionDisplay";
import type { WorkspaceRole } from "@/app/_lib/rbac";
import { ItemAssignmentPanel } from "@/components/items/ItemAssignmentPanel";
import { ItemStatusBadge } from "@/components/items/ItemStatusBadge";
import { getFirebaseAuth } from "@/app/_lib/firebase/auth";
import { fetchSubmissionAttachmentSignedUrl, openSignedUrlInNewTab } from "@/app/_lib/downloadSubmissionAttachment";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type WorkspaceMemberRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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

const SCAFFOLD_HINT =
  "This action is not connected to the database yet. Your workspace lead can enable it in a later release.";

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
  showStatusPicker: boolean;
  allowedStatusTargets: CaseStatus[];
  workflowStatusDraft: CaseStatus | null;
  setWorkflowStatusDraft: (v: CaseStatus) => void;
  workflowBusy: boolean;
  workflowError: string | null;
  onApplyWorkflowStatus: () => void;
}) {
  const detailPanelClass = `detail-panel${managingEditorDesk ? " detail-panel--command" : ""}`;
  const [attachmentBusyId, setAttachmentBusyId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState(DEFAULT_SECTION_OPEN);

  useEffect(() => {
    setOpenSections(DEFAULT_SECTION_OPEN);
  }, [selected?.id]);

  const toggleSection = useCallback((key: DetailSectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  if (!selected) {
    return (
      <aside className={detailPanelClass}>
        <div className="detail-panel-header">
          <div className="header-title">
            {editorDesk ? "Your queue" : managingEditorDesk ? "Command center" : "Pick a report"}
          </div>
          <div className="header-subtitle">
            {editorDesk
              ? "One story at a time — tap a card to work it."
              : managingEditorDesk
                ? "Choose a card to steer leads, stages, and the full filing."
                : "Select a card to read, route, and close the loop."}
          </div>
        </div>
        <div className="detail-panel-body">
          <p className="subtext" style={{ margin: 0 }}>
            {editorDesk
              ? "Cards are ordered for focus. Open one to see the summary, the reporter’s words, and your desk notes together."
              : managingEditorDesk
                ? "The board is live. Open any card to move ownership, shift stages, or read what came in from the field."
                : "Tap a card to read what came in, coordinate with the team, and keep the trail clean."}
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

  const roomSectionTitle = editorDesk ? "Snapshot" : managingEditorDesk ? "Room check" : "Overview";
  const notesSectionTitle =
    role === "intake" ? "Triage notes" : editorDesk ? "Desk notes" : managingEditorDesk ? "Newsroom notes" : "Internal notes";

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
      </div>

      <div className="detail-panel-body detail-panel-body--read">
        {scaffoldMessage ? (
          <p className="subtext detail-read-ambient" style={{ margin: 0 }}>
            {scaffoldMessage}
          </p>
        ) : null}

        <DetailReadSection
          sectionKey="reporter"
          title="Reporter"
          isOpen={openSections.reporter}
          onToggle={() => toggleSection("reporter")}
        >
          <dl className="detail-dl detail-dl--read">
            <div>
              <dt className="detail-dt">Filed by</dt>
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
            title="From the reporter"
            isOpen={openSections.filing}
            onToggle={() => toggleSection("filing")}
          >
            {!selected.encryptedPayload?.trim() ? (
              <p className="subtext" style={{ margin: 0 }}>
                No reporter letter was stored for this submission.
              </p>
            ) : decryptError ? (
              <div className="alert alert-danger" role="alert">
                {decryptError}
              </div>
            ) : decryptPanelLoading ? (
              <div className="row-between" style={{ gap: 12, marginTop: 4 }}>
                <div className="spinner" />
                <span className="muted" style={{ fontSize: 14 }}>
                  Opening the filing…
                </span>
              </div>
            ) : selectedCaseFiling ? (
              (() => {
                const titleLine = display.displayTitle.trim() ? display.displayTitle.trim() : "—";
                const bodyText = display.displayBody?.trim()
                  ? display.displayBody
                  : "No body text was found in this filing.";
                return (
                  <div className="stack-12">
                    <div>
                      <div className="editorial-read-kicker">Title as filed</div>
                      <div className="editorial-read-title" dir="auto">
                        {titleLine}
                      </div>
                    </div>
                    <div>
                      <div className="editorial-read-kicker">Their words</div>
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
              ? "Short triage context (same internal field as staff notes until dedicated triage fields ship)."
              : editorDesk
                ? "Visible only to staff in this newsroom — not to the person who filed."
                : managingEditorDesk
                  ? "Only staff in this workspace — never shared back to the source."
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
            {editorDesk ? "Story file" : managingEditorDesk ? "File & routing" : "Case details"}
          </div>
          <dl className="detail-dl">
            <div>
              <dt className="detail-dt">Submitted</dt>
              <dd className="detail-dd">{formatWhen(selected.createdAt)}</dd>
            </div>
            <div>
              <dt className="detail-dt">Updated</dt>
              <dd className="detail-dd">{formatWhen(selected.updatedAt)}</dd>
            </div>
            <div>
              <dt className="detail-dt">{editorDesk || managingEditorDesk ? "Desk line" : "Workflow status"}</dt>
              <dd className="detail-dd">{humanizeChannel(selected.workflowStatus)}</dd>
            </div>
            <div>
              <dt className="detail-dt">{stageLabel}</dt>
              <dd className="detail-dd">{CASE_STATUS_LABEL[selected.status]}</dd>
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
              <dt className="detail-dt">{editorDesk || managingEditorDesk ? "How it arrived" : "Source channel"}</dt>
              <dd className="detail-dd">{humanizeChannel(selected.sourceChannel)}</dd>
            </div>
          </dl>
        </div>

        {attachments.length > 0 ? (
          <DetailReadSection
            sectionKey="attachments"
            title="Attachments"
            isOpen={openSections.attachments}
            onToggle={() => toggleSection("attachments")}
          >
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
                  </div>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={attachmentBusyId !== null}
                    onClick={() => {
                      void (async () => {
                        setAttachmentError(null);
                        setAttachmentBusyId(a.id);
                        try {
                          const user = getFirebaseAuth().currentUser;
                          if (!user) {
                            setAttachmentError("Please sign in again.");
                            return;
                          }
                          const result = await fetchSubmissionAttachmentSignedUrl({
                            submissionId: selected.id,
                            attachmentId: a.id,
                            getIdToken: () => user.getIdToken(true),
                          });
                          if (!result.ok) {
                            setAttachmentError(result.error);
                            return;
                          }
                          openSignedUrlInNewTab(result.signedUrl);
                        } catch {
                          setAttachmentError("Network error while opening attachment.");
                        } finally {
                          setAttachmentBusyId(null);
                        }
                      })();
                    }}
                  >
                    {attachmentBusyId === a.id ? "Opening…" : "Download"}
                  </button>
                </div>
              ))}
            </div>
            {attachmentError ? (
              <div className="alert alert-danger" role="alert" style={{ marginTop: 12 }}>
                {attachmentError}
              </div>
            ) : null}
          </DetailReadSection>
        ) : null}

        <div className="detail-read-actions">
          <div className="detail-section-title">
            {editorDesk ? "Next steps" : managingEditorDesk ? "Workflow control" : "Actions"}
          </div>
          <div className="detail-action-groups">
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
                      {managingEditorDesk ? "Set lead" : "Assign"}
                    </button>
                  ) : null}
                  {showPriorityScaffold ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={actionPending || workflowBusy}
                      onClick={() => setScaffoldMessage(SCAFFOLD_HINT)}
                    >
                      Mark high priority
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
                    Resolve
                  </button>
                  <button type="button" className="btn" disabled={actionPending || workflowBusy} onClick={onArchive}>
                    Archive
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
                    {exportDocxBusy ? "Preparing Word…" : "Export Word (.docx)"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {showExportDocx && exportDocxError ? (
            <div className="alert alert-danger" role="alert" style={{ marginTop: 12 }}>
              {exportDocxError}
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
                  Delete report…
                </button>
              ) : (
                <div className="delete-confirm-panel card stack-12">
                  <p className="subtext" style={{ margin: 0, lineHeight: 1.55 }}>
                    This permanently removes this report from the newsroom by deleting the Firestore
                    submission document. Anyone viewing this record will lose access. This cannot be undone.
                  </p>
                  <div className="action-row" style={{ flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn"
                      disabled={deleteBusy}
                      onClick={() => setDeleteConfirmOpen(false)}
                    >
                      Keep this report
                    </button>
                    <button
                      type="button"
                      className="btn btn-delete-solid"
                      disabled={deleteBusy || actionPending || assignBusy || workflowBusy}
                      onClick={onDeletePermanently}
                    >
                      {deleteBusy ? "Deleting…" : "Delete permanently"}
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
                {allowedStatusTargets.map((s) => (
                  <option key={s} value={s}>
                    {CASE_STATUS_LABEL[s]}
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
                  {workflowBusy ? "Saving…" : editorDesk || managingEditorDesk ? "Apply stage change" : "Update status"}
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
                ? "Save triage note"
                : editorDesk
                  ? "Save desk note"
                  : managingEditorDesk
                    ? "Save newsroom note"
                    : "Save internal note"}
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
            {editorDesk ? "Activity" : managingEditorDesk ? "Desk log" : "Audit / activity"}
          </div>
          <p className="subtext" style={{ margin: 0 }}>
            {editorDesk
              ? "A timeline of moves on this submission will appear here when activity tracking is turned on."
              : managingEditorDesk
                ? "A rolling log of who moved what will sit here once activity tracking ships for this workspace."
                : "A chronological activity feed will appear here once it is connected to your audit log. Nothing is shown yet."}
          </p>
        </div>
      </div>
    </aside>
  );
}

