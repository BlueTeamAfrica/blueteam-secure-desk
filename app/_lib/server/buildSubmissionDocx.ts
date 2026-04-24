import "server-only";

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import { CASE_STATUS_LABEL, PRIORITY_LABEL, formatSubmissionTimestampForCard, ownerDisplayLine } from "@/app/_lib/caseWorkspaceModel";
import type { SubmissionDisplay } from "@/app/_lib/items/getSubmissionDisplay";
import { getSubmissionExportTitle } from "@/app/_lib/items/getSubmissionDisplay";
import type { WorkflowItem } from "@/app/_lib/items/mapSubmissionToItem";

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
  const isoDate = new Date().toISOString().slice(0, 10);
  const titleSlug = sanitizeDocxFilenameSegment(getSubmissionExportTitle(display), 56);
  const refSlug = sanitizeDocxFilenameSegment(display.displayRef || "ref", 32);
  return `${isoDate}_${refSlug}_${titleSlug}.docx`;
}

export function asciiFallbackExportFilename(display: SubmissionDisplay): string {
  const isoDate = new Date().toISOString().slice(0, 10);
  const ref = sanitizeDocxFilenameSegment(display.displayRef.replace(/[^a-zA-Z0-9-]/g, "") || "CASE", 24);
  return `${isoDate}_${ref}-export.docx`;
}

export async function buildSubmissionDocxBuffer(args: {
  submission: WorkspaceCase;
  display: SubmissionDisplay;
  item: WorkflowItem;
  generatedAtIso: string;
}): Promise<Buffer> {
  const { submission, display, item, generatedAtIso } = args;
  const title = getSubmissionExportTitle(display);
  const submitted = formatSubmissionTimestampForCard(display.displaySubmittedAt);
  const statusLabel = CASE_STATUS_LABEL[submission.status];
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
      children: [new TextRun("Metadata")],
    }),
    labeledLine("Reference ID", display.displayRef),
    labeledLine("Submitted", submitted),
    labeledLine("Filed by", display.displayReporterName),
  ];

  if (display.displayReporterRegion) {
    children.push(labeledLine("Reporter region", display.displayReporterRegion));
  }
  if (display.displayReporterPhone) {
    children.push(labeledLine("Reporter phone", display.displayReporterPhone));
  }
  if (display.displayReporterAlias) {
    children.push(labeledLine("Reporter alias", display.displayReporterAlias));
  }

  children.push(labeledLine("Current status", statusLabel));

  if (display.displaySourceLabel) {
    children.push(labeledLine("Source", display.displaySourceLabel));
  }

  children.push(
    labeledLine("Assigned owner", ownerLine),
    labeledLine("Priority", priorityLabel),
    labeledLine("Source channel", humanizeChannel(submission.sourceChannel)),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 120 },
      children: [new TextRun("Report")],
    }),
  );

  const bodyText = display.displayBody?.trim() ?? "";
  if (bodyText) {
    for (const block of splitBodyParagraphs(bodyText)) {
      children.push(bodyParagraph(block));
    }
  } else {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({
            text:
              "The full narrative is not included in this export (encrypted payload not available for this role or could not be decrypted on the server). Open the dashboard to review trusted content.",
            italics: true,
          }),
        ],
      }),
    );
  }

  const namedAttachments = item.attachments
    .map((a) => (typeof a.name === "string" ? a.name.trim() : ""))
    .filter(Boolean);
  if (namedAttachments.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
        children: [new TextRun("Attachments")],
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

  const footerStamp = `Generated by Secure Reporter Dashboard · ${new Date(generatedAtIso).toLocaleString(undefined, {
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
    creator: "Secure Reporter Dashboard",
    title,
    sections: [
      {
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
