"use client";

import { useAuth } from "@/app/_components/auth/AuthContext";
import { mayAccessSettingsInUi } from "@/app/_lib/rbac";
import { getFirebaseAuth } from "@/app/_lib/firebase/auth";
import { fetchOneDriveStatus, startOneDriveConnect } from "@/app/_lib/integrations/onedrive/client";
import { useEffect, useMemo, useState } from "react";

export default function SettingsPage() {
  const { state } = useAuth();
  const sessionReady = state.status === "signedInWorkspace";
  const role = sessionReady ? state.role : null;
  const canSeeIntegrations = role === "owner" || role === "admin";

  const [oneDriveConnected, setOneDriveConnected] = useState<boolean | null>(null);
  const [oneDriveAccountEmail, setOneDriveAccountEmail] = useState<string | null>(null);
  const [oneDriveBusy, setOneDriveBusy] = useState(false);
  const [oneDriveError, setOneDriveError] = useState<string | null>(null);

  const [pullSyncBusy, setPullSyncBusy] = useState(false);
  const [pullSyncResult, setPullSyncResult] = useState<{
    checked: number;
    updated: number;
    errors?: string[];
  } | null>(null);
  const [pullSyncError, setPullSyncError] = useState<string | null>(null);

  const idTokenFn = useMemo(() => {
    return async () => {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error("Not signed in");
      return await user.getIdToken(true);
    };
  }, []);

  useEffect(() => {
    if (!sessionReady || !canSeeIntegrations) {
      setOneDriveConnected(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const user = getFirebaseAuth().currentUser;
      if (!user) return;
      const result = await fetchOneDriveStatus({ getIdToken: () => user.getIdToken(true) });
      if (cancelled) return;
      if (!result.ok) {
        setOneDriveConnected(false);
        setOneDriveAccountEmail(null);
        return;
      }
      setOneDriveConnected(result.connected);
      setOneDriveAccountEmail(result.accountEmail ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, canSeeIntegrations]);

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
          Connect your newsroom tools to streamline exports.
        </p>
        {canSeeIntegrations ? (
          <div className="stack-12" style={{ marginTop: 10 }}>
            <div className="action-row" style={{ flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn"
                disabled={oneDriveBusy}
                onClick={() => {
                  setOneDriveError(null);
                  setOneDriveBusy(true);
                  (async () => {
                    try {
                      const result = await startOneDriveConnect({ getIdToken: idTokenFn });
                      if (!result.ok) {
                        setOneDriveError(result.error);
                        return;
                      }
                      window.location.assign(result.url);
                    } catch {
                      setOneDriveError("Could not start OneDrive connection.");
                    } finally {
                      setOneDriveBusy(false);
                    }
                  })();
                }}
              >
                {oneDriveConnected ? "Reconnect OneDrive" : "Connect OneDrive"}
              </button>
              <div className="small-muted" style={{ alignSelf: "center" }}>
                {oneDriveConnected === null
                  ? "Checking status…"
                  : oneDriveConnected
                    ? `Connected${oneDriveAccountEmail ? ` · ${oneDriveAccountEmail}` : ""}`
                    : "Not connected"}
              </div>
            </div>
            {oneDriveError ? (
              <div className="alert alert-danger" role="alert">
                {oneDriveError}
              </div>
            ) : null}

            {oneDriveConnected ? (
              <div className="stack-8" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div className="small-muted">
                  Pull latest stage changes from OneDrive into Secure Desk. Runs automatically
                  every hour — use this to sync immediately after a manual folder move.
                </div>
                <div className="action-row" style={{ flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pullSyncBusy}
                    onClick={() => {
                      setPullSyncError(null);
                      setPullSyncResult(null);
                      setPullSyncBusy(true);
                      (async () => {
                        try {
                          const user = getFirebaseAuth().currentUser;
                          if (!user) throw new Error("Not signed in");
                          const token = await user.getIdToken(true);
                          const res = await fetch("/api/admin/onedrive/pull-sync", {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          const data = await res.json().catch(() => null);
                          if (!res.ok) {
                            setPullSyncError(data?.error ?? "Sync failed.");
                            return;
                          }
                          setPullSyncResult({
                            checked: data.checked ?? 0,
                            updated: data.updated ?? 0,
                            errors: data.errors,
                          });
                        } catch {
                          setPullSyncError("Could not run OneDrive sync.");
                        } finally {
                          setPullSyncBusy(false);
                        }
                      })();
                    }}
                  >
                    {pullSyncBusy ? "Syncing…" : "Sync from OneDrive"}
                  </button>
                  {pullSyncResult && !pullSyncBusy ? (
                    <div className="small-muted" style={{ alignSelf: "center" }}>
                      {pullSyncResult.updated === 0
                        ? `Already in sync — checked ${pullSyncResult.checked} submission${pullSyncResult.checked !== 1 ? "s" : ""}`
                        : `Updated ${pullSyncResult.updated} of ${pullSyncResult.checked} submission${pullSyncResult.checked !== 1 ? "s" : ""}`}
                    </div>
                  ) : null}
                </div>
                {pullSyncError ? (
                  <div className="alert alert-danger" role="alert">
                    {pullSyncError}
                  </div>
                ) : null}
                {pullSyncResult?.errors?.length ? (
                  <div className="alert alert-danger" role="alert">
                    {pullSyncResult.errors.map((e, i) => (
                      <div key={i}>{e}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="small-muted" style={{ marginTop: 10 }}>
            OneDrive connections are available to workspace owners and admins.
          </div>
        )}
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
