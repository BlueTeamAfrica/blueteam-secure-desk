"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useAuth } from "@/app/_components/auth/AuthContext";
import { useCaseQueue } from "@/app/_components/dashboard/CaseQueueContext";
import { ROLE_NAV, type WorkspaceRole } from "@/app/_lib/rbac";
import { normalizeSidebarView, rowMatchesSidebarView, type SidebarViewKey } from "@/app/_lib/caseWorkspaceModel";
import { getOrgLabels } from "@/app/_lib/org/getOrgLabels";

type NavItem =
  | { kind: "cases"; key: SidebarViewKey; label: string; href: string }
  | { kind: "route"; key: "my_queue" | "assignments"; label: string; href: string; roles: WorkspaceRole[] }
  | { kind: "settings"; label: string; href: string };

const ALL_SIDEBAR_ITEMS: NavItem[] = [
  { kind: "cases", key: "inbox", label: "Inbox", href: "/dashboard" },
  { kind: "cases", key: "new", label: "Raw Materials", href: "/dashboard?view=new" },
  { kind: "cases", key: "needs_triage", label: "First Editing", href: "/dashboard?view=needs_triage" },
  { kind: "cases", key: "assigned", label: "Second Editing", href: "/dashboard?view=assigned" },
  { kind: "cases", key: "in_review", label: "Proofreading", href: "/dashboard?view=in_review" },
  {
    kind: "cases",
    key: "waiting_follow_up",
    label: "Designed",
    href: "/dashboard?view=waiting_follow_up",
  },
  { kind: "cases", key: "resolved", label: "Published", href: "/dashboard?view=resolved" },
  { kind: "cases", key: "archive", label: "Archive", href: "/dashboard?view=archive" },
  { kind: "cases", key: "team", label: "Team", href: "/dashboard?view=team" },
  { kind: "cases", key: "analytics", label: "Analytics", href: "/dashboard?view=analytics" },
  {
    kind: "route",
    key: "my_queue",
    label: "My Queue",
    href: "/dashboard/my-queue",
    roles: ["owner", "admin"],
  },
  {
    kind: "route",
    key: "assignments",
    label: "Assignments",
    href: "/dashboard/assignments",
    roles: ["owner", "admin"],
  },
  { kind: "settings", label: "Settings", href: "/settings" },
];

function navLabelForRole(role: WorkspaceRole | null, item: NavItem): string {
  const labels = getOrgLabels();
  if (item.kind === "settings") return item.label;
  if (item.kind === "route") {
    if (item.key === "my_queue") return labels.myQueue;
    if (item.key === "assignments") return labels.assignments;
    return item.label;
  }
  if (role === "reviewer" && item.key === "assigned") return labels.myQueue;
  if ((role === "owner" || role === "admin") && item.kind === "cases") {
    if (item.key === "inbox") return labels.activeReports;
    if (item.key === "new") return labels.new;
    if (item.key === "needs_triage") return labels.needsTriage;
    if (item.key === "assigned") return labels.withLead;
    if (item.key === "in_review") return labels.inReview;
    if (item.key === "waiting_follow_up") return labels.awaitingFollowUp;
    if (item.key === "resolved") return labels.resolved;
    if (item.key === "archive") return labels.archive;
    if (item.key === "team") return "Team roster";
    if (item.key === "analytics") return labels.analytics;
  }
  if (item.kind === "cases") {
    if (item.key === "inbox") return labels.inbox;
    if (item.key === "new") return labels.new;
    if (item.key === "needs_triage") return labels.needsTriage;
    if (item.key === "assigned") return labels.assignments;
    if (item.key === "in_review") return labels.inReview;
    if (item.key === "waiting_follow_up") return labels.awaitingFollowUp;
    if (item.key === "resolved") return labels.resolved;
    if (item.key === "archive") return labels.archive;
    if (item.key === "analytics") return labels.analytics;
    if (item.key === "team") return "Team";
  }
  return item.label;
}

function navSectionLabel(role: WorkspaceRole | null): string {
  if (role === "reviewer") return "Your desk";
  if (role === "owner" || role === "admin") return "Queues";
  return "Menu";
}

