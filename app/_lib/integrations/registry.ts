import { getWorkspaceConfig } from "@/app/_lib/org/getWorkspaceConfig";
import type { ExportAdapter, IntegrationProvider } from "@/app/_lib/integrations/types";
import { oneDriveAdapter } from "@/app/_lib/integrations/onedrive/adapter";
import { manualDownloadAdapter } from "@/app/_lib/integrations/manualDownload/adapter";

export function getActiveExportProvider(): IntegrationProvider {
  return getWorkspaceConfig().integrations.exportProvider;
}

export function resolveExportAdapter(): ExportAdapter {
  const provider = getActiveExportProvider();
  if (provider === "oneDrive") return oneDriveAdapter;
  if (provider === "manualDownload") return manualDownloadAdapter;
  if (provider === "googleDrive") {
    return {
      provider,
      exportPackage: async () => ({
        ok: false,
        provider,
        error: "Google Drive integration is not connected for this workspace.",
      }),
    };
  }
  return {
    provider: "disabled",
    exportPackage: async () => ({
      ok: false,
      provider: "disabled",
      error: "Exports are disabled for this workspace.",
    }),
  };
}

