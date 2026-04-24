"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SidebarNav } from "@/app/_components/dashboard/SidebarNav";
import { UserMenu } from "@/app/_components/dashboard/UserMenu";
import { CaseQueueProvider } from "@/app/_components/dashboard/CaseQueueContext";
import { useAuth } from "@/app/_components/auth/AuthContext";
import { getOrgLabels } from "@/app/_lib/org/getOrgLabels";
import { normalizeSidebarView } from "@/app/_lib/caseWorkspaceModel";

function SidebarFallback() {
  const labels = getOrgLabels();
  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        <div className="brand">
          <div className="brand-badge">SR</div>
          <div>
            <div className="brand-title">{labels.productName}</div>
            <div className="brand-subtitle">Case management</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function editorDeskHeaderFor(args: { pathname: string; viewRaw: string | null }): {
  title: string;
  subtitle: string;
} {
  const { pathname, viewRaw } = args;
  const t = (viewRaw ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  const view = t || normalizeSidebarView(viewRaw);

  const inferred =
    pathname.endsWith("/my-queue") || pathname.endsWith("/my-queue/")
      ? "your-queue"
      : pathname.endsWith("/dashboard") || pathname.endsWith("/dashboard/")
        ? view
        : view;

  switch (inferred) {
    case "inbox":
      return { title: "Inbox", subtitle: "All visible filings across the desk." };
    case "raw":
    case "new":
    case "raw-materials":
      return { title: "Raw Materials", subtitle: "New incoming material waiting for movement." };
    case "edit1":
    case "first-editing":
    case "needs_triage":
      return { title: "First Editing", subtitle: "Stories currently in the first editorial pass." };
    case "assigned":
    case "your-queue":
      return { title: "Your queue", subtitle: "Items currently on your desk." };
    case "proof":
    case "proofreading":
    case "in_review":
      return { title: "Proofreading", subtitle: "Copy and correction stage." };
    case "design":
    case "designed":
    case "waiting_follow_up":
      return { title: "Designed", subtitle: "Stories currently in design." };
    case "published":
    case "resolved":
      return { title: "Published", subtitle: "Released pieces kept visible for reference." };
    case "archive":
    case "archived":
      return { title: "Archive", subtitle: "Past work retained for search and review." };
    default:
      return {
        title: "Editor desk",
        subtitle: "Work the desk clearly and move filings forward.",
      };
  }
}

function EditorDeskHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hdr = editorDeskHeaderFor({
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const { status } = state;
  const router = useRouter();
  const labels = getOrgLabels();
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
      <div className="dashboard-shell" {...(deskMode ? { "data-desk-mode": deskMode } : {})}>
        <Suspense fallback={<SidebarFallback />}>
          <SidebarNav />
        </Suspense>
        <div className="dash-column">
          <header
            className={`topbar${deskMode === "managing-editor" ? " topbar--managing-editor-minimal" : ""}`}
          >
            <div
              className={`topbar-inner${deskMode === "managing-editor" ? " topbar-inner--managing-editor-minimal" : ""}`}
            >
              <div>
                {state.status === "signedInWorkspace" && state.role === "reviewer" ? (
                  <>
                    <Suspense
                      fallback={
                        <>
                          <div className="header-title header-title--desk">Editor desk</div>
                          <div className="header-subtitle header-subtitle--desk">
                            Work the desk clearly and move filings forward.
                          </div>
                        </>
                      }
                    >
                      <EditorDeskHeader />
                    </Suspense>
                  </>
                ) : state.status === "signedInWorkspace" &&
                  (state.role === "owner" || state.role === "admin") ? (
                  <div className="topbar-me-brand" aria-hidden="true">
                    <span className="topbar-me-brand-mark" />
                    <span className="topbar-me-brand-text">{labels.productName}</span>
                  </div>
                ) : (
                  <>
                    <div className="header-title">News desk</div>
                    <div className="header-subtitle">Route tips, keep the trail clear, move work forward.</div>
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
