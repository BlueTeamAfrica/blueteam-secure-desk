import "server-only";

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import { CASE_STATUS_LABEL, PRIORITY_LABEL, formatSubmissionTimestampForCard, ownerDisplayLine } from "@/app/_lib/caseWorkspaceModel";
import type { SubmissionDisplay } from "@/app/_lib/items/getSubmissionDisplay";
import { getSubmissionExportTitle } from "@/app/_lib/items/getSubmissionDisplay";
import type { WorkflowItem } from "@/app/_lib/items/mapSubmissionToItem";
import { getOrgSettings } from "@/app/_lib/org/getOrgSettings";
import { getOrgLabels } from "@/app/_lib/org/getOrgLabels";
import { arLabels } from "@/app/_lib/i18n/ar";
import type { WorkspaceExportDocxLabels } from "@/app/_lib/org/types";

const ARABIC_SCRIPT =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function mostlyArabicParagraph(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const letters = t.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return ARABIC_SCRIPT.test(t);
  const arabicLetters = (t.match(ARABIC_SCRIPT) ?? []).length;
  return arabicLetters / letters > 0.35;
}

function humanizeChannel(s: string | null): string {
  if (!s?.trim()) return "—";
  return s
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function labeledLine(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: value }),
    ],
  });
}

function splitBodyParagraphs(body: string): string[] {
  const t = body.replace(/\r\n/g, "\n");
  const blocks = t
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length > 0) return blocks;
  const single = t.trim();
  return single ? [single] : [];
}

function bodyParagraph(text: string): Paragraph {
  const rtl = mostlyArabicParagraph(text);
  return new Paragraph({
    bidirectional: rtl ? true : undefined,
    spacing: { after: 180 },
    children: [
      new TextRun({
        text,
        rightToLeft: rtl ? true : undefined,
      }),
    ],
  });
}

