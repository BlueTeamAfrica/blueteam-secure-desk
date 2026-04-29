"use client";

import { useAuth } from "@/app/_components/auth/AuthContext";
import type { WorkspaceRole } from "@/app/_lib/rbac";
import { useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";

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

export function UserMenu() {
  const { state, signOut } = useAuth();
  const { labels } = useDashboardBranding();

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

      <button type="button" className="btn btn-ghost btn-small" onClick={handleSignOut}>
        Sign out
      </button>
    </div>
  );
}
