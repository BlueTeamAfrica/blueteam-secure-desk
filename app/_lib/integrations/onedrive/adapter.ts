import type { ExportAdapter } from "@/app/_lib/integrations/types";

export const oneDriveAdapter: ExportAdapter = {
  provider: "oneDrive",
  exportPackage: async () => {
    return {
      ok: false,
      provider: "oneDrive",
      error: "OneDrive integration is not connected for this workspace.",
    };
  },
};

