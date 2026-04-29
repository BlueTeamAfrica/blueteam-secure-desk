import type { OrgLabels } from "@/app/_lib/org/types";
import { getWorkspaceConfig } from "@/app/_lib/org/getWorkspaceConfig";

export type { OrgLabels };

/**
 * Central source of truth for dashboard wording (flattened workspace config).
 */
export function getOrgLabels(): OrgLabels {
  const c = getWorkspaceConfig();
  return {
    ...c.branding,
    ...c.labels,
    workflow: c.workflow,
    deskLabels: c.deskLabels,
    actionLabels: c.actionLabels,
    priorityLabels: c.priorityLabels,
    detailSectionLabels: c.detailSectionLabels,
    exportDocxLabels: c.exportDocxLabels,
    ...c.chrome,
    ...c.detailInspector,
    ...c.runSheet,
    ...c.board,
    ...c.team,
  };
}
