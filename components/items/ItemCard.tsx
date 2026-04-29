"use client";

import type { CSSProperties } from "react";
import type { WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import { PRIORITY_LABEL, priorityBadgeClass, ownerDisplayLine } from "@/app/_lib/caseWorkspaceModel";
import type { DecryptedFilingReadout } from "@/app/_lib/decryptedSubmissionReadout";
import { mapSubmissionToItem } from "@/app/_lib/items/mapSubmissionToItem";
import { getSubmissionDisplay } from "@/app/_lib/items/getSubmissionDisplay";
import { ItemStatusBadge } from "@/components/items/ItemStatusBadge";
import { useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";

function isOverdue(submission: WorkspaceCase): boolean {
  if (!submission.dueDate) return false;
  if (submission.status === "resolved" || submission.status === "archived") return false;
  const d = new Date(submission.dueDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

export function ItemCard({
  submission,
  decryptedFiling,
  selected,
  editorDesk,
  managingEditorDesk,
  coverImageUrl,
  onSelect,
}: {
  submission: WorkspaceCase;
  decryptedFiling?: DecryptedFilingReadout;
  selected: boolean;
  editorDesk: boolean;
  managingEditorDesk: boolean;
  /** Public path e.g. /editorial/foo.jpg — omit to use CSS fallback cover */
  coverImageUrl?: string;
  onSelect: () => void;
}) {
  const { labels } = useDashboardBranding();
  const item = mapSubmissionToItem({ submission, decryptedFiling });
  const display = getSubmissionDisplay({ submission, decryptedFiling });
  const filedByLabel = labels.deskLabels?.filedByLabel ?? "Filed by";
  const withLabel = labels.deskLabels?.withLabel ?? "With";
  const priorityUrgent = labels.priorityLabels?.urgent ?? "Urgent";
  const priorityHighAttention = labels.priorityLabels?.highAttention ?? "High attention";
  const overdue = isOverdue(submission);
  const dueLabel = (() => {
    if (!submission.dueDate) return null;
    const d = new Date(submission.dueDate);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  })();
  const unassigned = !submission.assignedOwnerName?.trim() && !submission.assignedOwnerId?.trim();

  const classes = [
    "report-card",
    "report-card--premium",
    "report-card--editorial",
    overdue ? "report-card--overdue" : "",
    editorDesk ? "report-card--queue" : "",
    managingEditorDesk ? "report-card--command" : "",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const coverStyle =
    coverImageUrl && coverImageUrl.length > 0
      ? ({ ["--report-cover" as string]: `url("${coverImageUrl}")` } as CSSProperties)
      : undefined;

  return (
    <button type="button" className={classes} style={coverStyle} onClick={onSelect}>
      <div className="report-card-stack">
        <div className="report-card-top">
          <div className="report-card-title" dir="auto">
            {display.displayTitle}
          </div>
        </div>
        <p className="report-card-filed-by" dir="auto">
          <span className="report-card-filed-by-label">{filedByLabel}</span>{" "}
          <span className="report-card-filed-by-name">{display.displayReporterName}</span>
        </p>
        {display.displayCardContextLine ? (
          <p className="report-card-context-line" dir="auto">
            {display.displayCardContextLine}
          </p>
        ) : null}
        <p className="report-card-ref">Ref: {item.ref}</p>
        <div className="report-card-assign">
          <span className="report-card-assign-label">{withLabel}</span>
          <span className="report-card-assign-name">{ownerDisplayLine(submission)}</span>
        </div>
        <div className="report-card-badges">
          <ItemStatusBadge status={item.status} />
          {unassigned ? <span className="badge badge-neutral">Unassigned</span> : null}
          {submission.priority === "normal" ? (
            <span className="badge badge-route">{PRIORITY_LABEL.normal}</span>
          ) : null}
          {submission.priority === "low" ? (
            <span className={priorityBadgeClass(submission.priority)}>
              {PRIORITY_LABEL.low}
            </span>
          ) : submission.priority === "high" || submission.priority === "critical" ? (
            <span className={priorityBadgeClass(submission.priority)}>
              {submission.priority === "critical" ? priorityUrgent : priorityHighAttention}
            </span>
          ) : null}
          {overdue ? (
            <span className="badge badge-archived">Overdue</span>
          ) : dueLabel ? (
            <span className="badge badge-route">Due {dueLabel}</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

