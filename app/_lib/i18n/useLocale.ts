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
import { getWorkspaceConfig } from "@/app/_lib/org/getWorkspaceConfig";
export { applyLocaleToLabels } from "@/app/_lib/i18n/applyLocaleToLabels";
export type { OrgLabels } from "@/app/_lib/org/types";

export type SupportedLocale = "en" | "ar";

const STORAGE_KEY = "sd-locale";
const SUPPORTED: SupportedLocale[] = ["en", "ar"];

function readStoredLocale(): SupportedLocale {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (SUPPORTED.includes(v as SupportedLocale)) return v as SupportedLocale;
  // Fall back to the workspace config default so factsd opens in Arabic by default.
  const configLocale = getWorkspaceConfig().locale;
  return SUPPORTED.includes(configLocale as SupportedLocale) ? (configLocale as SupportedLocale) : "en";
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
