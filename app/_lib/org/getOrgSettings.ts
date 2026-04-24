export type OrgSettings = {
  /** Branding / copy */
  productName: string;
  /** Future i18n */
  locale: string;
  /** Future theming hooks */
  theme: "light";
};

/**
 * Organization-level settings.
 *
 * Phase 4: default-backed, no backend migration yet.
 * Later: this can read from a workspace/org document safely.
 */
export function getOrgSettings(): OrgSettings {
  return {
    productName: "Secure Reporter",
    locale: "en",
    theme: "light",
  };
}

