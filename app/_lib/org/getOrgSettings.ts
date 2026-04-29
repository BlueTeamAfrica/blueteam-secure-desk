import type { OrgSettings } from "@/app/_lib/org/types";
import { getWorkspaceConfig } from "@/app/_lib/org/getWorkspaceConfig";

export type { OrgSettings };

export function getOrgSettings(): OrgSettings {
  const c = getWorkspaceConfig();
  return {
    ...c.branding,
    locale: c.locale,
    theme: c.theme,
  };
}
