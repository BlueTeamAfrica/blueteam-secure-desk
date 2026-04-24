"use client";

import type { CSSProperties } from "react";
import type { WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import { priorityBadgeClass, ownerDisplayLine } from "@/app/_lib/caseWorkspaceModel";
import type { DecryptedFilingReadout } from "@/app/_lib/decryptedSubmissionReadout";
import { mapSubmissionToItem } from "@/app/_lib/items/mapSubmissionToItem";
import { getSubmissionDisplay } from "@/app/_lib/items/getSubmissionDisplay";
import { ItemStatusBadge } from "@/components/items/ItemStatusBadge";

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
  const item = mapSubmissionToItem({ submission, decryptedFiling });
  const display = getSubmissionDisplay({ submission, decryptedFiling });

  const classes = [
    "report-card",
    "report-card--premium",
    "report-card--editorial",
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
          <span className="report-card-cta">Open</span>
        </div>
        <p className="report-card-filed-by" dir="auto">
          <span className="report-card-filed-by-label">Filed by</span>{" "}
          <span className="report-card-filed-by-name">{display.displayReporterName}</span>
        </p>
        {display.displayCardContextLine ? (
          <p className="report-card-context-line" dir="auto">
            {display.displayCardContextLine}
          </p>
        ) : null}
        <p className="report-card-ref">Ref: {item.ref}</p>
        <div className="report-card-assign">
          <span className="report-card-assign-label">With</span>
          <span className="report-card-assign-name">{ownerDisplayLine(submission)}</span>
        </div>
        <div className="report-card-badges">
          <ItemStatusBadge status={item.status} />
          {submission.priority === "high" || submission.priority === "critical" ? (
            <span className={priorityBadgeClass(submission.priority)}>
              {submission.priority === "critical" ? "Urgent" : "High attention"}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

