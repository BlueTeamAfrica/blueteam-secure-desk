"use client";

import { formatSubmissionTimestampForCard } from "@/app/_lib/caseWorkspaceModel";

export function ItemMetaRow({
  displaySubmittedAt,
  displaySourceLabel,
  displayRef,
  className,
}: {
  displaySubmittedAt: string | null;
  /** Already-resolved; null means "hide source". */
  displaySourceLabel: string | null;
  displayRef: string | null;
  className?: string;
}) {
  const submitted = formatSubmissionTimestampForCard(displaySubmittedAt);
  const parts: string[] = [];
  if (displaySourceLabel?.trim()) parts.push(`From ${displaySourceLabel.trim()}`);
  parts.push(submitted);

  return (
    <div className={className}>
      <span dir="auto">{parts.join(" • ")}</span>
      {displayRef?.trim() ? <span className="report-card-ref">Ref: {displayRef.trim()}</span> : null}
    </div>
  );
}

