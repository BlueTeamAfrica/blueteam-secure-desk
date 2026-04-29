import type { CaseStatus } from "@/app/_lib/caseWorkspaceModel";
import type { ExportDestination } from "@/app/_lib/integrations/types";
import { getWorkspaceConfig } from "@/app/_lib/org/getWorkspaceConfig";

export function getExportDestinationForStage(status: CaseStatus): ExportDestination {
  const cfg = getWorkspaceConfig().integrations;
  const provider = cfg.exportProvider;

  if (provider === "oneDrive") {
    const oneDrive = cfg.oneDrive;
    const folderName = oneDrive?.stageFolderMap?.[status];
    return {
      provider,
      rootFolderName: oneDrive?.rootFolderName,
      folderName,
    };
  }

  return { provider };
}

