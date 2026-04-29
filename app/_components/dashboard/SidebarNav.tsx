"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useAuth } from "@/app/_components/auth/AuthContext";
import { useCaseQueue } from "@/app/_components/dashboard/CaseQueueContext";
import { SidebarBrandHeader } from "@/app/_components/dashboard/SidebarBrandHeader";
import { ROLE_NAV, type WorkspaceRole } from "@/app/_lib/rbac";
import { normalizeSidebarView, rowMatchesSidebarView, type SidebarViewKey } from "@/app/_lib/caseWorkspaceModel";
import type { OrgLabels } from "@/app/_lib/org/types";
import { useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";

type NavItem =
  | { kind: "cases"; key: SidebarViewKey; label: string; href: string }
  | { kind: "route"; key: "my_queue"; label: string; href: string; roles: WorkspaceRole[] }
  | { kind: "settings"; label: string; href: string };

function buildAllSidebarItems(l: OrgLabels, role: WorkspaceRole | null): NavItem[] {
  const hrefByKey = new Map<SidebarViewKey, string>(
    l.workflow.sidebarStageViews.map(({ key, href }) => [
      key,
      key === "inbox"
        ? href
        : href === "/dashboard" || href === "/dashboard?view=inbox"
          ? `/dashboard?view=${key}`
          : href,
    ]),
  );

  const casesItem = (key: SidebarViewKey): NavItem => ({
    kind: "cases",
    key,
    href: hrefByKey.get(key) ?? `/dashboard?view=${key}`,
    label: key,
  });

  const stageLaneKeys: SidebarViewKey[] = ["new", "needs_triage", "assigned", "in_review", "waiting_follow_up", "resolved"];

  const baseForManaging: NavItem[] = [
    casesItem("inbox"),
    casesItem("needs_lead"),
    casesItem("assigned_work"),
    { kind: "route", key: "my_queue", label: l.myQueue, href: "/dashboard/my-queue", roles: ["owner", "admin", "reviewer", "intake"] },
    ...stageLaneKeys.map((k) => casesItem(k)),
    casesItem("archive"),
    casesItem("team"),
    { kind: "settings", label: l.settings, href: "/settings" },
  ];

  const baseForEditor: NavItem[] = [
    casesItem("inbox"),
    { kind: "route", key: "my_queue", label: l.myQueue, href: "/dashboard/my-queue", roles: ["owner", "admin", "reviewer", "intake"] },
    ...stageLaneKeys.map((k) => casesItem(k)),
    casesItem("archive"),
  ];

  if (role === "owner" || role === "admin") return baseForManaging;
  if (role === "reviewer" || role === "intake" || role === "readonly") return baseForEditor;
  return baseForEditor;
}

function navLabelForRole(role: WorkspaceRole | null, item: NavItem, labels: OrgLabels): string {
  if (item.kind === "settings") return item.label;
  if (item.kind === "route") {
    return labels.myQueue;
  }
  if (item.kind === "cases") {
    if (item.key === "inbox") return labels.inbox;
    if (item.key === "needs_lead") return labels.needsALead;
    if (item.key === "assigned_work") return "Assigned work";
    if (item.key === "team") return labels.teamNavDefault;
    if (item.key === "analytics") return labels.analytics;
    if (item.key === "archive") return labels.archive;
    if (item.key === "needs_triage") return labels.caseStatusLabels.needs_triage ?? labels.needsTriage;
    if (item.key === "waiting_follow_up")
      return labels.caseStatusLabels.waiting_follow_up ?? labels.awaitingFollowUp;
    if (item.key === "in_review") return labels.caseStatusLabels.in_review ?? labels.inReview;
    if (item.key === "new") return labels.caseStatusLabels.new ?? labels.new;
    if (item.key === "assigned") return labels.caseStatusLabels.assigned ?? labels.assignments;
    if (item.key === "resolved") return labels.caseStatusLabels.resolved ?? labels.resolved;
  }
  return item.label;
}

function navSectionLabel(role: WorkspaceRole | null, labels: OrgLabels): string {
  if (role === "reviewer") return labels.navSectionYourDesk;
  if (role === "owner" || role === "admin") return labels.navSectionQueues;
  return labels.navSectionMenu;
}

function rowHasOwner(r: { assignedOwnerId: string | null; assignedOwnerName: string | null }): boolean {
  return !!(r.assignedOwnerId?.trim() || r.assignedOwnerName?.trim());
}

function isRowAssignedToUser(
  r: { assignedOwnerId: string | null; assignedOwnerName: string | null },
  ctx: { uid: string; email: string | null; displayName: string | null },
): boolean {
  const ownerId = r.assignedOwnerId?.trim();
  if (ownerId && ownerId === ctx.uid) return true;
  const name = r.assignedOwnerName?.trim();
  if (!name) return false;
  const nl = name.toLowerCase();
  const em = ctx.email?.trim().toLowerCase() ?? "";
  if (em && nl === em) return true;
  const dn = ctx.displayName?.trim().toLowerCase() ?? "";
  if (dn && nl === dn) return true;
  const local = em.includes("@") ? em.slice(0, em.indexOf("@")) : em;
  if (local && nl === local) return true;
  return false;
}

export function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useAuth();
  const { labels } = useDashboardBranding();
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

  const allSidebarItems = useMemo(() => buildAllSidebarItems(labels, workspaceRole), [labels, workspaceRole]);

  const navItems = useMemo(
    () =>
      allSidebarItems.filter((item) => {
        if (item.kind === "settings") return allowedKeys.has("settings");
        if (item.kind === "route") {
          if (!routeRole) return false;
          return item.roles.includes(routeRole);
        }
        return allowedKeys.has(item.key);
      }),
    [allowedKeys, routeRole, allSidebarItems],
  );

  const displayNavItems = navItems;

  const counts = useMemo(() => {
    const base = Object.fromEntries(
      labels.workflow.sidebarStageViews.map(({ key }) => [key, 0]),
    ) as Record<SidebarViewKey, number>;
    for (const r of rows) {
      for (const key of Object.keys(base) as SidebarViewKey[]) {
        if (rowMatchesSidebarView(r, key)) base[key] += 1;
      }
    }
    return base;
  }, [rows, labels.workflow.sidebarStageViews]);

  const userCtx = useMemo(() => {
    if (state.status !== "signedInWorkspace") return null;
    const u = state.user;
    return { uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null };
  }, [state]);

  const assignedAnyCount = useMemo(() => rows.filter((r) => rowHasOwner(r) && r.status !== "archived").length, [rows]);
  const needsLeadCount = useMemo(() => rows.filter((r) => !rowHasOwner(r) && r.status !== "archived").length, [rows]);
  const myQueueCount = useMemo(() => {
    if (!userCtx) return 0;
    return rows.filter((r) => rowHasOwner(r) && r.status !== "archived" && isRowAssignedToUser(r, userCtx)).length;
  }, [rows, userCtx]);

  const isEditorDesk = workspaceRole === "reviewer";
  const isManagingEditorDesk = workspaceRole === "owner" || workspaceRole === "admin";

  return (
    <aside
      className={`sidebar${isEditorDesk ? " sidebar--editor-desk" : ""}${isManagingEditorDesk ? " sidebar--managing-editor-desk" : ""}`}
    >
      <div className="sidebar-inner">
        <SidebarBrandHeader labels={labels} role={workspaceRole} />

        <div>
          <div className="nav-section-label">{navSectionLabel(workspaceRole, labels)}</div>
          <div className="status-nav">
            {displayNavItems.map((item) => {
              if (item.kind === "settings") {
                const isActive = pathname.startsWith("/settings");
                return (
                  <Link
                    key="settings"
                    href={item.href}
                    className={`status-nav-item${isActive ? " is-active" : ""}`}
                  >
                    <span>{navLabelForRole(workspaceRole, item, labels)}</span>
                    <span className="status-count">—</span>
                  </Link>
                );
              }
              if (item.kind === "route") {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const countNum = item.key === "my_queue" ? myQueueCount : null;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`status-nav-item${isActive ? " is-active" : ""}`}
                  >
                    <span>{navLabelForRole(workspaceRole, item, labels)}</span>
                    {typeof countNum === "number" ? (
                      countNum > 0 ? (
                        <span className="status-count is-nonzero">{String(countNum)}</span>
                      ) : (
                        <span className="status-count is-zero">{String(countNum)}</span>
                      )
                    ) : (
                      <span className="status-count">—</span>
                    )}
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
                isTeam || isAnalytics
                  ? "—"
                  : item.key === "assigned_work"
                    ? String(assignedAnyCount)
                    : item.key === "needs_lead"
                      ? String(needsLeadCount)
                    : isInbox
                      ? String(counts.inbox)
                      : String(counts[item.key]);
              const countNum =
                isTeam || isAnalytics
                  ? null
                  : item.key === "assigned_work"
                    ? assignedAnyCount
                    : item.key === "needs_lead"
                      ? needsLeadCount
                    : isInbox
                      ? counts.inbox
                      : counts[item.key];
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`status-nav-item${isActive ? " is-active" : ""}`}
                >
                  <span>{navLabelForRole(workspaceRole, item, labels)}</span>
                  {isTeam || isAnalytics ? (
                    <span className="status-count">—</span>
                  ) : typeof countNum === "number" && countNum > 0 ? (
                    <span className="status-count is-nonzero">{count}</span>
                  ) : (
                    <span className="status-count is-zero">{count}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
