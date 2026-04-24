"use client";

import { useAuth } from "@/app/_components/auth/AuthContext";
import { mayAccessSettingsInUi } from "@/app/_lib/rbac";

export default function SettingsPage() {
  const { state } = useAuth();

  if (state.status === "signedInWorkspace" && !mayAccessSettingsInUi(state.role)) {
    return (
      <div className="stack-20">
        <div className="auth-card" style={{ maxWidth: 520, margin: "0 auto" }}>
          <h1 className="heading-xl">Settings unavailable</h1>
          <p className="subtext">
            Your workspace role does not include access to settings. Ask an owner or admin if you
            need a change.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-20">
      <div>
        <h1 className="page-intro-title">Settings</h1>
        <p className="page-intro-desc">
          Workspace preferences and how your organisation handles sensitive information.
        </p>
      </div>

      <section className="card stack-16">
        <div className="header-title">Workspace profile</div>
        <p className="subtext" style={{ margin: 0 }}>
          Your workspace name and region will appear here once configured for your organisation.
        </p>
      </section>

      <section className="card stack-16">
        <div className="header-title">Security</div>
        <p className="subtext" style={{ margin: 0 }}>
          Sign-in policies and session reminders are managed by your organisation&apos;s IT lead.
        </p>
      </section>

      <section className="card stack-16">
        <div className="header-title">Data handling</div>
        <p className="subtext" style={{ margin: 0 }}>
          Retention and export rules for cases and reporter messages are agreed with your leadership
          team and applied at the infrastructure level.
        </p>
      </section>

      <section className="card stack-16">
        <div className="header-title">Integrations</div>
        <p className="subtext" style={{ margin: 0 }}>
          Connections to other tools your team uses will be listed here in a future release.
        </p>
      </section>

      <section className="card stack-16">
        <div className="header-title">Team access</div>
        <p className="subtext" style={{ margin: 0 }}>
          Invitations and role changes will be available here once member management is turned on
          for your workspace.
        </p>
      </section>
    </div>
  );
}
