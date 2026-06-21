"use client";

import { useEffect } from "react";

const STORAGE_KEY = "sd-locale";
const LOCALE_DIR: Record<string, string> = { ar: "rtl" };

/**
 * Reads sd-locale from localStorage after mount and patches <html lang> and
 * <html dir>. Runs again whenever localStorage changes in another tab.
 * Falls back to "en" / "ltr" when the key is absent or unrecognised.
 */
export function HtmlLangSync() {
  useEffect(() => {
    function apply() {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const lang = stored === "ar" ? "ar" : "en";
      const dir = LOCALE_DIR[lang] ?? "ltr";
      document.documentElement.lang = lang;
      document.documentElement.dir = dir;
    }

    apply();

    // Keep in sync when another tab changes the locale.
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) apply();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}
