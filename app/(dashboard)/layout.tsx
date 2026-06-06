"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SidebarNav } from "@/app/_components/dashboard/SidebarNav";
import { SidebarBrandHeader } from "@/app/_components/dashboard/SidebarBrandHeader";
import { UserMenu } from "@/app/_components/dashboard/UserMenu";
import { CaseQueueProvider } from "@/app/_components/dashboard/CaseQueueContext";
import { useAuth } from "@/app/_components/auth/AuthContext";
import { getEditorDeskHeaderFor } from "@/app/_lib/org/getWorkspaceConfig";
import { WorkspaceBrandingProvider, useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";
import { useCaseQueue } from "@/app/_components/dashboard/CaseQueueContext";

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

function MobileBottomNav() {
  const { labels } = useDashboardBranding();
  const { state } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const role = state.status === "signedInWorkspace" ? state.role : null;
  const basePath = pathname.startsWith("/sudanfacts") ? "/sudanfacts" : "/dashboard";

  const isInbox = pathname.startsWith(basePath) && !searchParams.get("view");
  const isMyQueue = pathname.startsWith(`${basePath}/my-queue`);
  const isSettings = pathname.startsWith("/settings") || pathname.startsWith("/sudanfacts/settings");

  return (
    <nav className="mobile-bottom-nav" aria-label="Main navigation">
      <Link href={basePath} className={`bottom-nav-item${isInbox ? " is-active" : ""}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
          <path d="M9 21V12h6v9"/>
        </svg>
        <span className="bottom-nav-label">{labels.inbox}</span>
      </Link>
      {(role === "owner" || role === "admin" || role === "reviewer" || role === "intake") && (
        <Link href={`${basePath}/my-queue`} className={`bottom-nav-item${isMyQueue ? " is-active" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5"/>
            <path d="M6 20v-.5c0-2 2.7-3.5 6-3.5s6 1.5 6 3.5v.5"/>
          </svg>
          <span className="bottom-nav-label">{labels.myQueue}</span>
        </Link>
      )}
      {(role === "owner" || role === "admin") && (
        <Link
          href={`${basePath}?view=needs_triage`}
          className={`bottom-nav-item${pathname.startsWith(basePath) && searchParams.get("view") === "needs_triage" ? " is-active" : ""}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          <span className="bottom-nav-label">{labels.caseStatusLabels?.raw ?? "raw"}</span>
        </Link>
      )}
      {(role === "owner" || role === "admin") && (
        <Link href={basePath === "/sudanfacts" ? "/sudanfacts/settings" : "/settings"} className={`bottom-nav-item${isSettings ? " is-active" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span className="bottom-nav-label">{labels.settings}</span>
        </Link>
      )}
    </nav>
  );
}

/** Reads the live queue count — must render inside CaseQueueProvider. */
function TopbarLiveBadge() {
  const { rows } = useCaseQueue();
  const count = rows.filter((r) => r.status !== "designed").length;
  if (count === 0) return null;
  return (
    <span className="topbar-live-badge" aria-label={`${count} active cases`}>
      {count}
    </span>
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
  const pathname = usePathname();
  const { labels, branding, dir, locale } = useDashboardBranding();
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

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close overlay sidebar whenever the route changes.
  // The async wrapper satisfies react-hooks/set-state-in-effect (avoids sync cascade).
  useEffect(() => {
    const id = typeof window !== "undefined" ? window.setTimeout(() => setSidebarOpen(false), 0) : null;
    return () => { if (id !== null) window.clearTimeout(id); };
  }, [pathname]);

  useEffect(() => {
    if (status === "signedOut") {
      const qs = typeof window !== "undefined" ? window.location.search : "";
      const next = `${pathname}${qs || ""}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [pathname, router, status]);

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
        dir={dir}
        lang={locale}
        {...(deskMode ? { "data-desk-mode": deskMode } : {})}
        {...(sidebarOpen ? { "data-sidebar-open": "true" } : {})}
        style={branding.accentColor ? ({ ["--accent" as string]: branding.accentColor } as Record<string, string>) : undefined}
      >
        {/* Backdrop for mobile/tablet overlay sidebar */}
        {sidebarOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <Suspense fallback={<SidebarFallback />}>
          <SidebarNav />
        </Suspense>

        <div className="dash-column">
          <header className={`topbar${deskMode === "managing-editor" ? " topbar--managing-editor-minimal" : ""}`}>
            <div
              className={`topbar-inner${deskMode === "managing-editor" ? " topbar-inner--managing-editor-minimal" : ""}`}
            >
              {/* Hamburger — visible only on tablet/mobile via CSS */}
              <button
                type="button"
                className="sidebar-hamburger"
                aria-label="Open navigation"
                aria-expanded={sidebarOpen}
                onClick={() => setSidebarOpen((v) => !v)}
              >
                <span className="sidebar-hamburger-bar" />
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
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
                  <div className="topbar-me-brand">
                    {branding.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={branding.logoUrl} alt="" className="topbar-me-logo" />
                    ) : (
                      <span className="topbar-me-brand-mark" />
                    )}
                    <span className="topbar-me-brand-text">{labels.workspaceName}</span>
                    <TopbarLiveBadge />
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
          {/* Mobile bottom nav — hidden on desktop via CSS */}
          <Suspense fallback={null}>
            <MobileBottomNav />
          </Suspense>
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
