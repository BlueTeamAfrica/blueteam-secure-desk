/**
 * Pure locale-merge function — no browser APIs, safe to import from both
 * server and client modules.
 */
import type { OrgLabels } from "@/app/_lib/org/types";
import { arLabels } from "@/app/_lib/i18n/ar";
import type { SupportedLocale } from "@/app/_lib/i18n/useLocale";

export function applyLocaleToLabels(base: OrgLabels, locale: SupportedLocale | string): OrgLabels {
  if (locale === "en") return base;

  const override = locale === "ar" ? arLabels : {};

  return {
    ...base,
    ...override,
    roleLabels: { ...base.roleLabels, ...override.roleLabels },
    caseStatusLabels: { ...base.caseStatusLabels, ...override.caseStatusLabels },
    deskLabels: { ...base.deskLabels, ...override.deskLabels },
    actionLabels: { ...base.actionLabels, ...override.actionLabels },
    priorityLabels: { ...base.priorityLabels, ...override.priorityLabels },
    detailSectionLabels: { ...base.detailSectionLabels, ...override.detailSectionLabels },
    exportDocxLabels: { ...base.exportDocxLabels, ...override.exportDocxLabels },
    settingsLabels: { ...base.settingsLabels, ...override.settingsLabels },
    notificationLabels: { ...base.notificationLabels, ...override.notificationLabels },
    workflow: base.workflow,
  };
}
