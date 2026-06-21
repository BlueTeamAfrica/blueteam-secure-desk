"use client";

import { formatSubmissionTimestampForCard } from "@/app/_lib/caseWorkspaceModel";
import { useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";

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
  const { labels } = useDashboardBranding();
  const submitted = formatSubmissionTimestampForCard(displaySubmittedAt);
  const fromPrefix = labels.deskLabels?.fromPrefix ?? "From";
  const refPrefix = labels.detailSectionLabels?.metaRef ?? "Ref:";

  const parts: string[] = [];
  if (displaySourceLabel?.trim()) parts.push(`${fromPrefix} ${displaySourceLabel.trim()}`);
  parts.push(submitted);

  return (
    <div className={className}>
      <span dir="auto">{parts.join(" • ")}</span>
      {displayRef?.trim() ? <span className="report-card-ref">{refPrefix} {displayRef.trim()}</span> : null}
    </div>
  );
}
