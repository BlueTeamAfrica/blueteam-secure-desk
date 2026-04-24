import { EDITORIAL_IMAGE_PATHS } from "@/app/_lib/editorialImageManifest";

/** Deterministic 32-bit hash for stable image preference per case id (djb2). */
export function hashCaseIdForCover(caseId: string): number {
  let hash = 5381;
  for (let i = 0; i < caseId.length; i++) {
    hash = (hash * 33 + caseId.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Assigns a cover URL per case in list order.
 * Uses each image at most once per cycle: walk the list, prefer hash(id)%m,
 * then probe forward for the next unused index until the library is exhausted, then repeat.
 */
export function assignEditorialCoverUrls(
  caseIds: string[],
  paths: readonly string[] = EDITORIAL_IMAGE_PATHS,
): string[] {
  const m = paths.length;
  if (m === 0) {
    return caseIds.map(() => "");
  }

  let usedInCycle = new Set<number>();
  const out: string[] = [];

  for (const id of caseIds) {
    if (usedInCycle.size >= m) {
      usedInCycle = new Set<number>();
    }

    const pref = hashCaseIdForCover(id) % m;
    let chosen = -1;

    for (let step = 0; step < m; step++) {
      const idx = (pref + step) % m;
      if (!usedInCycle.has(idx)) {
        chosen = idx;
        break;
      }
    }

    if (chosen === -1) {
      for (let idx = 0; idx < m; idx++) {
        if (!usedInCycle.has(idx)) {
          chosen = idx;
          break;
        }
      }
    }

    if (chosen === -1) {
      chosen = pref;
    }

    usedInCycle.add(chosen);
    out.push(paths[chosen]!);
  }

  return out;
}

export function editorialCoverUrlByCaseId(cases: readonly { id: string }[]): Map<string, string> {
  const ids = cases.map((c) => c.id);
  const urls = assignEditorialCoverUrls(ids);
  return new Map(ids.map((id, i) => [id, urls[i]!]));
}