export function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useAuth();
  const labels = getOrgLabels();
  const activeView =
    pathname.startsWith("/dashboard") ? normalizeSidebarView(searchParams.get("view")) : null;
  const { rows } = useCaseQueue();

  const workspaceRole: WorkspaceRole | null =
    state.status === "signedInWorkspace" ? state.role : null;

  const allowedKeys = useMemo(() => {
    if (state.status !== "signedInWorkspace") return new Set<string>();
    return new Set(ROLE_NAV[state.role]);
  }, [state]);

  const routeRole: WorkspaceRole | null = workspaceRole;

  const navItems = useMemo(
    () =>
      ALL_SIDEBAR_ITEMS.filter((item) => {
        if (item.kind === "settings") return allowedKeys.has("settings");
        if (item.kind === "route") {
          if (!routeRole) return false;
          return item.roles.includes(routeRole);
        }
        return allowedKeys.has(item.key);
      }),
    [allowedKeys, routeRole],
  );

  const counts = useMemo(() => {
    const base: Record<SidebarViewKey, number> = {
      inbox: 0,
      new: 0,
      needs_triage: 0,
      assigned: 0,
      in_review: 0,
      waiting_follow_up: 0,
      resolved: 0,
      archive: 0,
      team: 0,
      analytics: 0,
    };
    for (const r of rows) {
      for (const key of Object.keys(base) as SidebarViewKey[]) {
        if (rowMatchesSidebarView(r, key)) base[key] += 1;
      }
    }
    return base;
  }, [rows]);

  const isEditorDesk = workspaceRole === "reviewer";
  const isManagingEditorDesk = workspaceRole === "owner" || workspaceRole === "admin";

  return (
    <aside
      className={`sidebar${isEditorDesk ? " sidebar--editor-desk" : ""}${isManagingEditorDesk ? " sidebar--managing-editor-desk" : ""}`}
    >
      <div className="sidebar-inner">
        {isManagingEditorDesk ? (
          <div className="brand brand--logo-card">
            <div className="brand-logo-tile" aria-hidden="true">
              <Image
                src="/editorial/sf1.png"
                alt=""
                width={720}
                height={240}
                sizes="(max-width: 900px) 280px, 320px"
                className="brand-logo-img"
                priority
              />
            </div>
            <div className="brand-subtitle brand-subtitle--logo-card">Managing Editor Desk</div>
          </div>
        ) : (
          <div className="brand">
            <div className="brand-logo" aria-hidden="true">
              <Image
                src="/editorial/sf1.png"
                alt=""
                width={72}
                height={72}
                sizes="(max-width: 900px) 64px, 72px"
                className="brand-logo-img"
                priority
              />
            </div>
            <div>
              <div className="brand-title">{labels.productName}</div>
              <div className="brand-subtitle">{isEditorDesk ? "Editor desk" : "Case workspace"}</div>
            </div>
          </div>
        )}

        <div>
          <div className="nav-section-label">{navSectionLabel(workspaceRole)}</div>
          <div className="status-nav">
            {navItems.map((item) => {
              if (item.kind === "settings") {
                const isActive = pathname.startsWith("/settings");
                return (
                  <Link
                    key="settings"
                    href={item.href}
                    className={`status-nav-item${isActive ? " is-active" : ""}`}
                  >
                    <span>{navLabelForRole(workspaceRole, item)}</span>
                    <span className="status-count">—</span>
                  </Link>
                );
              }
              if (item.kind === "route") {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`status-nav-item${isActive ? " is-active" : ""}`}
                  >
                    <span>{navLabelForRole(workspaceRole, item)}</span>
                    <span className="status-count">—</span>
                  </Link>
                );
              }
              const isInbox = item.key === "inbox";
              const isTeam = item.key === "team";
              const isAnalytics = item.key === "analytics";
              const isActive =
                isTeam || isAnalytics
                  ? pathname.startsWith("/dashboard") && activeView === item.key
                  : isInbox
                    ? pathname.startsWith("/dashboard") && activeView === "inbox"
                    : pathname.startsWith("/dashboard") && activeView === item.key;
              const count =
                isTeam || isAnalytics ? "—" : isInbox ? String(counts.inbox) : String(counts[item.key]);
              const countNum =
                isTeam || isAnalytics ? null : isInbox ? counts.inbox : counts[item.key];
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`status-nav-item${isActive ? " is-active" : ""}`}
                >
                  <span>{navLabelForRole(workspaceRole, item)}</span>
                  <span
                    className={`status-count${
                      typeof countNum === "number" && countNum > 0
                        ? " is-nonzero"
                        : typeof countNum === "number"
                          ? " is-zero"
                          : ""
                    }`}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
