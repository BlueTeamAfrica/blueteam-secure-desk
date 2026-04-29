import type { ExportAdapter } from "@/app/_lib/integrations/types";

export const manualDownloadAdapter: ExportAdapter = {
  provider: "manualDownload",
  exportPackage: async (pkg) => {
    // Manual download means the app already produced the bytes (DOCX export route),
    // and the user chooses where to store it. No remote calls.
    void pkg;
    return {
      ok: true,
      provider: "manualDownload",
      destination: { provider: "manualDownload" },
      message: "Prepared for manual download.",
    };
  },
};

