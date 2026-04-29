import type { CaseStatus } from "@/app/_lib/caseWorkspaceModel";

export type IntegrationProvider = "oneDrive" | "googleDrive" | "manualDownload" | "disabled";

export type OneDriveIntegrationConfig = {
  enabled: boolean;
  rootFolderName: string;
  stageFolderMap: Record<CaseStatus, string>;
};

export type IntegrationConfig = {
  exportProvider: IntegrationProvider;
  oneDrive?: OneDriveIntegrationConfig;
};

export type ExportDestination = {
  provider: IntegrationProvider;
  rootFolderName?: string;
  folderName?: string;
};

export type ExportMimeType =
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/zip"
  | "application/pdf"
  | "application/octet-stream";

export type ExportPackageItem =
  | {
      kind: "docx";
      filename: string;
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      /** Optional until an integration actually fetches/generates bytes. */
      bytes?: Uint8Array;
      planned: true;
      source: "docx_export";
    }
  | {
      kind: "attachment";
      attachmentId: string;
      filename: string;
      mimeType: string | null;
      size: number | null;
      storagePath: string;
      uploadedAt: string | null;
      /** Optional until an integration actually downloads bytes. */
      bytes?: Uint8Array;
      planned: true;
      source: "supabase_attachment";
    };

export type ExportPackageMetadata = {
  workspaceName: string;
  reporterName: string | null;
  title: string | null;
  status: CaseStatus;
  submittedAt: string | null;
  assignedOwner: string | null;
};

export type ExportPackage = {
  submissionId: string;
  status: CaseStatus;
  destination: ExportDestination;
  /** Suggested stable base filename (no extension). */
  baseName: string;
  metadata: ExportPackageMetadata;
  items: ExportPackageItem[];
};

export type ExportResult =
  | { ok: true; provider: IntegrationProvider; destination: ExportDestination; message?: string }
  | { ok: false; provider: IntegrationProvider; error: string };

export type ExportAdapter = {
  provider: IntegrationProvider;
  exportPackage: (pkg: ExportPackage) => Promise<ExportResult>;
};

