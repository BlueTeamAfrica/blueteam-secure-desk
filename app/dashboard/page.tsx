"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/_components/auth/AuthContext";
import { defaultDashboardViewForRole, isDashboardQueryViewAllowed } from "@/app/_lib/rbac";
import { normalizeSidebarView } from "@/app/_lib/caseWorkspaceModel";
import type { WorkspaceRole } from "@/app/_lib/rbac";
import { SubmissionsList } from "@/app/(dashboard)/dashboard/SubmissionsList";
import { useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";

function SubmissionsFallback({ role }: { role: WorkspaceRole | null }) {
  const { labels } = useDashboardBranding();
  const label =
    role === "reviewer"
      ? "Opening your desk…"
      : role === "owner" || role === "admin"
        ? `Loading the ${labels.runSheet.toLowerCase()}…`
        : "Loading cases…";
  return (
    <div className="card" style={{ padding: "32px 24px" }}>
      <div className="row-between">
        <div className="spinner" />
        <span className="muted" style={{ fontSize: 14 }}>
          {label}
        </span>
      </div>
    </div>
  );
}

function DashboardContent() {
  const { state } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sessionReady = state.status === "signedInWorkspace";
  const role = sessionReady ? state.role : null;

  useEffect(() => {
    if (!sessionReady || !role) return;
    const raw = searchParams.get("view");
    const view = normalizeSidebarView(raw);
    if (!isDashboardQueryViewAllowed(role, view)) {
      router.replace(`${pathname}?view=${defaultDashboardViewForRole(role)}`);
    }
  }, [pathname, router, searchParams, role, sessionReady]);

  return (
    <Suspense fallback={<SubmissionsFallback role={role} />}>
      <SubmissionsList sessionReady={sessionReady} role={role} />
    </Suspense>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="stack-20">
          <SubmissionsFallback role={null} />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

