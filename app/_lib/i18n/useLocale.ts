"use client";

/**
 * Locale management for the dashboard.
 *
 * - Reads / writes `sd-locale` in localStorage (survives page refresh).
 * - Merges the active locale's string overrides on top of the English base labels.
 * - Adding a new language: import its override object, add a case in `mergeLocale`.
 *
 * Usage:
 *   const { locale, setLocale, applyLocale } = useLocale();
 *   const labels = applyLocale(baseLabels);
 */

import { useCallback, useEffect, useState } from "react";
import type { OrgLabels } from "@/app/_lib/org/types";
import { arLabels } from "@/app/_lib/i18n/ar";

export type SupportedLocale = "en" | "ar";

const STORAGE_KEY = "sd-locale";
const SUPPORTED: SupportedLocale[] = ["en", "ar"];

function readStoredLocale(): SupportedLocale {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return SUPPORTED.includes(v as SupportedLocale) ? (v as SupportedLocale) : "en";
}

/** Merge locale override shallowly, then deep-merge the known nested groups. */
export function applyLocaleToLabels(
  base: OrgLabels,
  locale: SupportedLocale,
): OrgLabels {
  if (locale === "en") return base;

  const override = locale === "ar" ? arLabels : {};

  return {
    ...base,
    ...override,
    // Deep-merge nested label groups so a partial override doesn't wipe siblings.
    roleLabels: { ...base.roleLabels, ...override.roleLabels },
    caseStatusLabels: { ...base.caseStatusLabels, ...override.caseStatusLabels },
    deskLabels: { ...base.deskLabels, ...override.deskLabels },
    actionLabels: { ...base.actionLabels, ...override.actionLabels },
    priorityLabels: { ...base.priorityLabels, ...override.priorityLabels },
    detailSectionLabels: {
      ...base.detailSectionLabels,
      ...override.detailSectionLabels,
    },
    exportDocxLabels: { ...base.exportDocxLabels, ...override.exportDocxLabels },
    // `workflow` is never translated — always use base.
    workflow: base.workflow,
  };
}

export type UseLocaleReturn = {
  locale: SupportedLocale;
  setLocale: (l: SupportedLocale) => void;
  dir: "ltr" | "rtl";
};

export function useLocale(): UseLocaleReturn {
  const [locale, setLocaleState] = useState<SupportedLocale>("en");

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  // Async wrapper matches the project convention for setState-in-effect.
  useEffect(() => {
    const stored = readStoredLocale();
    const id = window.setTimeout(() => setLocaleState(stored), 0);
    return () => window.clearTimeout(id);
  }, []);

  const setLocale = useCallback((l: SupportedLocale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
    }
  }, []);

  const dir: "ltr" | "rtl" = locale === "ar" ? "rtl" : "ltr";

  return { locale, setLocale, dir };
}
