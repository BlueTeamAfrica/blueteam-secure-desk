"use client";

import { useAuth } from "@/app/_components/auth/AuthContext";
import type { WorkspaceRole } from "@/app/_lib/rbac";
import { useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";
import type { SupportedLocale } from "@/app/_lib/i18n/useLocale";

function roleBadgeClass(role: WorkspaceRole): string {
  switch (role) {
    case "owner":
      return "role-badge role-badge--owner";
    case "admin":
      return "role-badge role-badge--admin";
    case "reviewer":
      return "role-badge role-badge--reviewer";
    case "intake":
      return "role-badge role-badge--intake";
    case "readonly":
      return "role-badge role-badge--readonly";
    default:
      return "role-badge";
  }
}

const LOCALE_LABELS: Record<SupportedLocale, string> = { en: "EN", ar: "AR" };
const SIGN_OUT_LABEL: Record<SupportedLocale, string> = { en: "Sign out", ar: "تسجيل خروج" };

export function UserMenu() {
  const { state, signOut } = useAuth();
  const { labels, locale, setLocale } = useDashboardBranding();

  const email =
    state.status === "signedInWorkspace" ||
    state.status === "signedInNoRole" ||
    state.status === "signedInButUnauthorized"
      ? (state.user.email ?? "Team member")
      : "Team member";

  async function handleSignOut() {
    await signOut();
  }

  return (
    <div className="user-menu">
      <div className="user-block">
        <span className="user-email">{email}</span>
        {state.status === "signedInWorkspace" ? (
          <span className={roleBadgeClass(state.role)}>{labels.roleLabels[state.role]}</span>
        ) : null}
      </div>

      {/* Language toggle */}
      <div className="locale-toggle" role="group" aria-label="Language">
        {(["en", "ar"] as SupportedLocale[]).map((l) => (
          <button
            key={l}
            type="button"
            className={`locale-toggle-btn${locale === l ? " is-active" : ""}`}
            onClick={() => setLocale(l)}
            aria-pressed={locale === l}
            aria-label={l === "en" ? "English" : "العربية"}
          >
            {LOCALE_LABELS[l]}
          </button>
        ))}
      </div>

      <button type="button" className="btn btn-ghost btn-small" onClick={handleSignOut}>
        {SIGN_OUT_LABEL[locale]}
      </button>
    </div>
  );
}
