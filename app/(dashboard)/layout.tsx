"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SidebarNav } from "@/app/_components/dashboard/SidebarNav";
import { SidebarBrandHeader } from "@/app/_components/dashboard/SidebarBrandHeader";
import { UserMenu } from "@/app/_components/dashboard/UserMenu";
import { CaseQueueProvider } from "@/app/_components/dashboard/CaseQueueContext";
import { useAuth } from "@/app/_components/auth/AuthContext";
import { getEditorDeskHeaderFor } from "@/app/_lib/org/getWorkspaceConfig";
import { WorkspaceBrandingProvider, useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";

function SidebarFallback() {
  const { labels } = useDashboardBranding();
  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        <SidebarBrandHeader labels={labels} role={null} />
      </div>
    </aside>
  );
}

function EditorDeskHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hdr = getEditorDeskHeaderFor({
    pathname,
    viewRaw: searchParams.get("view"),
  });
  return (
    <>
      <div className="header-title header-title--desk">{hdr.title}</div>
      <div className="header-subtitle header-subtitle--desk">{hdr.subtitle}</div>
    </>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const { status } = state;
  const router = useRouter();
  const { labels, branding } = useDashboardBranding();
  const editorDeskFallbackTitle = labels.editorDeskHeaderSuspenseTitle;
  const editorDeskFallbackSubtitle = labels.editorDeskHeaderSuspenseSubtitle;
  const deskMode =
    state.status === "signedInWorkspace"
      ? state.role === "reviewer"
        ? "editor"
        : state.role === "owner" || state.role === "admin"
          ? "managing-editor"
          : undefined
      : undefined;

  useEffect(() => {
    if (status === "signedOut") {
      router.replace("/login?next=/dashboard");
    }
  }, [router, status]);

  if (status === "loading") {
    return (
      <main className="auth-gate-loading">
        <div className="auth-gate-loading-inner">
          <div className="spinner" />
          <span>Checking your access…</span>
        </div>
      </main>
    );
  }

  if (status === "signedOut") {
    return (
      <main className="auth-gate-loading">
        <div className="auth-gate-loading-inner">
          <div className="spinner" />
          <span>Signing you in…</span>
        </div>
      </main>
    );
  }

  if (status === "signedInButUnauthorized") {
    return (
      <main className="auth-layout">
        <div className="auth-card">
          <h1 className="heading-xl">Access not enabled</h1>
          <p className="subtext">
            This workspace is limited to approved staff. Ask your administrator to enable your account
            for case management.
          </p>
        </div>
      </main>
    );
  }

  if (status === "signedInNoRole") {
    return (
      <main className="auth-layout">
        <div className="auth-card">
          <h1 className="heading-xl">Workspace role not assigned</h1>
          <p className="subtext">
            Your account is approved for this app, but no role was found in the staff directory
            (Firestore <code className="inline-code">users</code> / your user id). Ask an owner to
            assign a role so the correct navigation and permissions load.
          </p>
        </div>
      </main>
    );
  }

  if (status !== "signedInWorkspace") {
    return null;
  }

  return (
    <CaseQueueProvider>
      <div
        className="dashboard-shell"
        {...(deskMode ? { "data-desk-mode": deskMode } : {})}
        style={branding.accentColor ? ({ ["--accent" as string]: branding.accentColor } as Record<string, string>) : undefined}
      >
        <Suspense fallback={<SidebarFallback />}>
          <SidebarNav />
        </Suspense>
        <div className="dash-column">
          <header className={`topbar${deskMode === "managing-editor" ? " topbar--managing-editor-minimal" : ""}`}>
            <div
              className={`topbar-inner${deskMode === "managing-editor" ? " topbar-inner--managing-editor-minimal" : ""}`}
            >
              <div>
                {state.status === "signedInWorkspace" && state.role === "reviewer" ? (
                  <>
                    <Suspense
                      fallback={
                        <>
                          <div className="header-title header-title--desk">{editorDeskFallbackTitle}</div>
                          <div className="header-subtitle header-subtitle--desk">{editorDeskFallbackSubtitle}</div>
                        </>
                      }
                    >
                      <EditorDeskHeader />
                    </Suspense>
                  </>
                ) : state.status === "signedInWorkspace" && (state.role === "owner" || state.role === "admin") ? (
                  <div className="topbar-me-brand" aria-hidden="true">
                    {branding.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={branding.logoUrl} alt="" className="topbar-me-logo" />
                    ) : (
                      <span className="topbar-me-brand-mark" />
                    )}
                    <span className="topbar-me-brand-text">{labels.workspaceName}</span>
                  </div>
                ) : (
                  <>
                    <div className="header-title">{labels.intakeTopbarTitle}</div>
                    <div className="header-subtitle">{labels.intakeTopbarSubtitle}</div>
                  </>
                )}
              </div>
              <UserMenu />
            </div>
          </header>
          <main className="content">
            <div className="container container--wide">{children}</div>
          </main>
        </div>
      </div>
    </CaseQueueProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceBrandingProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </WorkspaceBrandingProvider>
  );
}
