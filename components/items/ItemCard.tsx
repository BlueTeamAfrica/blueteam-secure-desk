"use client";

import type { WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import { ownerDisplayLine } from "@/app/_lib/caseWorkspaceModel";
import type { DecryptedFilingReadout } from "@/app/_lib/decryptedSubmissionReadout";
import { mapSubmissionToItem } from "@/app/_lib/items/mapSubmissionToItem";
import { getSubmissionDisplay } from "@/app/_lib/items/getSubmissionDisplay";
import { useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";

function isOverdue(submission: WorkspaceCase): boolean {
  if (!submission.dueDate) return false;
  if (submission.status === "reviewed" || submission.status === "designed") return false;
  const d = new Date(submission.dueDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function nameInitials(name: string | null | undefined): string {
  if (!name?.trim()) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]![0] ?? "").toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

export function ItemCard({
  submission,
  decryptedFiling,
  selected,
  editorDesk,
  managingEditorDesk,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  coverImageUrl: _coverImageUrl, // kept for API compat
  onSelect,
}: {
  submission: WorkspaceCase;
  decryptedFiling?: DecryptedFilingReadout;
  selected: boolean;
  editorDesk: boolean;
  managingEditorDesk: boolean;
  /** No longer used — kept for backward API compatibility */
  coverImageUrl?: string;
  onSelect: () => void;
}) {
  const { labels } = useDashboardBranding();
  const item = mapSubmissionToItem({ submission, decryptedFiling });
  const display = getSubmissionDisplay({ submission, decryptedFiling });

  const overdue = isOverdue(submission);
  const dueLabel = (() => {
    if (!submission.dueDate) return null;
    const d = new Date(submission.dueDate);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  })();

  const unassigned = !submission.assignedOwnerName?.trim() && !submission.assignedOwnerId?.trim();
  const stageLabel = labels.caseStatusLabels[submission.status] ?? submission.status;
  const initials = nameInitials(submission.assignedOwnerName);
  const assigneeName = ownerDisplayLine(submission);

  const isCritical = submission.priority === "critical";
  const isHigh = submission.priority === "high";
  const priorityUrgent = labels.priorityLabels?.urgent ?? "Urgent";
  const priorityHighAttention = labels.priorityLabels?.highAttention ?? "High";

  const classes = [
    "rc",
    overdue ? "rc--overdue" : "",
    editorDesk ? "rc--queue" : "",
    managingEditorDesk ? "rc--command" : "",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      data-case-status={submission.status}
      data-priority={submission.priority}
      onClick={onSelect}
    >
      {/* ── Row 1: stage label + ref + expand chevron ── */}
      <div className="rc-header">
        <span className="rc-stage">{stageLabel}</span>
        <div className="rc-header-end">
          <span className="rc-ref">{item.ref}</span>
          <span className={`rc-chevron${selected ? " rc-chevron--open" : ""}`} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4l4 4 4-4"/>
            </svg>
          </span>
        </div>
      </div>

      {/* ── Row 2: title + byline ── */}
      <div className="rc-body">
        <div className="rc-title" dir="auto">
          {display.displayTitle}
        </div>
        <div className="rc-byline" dir="auto">
          {display.displayReporterName}
          {display.displayReporterRegion ? (
            <span className="rc-byline-sep"> · </span>
          ) : null}
          {display.displayReporterRegion ? (
            <span className="rc-byline-loc">{display.displayReporterRegion}</span>
          ) : null}
        </div>
      </div>

      {/* ── Row 3: footer — assignee + flags ── */}
      <div className="rc-footer">
        <div className="rc-assignee">
          <span
            className={`rc-avatar${unassigned ? " rc-avatar--empty" : ""}`}
            aria-hidden="true"
          >
            {unassigned ? "?" : initials || "—"}
          </span>
          <span className="rc-assignee-name">{assigneeName}</span>
        </div>

        <div className="rc-flags">
          {overdue && (
            <span className="rc-flag rc-flag--overdue">Overdue</span>
          )}
          {!overdue && dueLabel && (
            <span className="rc-flag rc-flag--due">Due {dueLabel}</span>
          )}
          {isCritical && (
            <span className="rc-flag rc-flag--critical">{priorityUrgent}</span>
          )}
          {!isCritical && isHigh && (
            <span className="rc-flag rc-flag--high">{priorityHighAttention}</span>
          )}
          {!overdue && !isCritical && !isHigh && unassigned && (
            <span className="rc-flag rc-flag--unassigned">No lead</span>
          )}
        </div>
      </div>
    </button>
  );
}
