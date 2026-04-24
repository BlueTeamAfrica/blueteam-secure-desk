"use client";

import { statusBadgeClass, type CaseStatus } from "@/app/_lib/caseWorkspaceModel";

/** Friendly badge copy used across the current dashboard UI. */
const STATUS_CHIP: Record<CaseStatus, string> = {
  new: "Raw Materials",
  needs_triage: "First Editing",
  assigned: "Second Editing",
  in_review: "Proofreading",
  waiting_follow_up: "Designed",
  resolved: "Published",
  archived: "Archive",
};

export function ItemStatusBadge({
  status,
  className,
}: {
  status: CaseStatus;
  className?: string;
}) {
  const base = statusBadgeClass(status);
  const merged = [base, className].filter(Boolean).join(" ");
  return <span className={merged}>{STATUS_CHIP[status]}</span>;
}