export function sanitizeDocxFilenameSegment(s: string, maxLen: number): string {
  const n = s.normalize("NFC").trim();
  const stripped = n.replace(/[\\/:*?"<>|#\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim();
  const collapsed = stripped
    .slice(0, maxLen)
    .replace(/\s/g, "-")
    .replace(/-+/g, "-");
  return collapsed || "report";
}

export function buildExportDocxFilename(display: SubmissionDisplay): string {
  // Named with the report title so editors see a meaningful name in OneDrive.
  const titleSlug = sanitizeDocxFilenameSegment(getSubmissionExportTitle(display), 80);
  return `${titleSlug}.docx`;
}

export function asciiFallbackExportFilename(display: SubmissionDisplay): string {
  const ref = sanitizeDocxFilenameSegment(display.displayRef.replace(/[^a-zA-Z0-9-]/g, "") || "CASE", 40);
  return `${ref}.docx`;
}

/**
 * OneDrive subfolder name for a submission — named with the report title
 * so journalists see a meaningful folder name rather than a system reference.
 * Falls back to the case reference when no meaningful title exists yet.
 */
export function buildSubmissionFolderName(display: SubmissionDisplay): string {
  const title = sanitizeDocxFilenameSegment(getSubmissionExportTitle(display), 80);
  return title;
}

function resolveDocxLabels(locale?: "en" | "ar"): WorkspaceExportDocxLabels {
  const base = getOrgLabels().exportDocxLabels;
  if (locale !== "ar") return base;
  return { ...base, ...(arLabels.exportDocxLabels ?? {}) };
}

export async function buildSubmissionDocxBuffer(args: {
  submission: WorkspaceCase;
  display: SubmissionDisplay;
  item: WorkflowItem;
  generatedAtIso: string;
  /** Locale for system-generated labels in the DOCX. Does not affect case title/body/notes. */
  locale?: "en" | "ar";
  /**
   * Optional entry to append to the DOCX change log.
   * Caller is responsible for also persisting this entry to Firestore
   * (onedriveChangeLog array) so future regenerations include it.
   */
  lastChangedBy?: {
    uid: string;
    role: string;
    /** Human-readable description, e.g. "moved to raw", "priority changed to high" */
    action: string;
  };
}): Promise<Buffer> {
  const { submission, display, item, generatedAtIso, locale, lastChangedBy } = args;
  const exportLabels = resolveDocxLabels(locale);
  const baseOrgLabels = getOrgLabels();
  const title = getSubmissionExportTitle(display);
  const submitted = formatSubmissionTimestampForCard(display.displaySubmittedAt);
  // Use locale-aware status label — falls back to hardcoded English constant.
  const localeStatusLabels = locale === "ar" ? { ...baseOrgLabels.caseStatusLabels, ...arLabels.caseStatusLabels } : baseOrgLabels.caseStatusLabels;
  const statusLabel = localeStatusLabels[submission.status] ?? CASE_STATUS_LABEL[submission.status];
  const priorityLabel = PRIORITY_LABEL[submission.priority];
  const ownerLine = ownerDisplayLine(submission);

  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 240 },
      children: [new TextRun({ text: title, bold: true, size: 56 })],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 120, after: 120 },
      children: [new TextRun(exportLabels.sectionMetadata)],
    }),
    labeledLine(exportLabels.fieldReferenceId, display.displayRef),
    labeledLine(exportLabels.fieldSubmitted, submitted),
    labeledLine(exportLabels.filedBy, display.displayReporterName),
  ];

  if (display.displayReporterRegion) {
    children.push(labeledLine(exportLabels.fieldReporterRegion, display.displayReporterRegion));
  }
  if (display.displayReporterPhone) {
    children.push(labeledLine(exportLabels.fieldReporterPhone, display.displayReporterPhone));
  }
  if (display.displayReporterAlias) {
    children.push(labeledLine(exportLabels.fieldReporterAlias, display.displayReporterAlias));
  }

  children.push(labeledLine(exportLabels.status, statusLabel));

  if (display.displaySourceLabel) {
    children.push(labeledLine(exportLabels.fieldSource, display.displaySourceLabel));
  }

  children.push(
    labeledLine(exportLabels.fieldAssignedOwner, ownerLine),
    labeledLine(exportLabels.fieldPriority, priorityLabel),
    labeledLine(exportLabels.fieldSourceChannel, humanizeChannel(submission.sourceChannel)),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 120 },
      children: [new TextRun(exportLabels.sectionReport)],
    }),
  );

  // Case body is never translated — displayed exactly as the reporter wrote it.
  const bodyText = display.displayBody?.trim() ?? "";
  if (bodyText) {
    for (const block of splitBodyParagraphs(bodyText)) {
      children.push(bodyParagraph(block));
    }
  } else {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: exportLabels.noPayloadFallback, italics: true })],
      }),
    );
  }

  // Attachment names are not translated — displayed as the reporter named the files.
  const namedAttachments = item.attachments
    .map((a) => (typeof a.name === "string" ? a.name.trim() : ""))
    .filter(Boolean);
  if (namedAttachments.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
        children: [new TextRun(exportLabels.attachments)],
      }),
    );
    for (const name of namedAttachments) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: `• ${name}` })],
        }),
      );
    }
  }

  // ── Change log ──────────────────────────────────────────────────────────────
  // All persisted entries from Firestore + the new entry being appended now.
  const allLogEntries = [
    ...(submission.onedriveChangeLog ?? []),
    ...(lastChangedBy
      ? [{ action: lastChangedBy.action, uid: lastChangedBy.uid, role: lastChangedBy.role, ts: generatedAtIso }]
      : []),
  ];
  if (allLogEntries.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
        children: [new TextRun(exportLabels.sectionChangeLog)],
      }),
    );
    for (const entry of allLogEntries) {
      const when = (() => {
        try {
          return new Date(entry.ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        } catch {
          return entry.ts;
        }
      })();
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: `${when}  `, bold: true }),
            new TextRun(`${entry.action}  ·  ${entry.role} (${entry.uid})`),
          ],
        }),
      );
    }
  }

  const footerStamp = `${exportLabels.generatedByPrefix} ${getOrgSettings().productName} · ${new Date(generatedAtIso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
  children.push(
    new Paragraph({
      spacing: { before: 360 },
      children: [new TextRun({ text: footerStamp, size: 18, color: "666666" })],
    }),
  );

  const doc = new Document({
    creator: getOrgSettings().productName,
    title,
    sections: [
      {
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
