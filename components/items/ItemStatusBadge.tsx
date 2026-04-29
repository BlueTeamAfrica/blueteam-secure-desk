"use client";

import { statusBadgeClass, type CaseStatus } from "@/app/_lib/caseWorkspaceModel";
import { useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";

export function ItemStatusBadge({
  status,
  className,
}: {
  status: CaseStatus;
  className?: string;
}) {
  const { labels } = useDashboardBranding();
  const base = statusBadgeClass(status);
  const merged = [base, className].filter(Boolean).join(" ");
  return <span className={merged}>{labels.caseStatusLabels[status]}</span>;
}

