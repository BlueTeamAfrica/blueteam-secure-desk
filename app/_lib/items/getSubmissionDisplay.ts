import type { WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import type { DecryptedFilingReadout } from "@/app/_lib/decryptedSubmissionReadout";
import { formatSubmissionTimestampForCard } from "@/app/_lib/caseWorkspaceModel";
import { getOrgLabels } from "@/app/_lib/org/getOrgLabels";

export const REPORTER_NAME_FALLBACK = "Reporter not set";

export type SubmissionDisplay = {
  displayTitle: string;
  displayBody: string | null;
  displaySourceLabel: string | null;
  displaySubmittedAt: string | null;
  displayRef: string;
  /**
   * Convenience string for compact UI / exports.
   * `Filed by <name> • …` plus region/time when present; legacy source still reflected when useful.
   */
  displayMetaLine: string;
  /** Resolved reporter display name (never empty — uses {@link REPORTER_NAME_FALLBACK}). */
  displayReporterName: string;
  displayReporterRegion: string | null;
  displayReporterPhone: string | null;
  displayReporterAlias: string | null;
  /** Region and/or submitted time for card subline; null when nothing to show. */
  displayCardContextLine: string | null;
};

const PLACEHOLDER_TITLES = new Set(
  [
    "new incoming report",
    "untitled field report",
    "untitled",
    "no title",
  ].map((s) => s.toLowerCase()),
);

const PLACEHOLDER_SOURCES = new Set(
  ["unknown source", "from unknown source"].map((s) => s.toLowerCase()),
);

function clean(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function isPlaceholderTitle(v: string): boolean {
  const t = clean(v).toLowerCase();
  if (!t) return true;
  return PLACEHOLDER_TITLES.has(t);
}

function isPlaceholderSource(v: string): boolean {
  const t = clean(v).toLowerCase();
  if (!t) return true;
  return PLACEHOLDER_SOURCES.has(t);
}

function preferNonPlaceholder(primary: string, secondary: string): string {
  const p = clean(primary);
  const s = clean(secondary);
  if (p && !isPlaceholderTitle(p)) return p;
  if (s && !isPlaceholderTitle(s)) return s;
  return p || s;
}

function pickSourceLabel(submission: WorkspaceCase, filing?: DecryptedFilingReadout): string | null {
  const fromPayload = clean(filing?.sourceLabel ?? null);
  if (fromPayload && !isPlaceholderSource(fromPayload)) return fromPayload;
  const fromDoc = clean(submission.reporterSourceName ?? null);
  if (fromDoc && !isPlaceholderSource(fromDoc)) return fromDoc;
  return null;
}

function pickTitle(submission: WorkspaceCase, filing?: DecryptedFilingReadout): string {
  const fromPayload = clean(filing?.title ?? null);
  const fromDoc = clean(submission.title ?? "");

  const best = preferNonPlaceholder(fromPayload, fromDoc);
  if (best) return best;

  // Final fallback only when nothing real exists.
  return "New incoming report";
}

function pickBody(submission: WorkspaceCase, filing?: DecryptedFilingReadout): string | null {
  const fromPayload = clean(filing?.body ?? null);
  if (fromPayload) return fromPayload;

  // If the payload exists but isn't visible/loaded, we intentionally avoid implying content.
  // Call sites can show `protectedMessagePreview` or summary separately.
  return null;
}

/**
 * Title for exports / filenames when the dashboard resolver would otherwise surface a generic placeholder.
 */
export function getSubmissionExportTitle(display: SubmissionDisplay): string {
  if (!isPlaceholderTitle(display.displayTitle)) return display.displayTitle;
  const ref = clean(display.displayRef);
  return ref ? `Submission ${ref}` : "Secure Desk submission";
}

function pickReporterDisplayName(submission: WorkspaceCase): string {
  const n = clean(submission.reporterName);
  if (n) return n;
  return REPORTER_NAME_FALLBACK;
}

export function getSubmissionDisplay(args: {
  submission: WorkspaceCase;
  decryptedFiling?: DecryptedFilingReadout;
}): SubmissionDisplay {
  const { submission, decryptedFiling } = args;

  const displaySubmittedAt = submission.createdAt;
  const time = formatSubmissionTimestampForCard(displaySubmittedAt);
  const displaySourceLabel = pickSourceLabel(submission, decryptedFiling);
  const displayReporterName = pickReporterDisplayName(submission);
  const displayReporterRegion = clean(submission.reporterRegion ?? null) || null;
  const displayReporterPhone = clean(submission.reporterPhone ?? null) || null;
  const displayReporterAlias = clean(submission.reporterAlias ?? null) || null;

  const contextParts: string[] = [];
  if (displayReporterRegion) contextParts.push(displayReporterRegion);
  if (time && time !== "—") contextParts.push(time);
  const displayCardContextLine = contextParts.length > 0 ? contextParts.join(" • ") : null;

  const displayMetaLine = displayCardContextLine
    ? `${getOrgLabels().deskLabels?.filedByLabel ?? "Filed by"} ${displayReporterName} • ${displayCardContextLine}`
    : `${getOrgLabels().deskLabels?.filedByLabel ?? "Filed by"} ${displayReporterName}`;

  return {
    displayTitle: pickTitle(submission, decryptedFiling),
    displayBody: pickBody(submission, decryptedFiling),
    displaySourceLabel,
    displaySubmittedAt,
    displayRef: submission.referenceCode,
    displayMetaLine,
    displayReporterName,
    displayReporterRegion,
    displayReporterPhone,
    displayReporterAlias,
    displayCardContextLine,
  };
}

