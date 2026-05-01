"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extractDecryptedFiling,
  payloadFingerprint,
  type CachedCaseFiling,
} from "@/app/_lib/decryptedSubmissionReadout";
import { editorialCoverUrlByCaseId } from "@/app/_lib/assignEditorialCoverUrls";
import { getSubmissionDisplay } from "@/app/_lib/items/getSubmissionDisplay";
import { ItemCard } from "@/components/items/ItemCard";
import { ItemDetailPanel } from "@/components/items/ItemDetailPanel";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/app/_lib/firebase/firestore";
import { getFirebaseAuth } from "@/app/_lib/firebase/auth";
import { useAuth } from "@/app/_components/auth/AuthContext";
import { useCaseQueue } from "@/app/_components/dashboard/CaseQueueContext";
import {
  normalizeSidebarView,
  caseHasNoVisibleLead,
  normalizeSubmissionToCase,
  statusBadgeClass,
  toCaseQueueSnapshot,
  type CaseStatus,
  type SidebarViewKey,
  type WorkspaceCase,
} from "@/app/_lib/caseWorkspaceModel";
import {
  ROLE_LABEL,
  allowedCaseStatusTargets,
  filterCasesVisibleToRole,
  isCaseAssignedToWorkspaceUser,
  mayAccessTeamInUi,
  mayAssignInUi,
  mayChangeCaseStatusInUi,
  mayChangePriorityScaffoldInUi,
  mayEditInternalNotesInUi,
  mayResolveOrArchiveInUi,
  mayShowDecryptUi,
  type WorkspaceRole,
  type WorkspaceUserContext,
} from "@/app/_lib/rbac";
import { fetchSubmissionDocxDownload, triggerBrowserDownload } from "@/app/_lib/downloadSubmissionDocx";
import { canAssignItem, canDeleteItem, mayExportSubmissionDocx } from "@/app/_lib/workflow/permissions";
import { useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";
import { filterItemsByView } from "@/app/_lib/items/filterItemsByView";
import { getDashboardViewConfig } from "@/app/_lib/items/getDashboardViewConfig";
import { exportSubmissionToOneDrive } from "@/app/_lib/integrations/onedrive/client";

type SubmissionAuditAction = "save_reviewer_note";

export type WorkspaceMemberRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
};

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function parseIsoDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDurationCompact(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function relativeTimeShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return "—";
  const diffSec = Math.round((ms - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 48) return rtf.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  return rtf.format(diffDay, "day");
}

function statusChipLabel(status: CaseStatus, labels: ReturnType<typeof useDashboardBranding>["labels"]): string {
  return labels.caseStatusLabels[status] ?? "Status";
}

function meDeskHrefForStage(
  status: CaseStatus,
  labels: ReturnType<typeof useDashboardBranding>["labels"],
): string {
  const key = labels.workflow.viewKeyByStatus[status];
  const item = labels.workflow.sidebarStageViews.find((x) => x.key === key);
  return item?.href ?? "/dashboard";
}

function countResolvedTodayLocal(list: WorkspaceCase[]): number {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return list.filter((c) => {
    if (c.status !== "resolved") return false;
    const iso = c.resolvedAt?.trim();
    if (!iso) return false;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return false;
    return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
  }).length;
}

function executiveOverviewFromCases(list: WorkspaceCase[]) {
  const now = new Date();
  const newToday = list.filter((c) => {
    const created = parseIsoDate(c.createdAt);
    return created ? isSameLocalDay(created, now) : false;
  }).length;

  const awaitingReview = list.filter((c) => c.status === "needs_triage").length;
  const inReview = list.filter((c) => c.status === "in_review").length;
  const resolved = list.filter((c) => c.status === "resolved").length;

  const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const responseMs: number[] = [];
  for (const c of list) {
    const created = parseIsoDate(c.createdAt);
    const reviewed = parseIsoDate(c.reviewedAt);
    if (!created || !reviewed) continue;
    if (created < windowStart) continue;
    const dt = reviewed.getTime() - created.getTime();
    if (!Number.isFinite(dt) || dt <= 0) continue;
    responseMs.push(dt);
  }
  const avgResponseMs =
    responseMs.length > 0 ? responseMs.reduce((acc, v) => acc + v, 0) / responseMs.length : null;

  return {
    newToday,
    awaitingReview,
    inReview,
    resolved,
    avgResponseLabel: avgResponseMs === null ? "—" : formatDurationCompact(avgResponseMs),
    avgResponseHint:
      avgResponseMs === null
        ? "Response time appears once items have a Reviewed timestamp."
        : `Avg (last 30d), from filed → reviewed · n=${responseMs.length}`,
  };
}

function managingEditorOpsFromCases(list: WorkspaceCase[], labels: ReturnType<typeof useDashboardBranding>["labels"]) {
  const active = list.filter((c) => c.status !== "archived");
  const pipeline = active.filter((c) => c.status !== "resolved");
  const unassigned = pipeline.filter((c) => caseHasNoVisibleLead(c));
  const byStage = new Map<CaseStatus, number>();
  for (const c of pipeline) {
    byStage.set(c.status, (byStage.get(c.status) ?? 0) + 1);
  }
  const bottlenecks = labels.workflow.mePipelineStages.map((status) => ({
    status,
    count: byStage.get(status) ?? 0,
  })).filter((x) => x.count > 0);
  const resolvedStillOpen = active.filter((c) => c.status === "resolved").length;
  const inReviewCount = byStage.get("in_review") ?? 0;
  const resolvedTodayCount = countResolvedTodayLocal(list);
  return {
    activeTotal: active.length,
    pipelineTotal: pipeline.length,
    unassignedCount: unassigned.length,
    unassignedPreview: unassigned.slice(0, 4),
    bottlenecks,
    resolvedStillOpen,
    inReviewCount,
    resolvedTodayCount,
  };
}

function MeDeskKpiIcon({ kind }: { kind: "active" | "lead" | "review" | "resolved" }) {
  const svgProps = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true as const,
  };
  if (kind === "active") {
    return (
      <svg {...svgProps}>
        <path
          d="M9 5h11v14H9z"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
        <path
          d="M5 7h11v14H5z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
          opacity="0.45"
        />
      </svg>
    );
  }
  if (kind === "lead") {
    return (
      <svg {...svgProps}>
        <circle cx="12" cy="9" r="3.25" stroke="currentColor" strokeWidth="1.35" />
        <path
          d="M6 19.5v-.6c0-1.9 2.4-3.4 6-3.4s6 1.5 6 3.4v.6"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "review") {
    return (
      <svg {...svgProps}>
        <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.35" />
        <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.1" opacity="0.35" />
      <path
        d="M7.5 12.2l2.8 2.8 6.2-6.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SubmissionsList({
  sessionReady,
  role,
}: {
  sessionReady: boolean;
  role: WorkspaceRole | null;
}) {
  const searchParams = useSearchParams();
  const { labels, branding } = useDashboardBranding();
  const needsTriageHref =
    labels.workflow.sidebarStageViews.find((x) => x.key === "needs_triage")?.href ??
    "/dashboard?view=needs_triage";
  const view: SidebarViewKey = normalizeSidebarView(searchParams.get("view"));
  const caseDataEnabled = sessionReady && role !== null && role !== "readonly";
  const editorDesk = role === "reviewer";
  const managingEditorDesk = role === "owner" || role === "admin";

  const [cases, setCases] = useState<WorkspaceCase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decryptDebug, setDecryptDebug] = useState<unknown>(null);
  const [filingByCaseId, setFilingByCaseId] = useState<Record<string, CachedCaseFiling>>({});
  const filingByCaseIdRef = useRef(filingByCaseId);
  filingByCaseIdRef.current = filingByCaseId;
  const [scaffoldMessage, setScaffoldMessage] = useState<string | null>(null);
  const [assignPanelOpen, setAssignPanelOpen] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [assigneeUidDraft, setAssigneeUidDraft] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowStatusDraft, setWorkflowStatusDraft] = useState<CaseStatus | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exportDocxBusy, setExportDocxBusy] = useState(false);
  const [exportDocxError, setExportDocxError] = useState<string | null>(null);
  const [exportOneDriveBusy, setExportOneDriveBusy] = useState(false);
  const [exportOneDriveError, setExportOneDriveError] = useState<string | null>(null);
  const setDeleteConfirmPanelOpen = useCallback((open: boolean) => {
    setDeleteConfirmOpen(open);
    if (open) setDeleteError(null);
  }, []);
  const prevSelectedId = useRef<string | null>(null);
  const { state: authState } = useAuth();
  const { setRows: setCaseQueueRows } = useCaseQueue();

  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const user = getFirebaseAuth().currentUser;
      if (!user) {
        throw new Error("No current user.");
      }

      const headers = new Headers(init?.headers ?? undefined);
      const run = async (forceRefresh: boolean) => {
        const token = await user.getIdToken(forceRefresh);
        headers.set("Authorization", `Bearer ${token}`);
        return await fetch(url, { ...init, headers });
      };

      let res = await run(false);
      if (res.status === 401) {
        res = await run(true);
        if (res.status === 401) {
          // Keep the user signed in; handle this failure inline for the specific feature.
          console.warn("auth session valid but API authorization failed");
        }
      }
      return res;
    },
    [],
  );

  const userCtx: WorkspaceUserContext | null = useMemo(() => {
    if (authState.status !== "signedInWorkspace") return null;
    const u = authState.user;
    return {
      uid: u.uid,
      email: u.email ?? null,
      displayName: u.displayName ?? null,
    };
  }, [authState]);

  const roleFilteredCases = useMemo(() => {
    if (!role || !userCtx) return [];
    return filterCasesVisibleToRole(role, cases, userCtx);
  }, [role, cases, userCtx]);

  const filteredCases = useMemo(() => {
    return filterItemsByView({
      submissions: roleFilteredCases,
      view: view,
      role,
      userCtx,
      skipRoleVisibilityFilter: true,
    });
  }, [roleFilteredCases, view, role, userCtx]);

  const editorialCoverByCaseId = useMemo(
    () => editorialCoverUrlByCaseId(filteredCases),
    [filteredCases],
  );

  const viewConfig = useMemo(() => {
    if (!role) return null;
    return getDashboardViewConfig({ view, role, labels });
  }, [view, role, labels]);

  const managingEditorOps = useMemo(() => {
    if (!managingEditorDesk || !viewConfig?.showRunSheet) return null;
    return managingEditorOpsFromCases(roleFilteredCases, labels);
  }, [managingEditorDesk, roleFilteredCases, viewConfig?.showRunSheet, labels]);

  const execOverview = useMemo(() => {
    if (!role) return null;
    return executiveOverviewFromCases(roleFilteredCases);
  }, [role, roleFilteredCases]);

  const selectedCase = useMemo(() => {
    if (!selectedId) return null;
    return cases.find((x) => x.id === selectedId) ?? null;
  }, [selectedId, cases]);

  const allowedStatusTargets = useMemo((): CaseStatus[] => {
    if (!selectedCase || !role || !userCtx) return [];
    return allowedCaseStatusTargets(role, selectedCase.status, selectedCase, userCtx);
  }, [selectedCase, role, userCtx]);

  useEffect(() => {
    if (!selectedCase || !role || !userCtx) {
      setWorkflowStatusDraft(null);
      return;
    }
    const allowed = allowedStatusTargets;
    if (allowed.length === 0) {
      setWorkflowStatusDraft(null);
      return;
    }
    setWorkflowStatusDraft(allowed.includes(selectedCase.status) ? selectedCase.status : allowed[0]!);
  }, [selectedCase, role, userCtx, allowedStatusTargets]);

  useEffect(() => {
    if (!caseDataEnabled) {
      setError(null);
      setCases([]);
      setCaseQueueRows([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "submissions"),
      (snap) => {
        setError(null);
        if (snap.size === 0) {
          setCases([]);
          setCaseQueueRows([]);
          return;
        }
        const next = snap.docs.map((d) => normalizeSubmissionToCase(d.id, d.data()));
        setCases(next);
        if (role && userCtx) {
          const visible = filterCasesVisibleToRole(role, next, userCtx);
          setCaseQueueRows(visible.map(toCaseQueueSnapshot));
        } else {
          setCaseQueueRows([]);
        }
      },
      (err) => {
        setError(err.message || "We couldn’t refresh cases. Try again shortly.");
        setCases([]);
        setCaseQueueRows([]);
      },
    );

    return () => {
      unsubscribe();
      setCaseQueueRows([]);
    };
  }, [caseDataEnabled, setCaseQueueRows, role, userCtx]);

  useEffect(() => {
    if (filteredCases.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((cur) => {
      if (cur && filteredCases.some((c) => c.id === cur)) return cur;
      return filteredCases[0].id;
    });
  }, [filteredCases]);

  useEffect(() => {
    if (selectedId === prevSelectedId.current) return;
    prevSelectedId.current = selectedId;
    setActionError(null);
    setDecryptError(null);
    setDecryptDebug(null);
    setScaffoldMessage(null);
    setDeleteConfirmOpen(false);
    setDeleteError(null);
    setExportDocxError(null);
    if (selectedId === null) {
      setNoteDraft("");
      return;
    }
    const c = cases.find((x) => x.id === selectedId);
    setNoteDraft(c?.internalNote ?? "");
  }, [selectedId, cases]);

  useEffect(() => {
    setWorkflowError(null);
  }, [selectedId]);

  useEffect(() => {
    const canAssign = role !== null && mayAssignInUi(role);
    if (!assignPanelOpen || !canAssign || !sessionReady) return;
    let cancelled = false;
    async function loadMembers() {
      setMembersLoading(true);
      setMembersError(null);
      try {
        const user = getFirebaseAuth().currentUser;
        if (!user) {
          setMembersError("Please sign in again.");
          return;
        }
        const token = await user.getIdToken(true);
        const res = await fetch("/api/workspace/users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        let body: unknown;
        try {
          body = text.length > 0 ? JSON.parse(text) : null;
        } catch {
          setMembersError("Could not read member list.");
          return;
        }
        if (!res.ok) {
          const msg =
            typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof (body as { error: unknown }).error === "string"
              ? (body as { error: string }).error
              : "Failed to load workspace members.";
          setMembersError(msg);
          return;
        }
        if (cancelled) return;
        const raw = (body as { members?: unknown }).members;
        const list = Array.isArray(raw) ? (raw as WorkspaceMemberRow[]) : [];
        setWorkspaceMembers(list);
      } catch {
        if (!cancelled) setMembersError("Network error while loading members.");
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    }
    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [assignPanelOpen, role, sessionReady]);

  useEffect(() => {
    if (!assignPanelOpen || !selectedId) return;
    const c = cases.find((x) => x.id === selectedId);
    setAssigneeUidDraft(c?.assignedOwnerId?.trim() ?? "");
  }, [assignPanelOpen, selectedId, cases]);

  useEffect(() => {
    const ids = new Set(cases.map((c) => c.id));
    setFilingByCaseId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [cases]);

  useEffect(() => {
    if (role === "readonly" || role === "intake") {
      setFilingByCaseId({});
    }
  }, [role]);

  useEffect(() => {
    if (!caseDataEnabled || !role || !userCtx) return;
    if (role === "intake") return;

    let cancelled = false;

    void (async () => {
      const eligible = cases.filter(
        (c) => !!c.encryptedPayload?.trim() && mayShowDecryptUi(role, c, userCtx),
      );
      const ordered = [...eligible].sort((a, b) => {
        if (selectedId && a.id === selectedId) return -1;
        if (selectedId && b.id === selectedId) return 1;
        return 0;
      });

      for (const c of ordered) {
        if (cancelled) return;
        const payload = c.encryptedPayload!.trim();
        const fp = payloadFingerprint(payload);
        if (filingByCaseIdRef.current[c.id]?.fp === fp) continue;

        try {
          const res = await fetchWithAuth(`/api/admin/submissions/${encodeURIComponent(c.id)}/decrypt`, {
            method: "GET",
          });
          const text = await res.text();
          let body: unknown;
          try {
            body = text.length > 0 ? JSON.parse(text) : null;
          } catch {
            if (c.id === selectedId) {
              setDecryptError("We couldn’t read the response from the server.");
              setDecryptDebug(null);
            }
            continue;
          }
          if (!res.ok) {
            const debug =
              typeof body === "object" && body !== null && "debug" in body
                ? (body as { debug?: unknown }).debug
                : null;
            const serverError =
              typeof body === "object" &&
              body !== null &&
              "error" in body &&
              typeof (body as { error: unknown }).error === "string"
                ? ((body as { error: string }).error).trim()
                : null;
            const msg =
              (res.status === 503 || res.status === 400) && serverError
                ? serverError
                : res.status === 401
                ? "You’re signed in, but this filing request was rejected."
                : res.status === 403
                  ? "You do not have permission to view this filing content."
                  : res.status === 404
                    ? "This submission is no longer available."
                    : res.status === 500
                      ? "We couldn’t open this filing. Try again shortly."
                      : "Something went wrong.";
            if (c.id === selectedId) {
              setDecryptError(msg);
              setDecryptDebug(debug);
            }
            continue;
          }
          if (cancelled) return;
          const readout = extractDecryptedFiling(body);
          setFilingByCaseId((prev) => ({ ...prev, [c.id]: { ...readout, fp } }));
          if (c.id === selectedId) {
            setDecryptError(null);
            setDecryptDebug(null);
          }
        } catch {
          if (c.id === selectedId) {
            setDecryptError("We couldn’t load the filing. Check your connection and try again.");
            setDecryptDebug(null);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cases, caseDataEnabled, fetchWithAuth, role, userCtx, selectedId]);

  async function updateCaseWorkflowStatus(next: CaseStatus) {
    if (!selectedId || !role || !userCtx) return;
    setWorkflowBusy(true);
    setWorkflowError(null);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) {
        setWorkflowError("Please sign in again.");
        return;
      }
      const token = await user.getIdToken(true);
      const res = await fetch(
        `/api/admin/submissions/${encodeURIComponent(selectedId)}/workflow-status`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ caseStatus: next }),
        },
      );
      const text = await res.text();
      let body: unknown;
      try {
        body = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        setWorkflowError("The server returned an unreadable response.");
        return;
      }
      if (!res.ok) {
        const msg =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : "Status update failed.";
        setWorkflowError(msg);
        return;
      }
    } catch {
      setWorkflowError("Network error while updating status.");
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function deleteSubmissionPermanently() {
    if (!selectedId || !role || !canDeleteItem(role)) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const id = selectedId;
    const prevIndex = filteredCases.findIndex((c) => c.id === id);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) {
        setDeleteError("Please sign in again.");
        return;
      }
      const token = await user.getIdToken(true);
      const res = await fetch(`/api/admin/submissions/${encodeURIComponent(id)}/delete`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      let body: unknown;
      try {
        body = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        setDeleteError("The server returned an unreadable response.");
        return;
      }
      if (!res.ok) {
        const msg =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : res.status === 403
              ? "You don’t have permission to delete this report."
              : res.status === 404
                ? "This submission was not found. It may have already been removed."
                : "Delete failed. Try again.";
        setDeleteError(msg);
        return;
      }
      const nextCases = cases.filter((c) => c.id !== id);
      setCases(nextCases);
      const nextVisible = role && userCtx ? filterCasesVisibleToRole(role, nextCases, userCtx) : [];
      if (role && userCtx) {
        setCaseQueueRows(nextVisible.map(toCaseQueueSnapshot));
      } else {
        setCaseQueueRows([]);
      }
      const nextFiltered = filterItemsByView({
        submissions: nextVisible,
        view,
        role,
        userCtx,
        skipRoleVisibilityFilter: true,
      });
      const nextId =
        nextFiltered.length === 0
          ? null
          : nextFiltered[Math.min(Math.max(prevIndex, 0), nextFiltered.length - 1)]?.id ?? null;
      setSelectedId(nextFiltered.length ? nextId : null);
      setDeleteConfirmOpen(false);
      setFilingByCaseId((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDecryptError(null);
      setNoteDraft("");
    } catch {
      setDeleteError("Network error while deleting.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function exportSelectedDocx() {
    if (!selectedId || !selected || !role || !userCtx) return;
    if (!mayExportSubmissionDocx({ role, workspaceCase: selected, ctx: userCtx })) return;
    setExportDocxBusy(true);
    setExportDocxError(null);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) {
        setExportDocxError("Please sign in again.");
        return;
      }
      const result = await fetchSubmissionDocxDownload({
        submissionId: selected.id,
        getIdToken: (forceRefresh) => user.getIdToken(!!forceRefresh),
      });
      if (!result.ok) {
        setExportDocxError(result.error);
        return;
      }
      triggerBrowserDownload(result.blob, result.filename);
    } catch {
      setExportDocxError("Network error while exporting.");
    } finally {
      setExportDocxBusy(false);
    }
  }

  async function exportSelectedToOneDrive() {
    if (!selectedId || !selected || !role || !userCtx) return;
    if (!mayExportSubmissionDocx({ role, workspaceCase: selected, ctx: userCtx })) return;
    setExportOneDriveBusy(true);
    setExportOneDriveError(null);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) {
        setExportOneDriveError("Please sign in again.");
        return;
      }
      const result = await exportSubmissionToOneDrive({
        submissionId: selected.id,
        getIdToken: (forceRefresh) => user.getIdToken(!!forceRefresh),
      });
      if (!result.ok) {
        setExportOneDriveError(result.error);
        return;
      }
    } catch {
      setExportOneDriveError("Network error while uploading to OneDrive.");
    } finally {
      setExportOneDriveBusy(false);
    }
  }

  async function confirmAssignOwner() {
    if (!selected || !assigneeUidDraft.trim() || !role || !mayAssignInUi(role)) return;
    setAssignBusy(true);
    setAssignError(null);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) {
        setAssignError("Please sign in again.");
        return;
      }
      const token = await user.getIdToken(true);
      const res = await fetch(
        `/api/admin/submissions/${encodeURIComponent(selected.id)}/assign-owner`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ assigneeUid: assigneeUidDraft.trim() }),
        },
      );
      const text = await res.text();
      let body: unknown;
      try {
        body = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        setAssignError("The server returned an unreadable response.");
        return;
      }
      if (!res.ok) {
        const msg =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : "Assignment failed.";
        setAssignError(msg);
        return;
      }
      setAssignPanelOpen(false);
    } catch {
      setAssignError("Network error while assigning.");
    } finally {
      setAssignBusy(false);
    }
  }

  async function runAction(action: SubmissionAuditAction, reviewerNote?: string) {
    if (!caseDataEnabled || authState.status !== "signedInWorkspace" || !role || !userCtx) return;
    if (!selectedId) return;
    const sel = cases.find((x) => x.id === selectedId);
    if (!sel) return;
    if (action !== "save_reviewer_note") return;
    if (role === "reviewer" && !isCaseAssignedToWorkspaceUser(sel, userCtx)) {
      return;
    }
    setActionError(null);
    setActionPending(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) {
        setActionError("Please sign in again.");
        return;
      }
      const token = await user.getIdToken(true);
      const body: { action: string; reviewerNote?: string } = { action };
      if (action === "save_reviewer_note") body.reviewerNote = reviewerNote ?? "";
      const res = await fetch(`/api/admin/submissions/${encodeURIComponent(selectedId)}/reviewer-action`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let message = "Something went wrong. Please try again.";
        try {
          const data: unknown = await res.json();
          if (
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
          ) {
            message = (data as { error: string }).error;
          }
        } catch {
          /* ignore */
        }
        setActionError(message);
        return;
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setActionPending(false);
    }
  }

  if (!sessionReady) {
    return (
      <div className="card">
        <p className="subtext">Cases will load once your session is ready.</p>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="card">
        <p className="subtext">Your workspace role could not be loaded.</p>
      </div>
    );
  }

  if (role === "readonly" && view !== "analytics") {
    return (
      <div className="card" style={{ padding: "32px 24px" }}>
        <div className="row-between">
          <div className="spinner" />
          <span className="muted" style={{ fontSize: 14 }}>
            Opening analytics…
          </span>
        </div>
      </div>
    );
  }

  if (view === "analytics" && role !== "readonly") {
    return (
      <div className="card">
        <p className="subtext">Redirecting to your workspace…</p>
      </div>
    );
  }

  if (role === "readonly" && view === "analytics") {
    return (
      <div className="card stack-16">
        <div>
          <div className="header-title">Workspace analytics</div>
          <p className="subtext" style={{ marginTop: 8 }}>
            Read-only access: summary metrics only. Case lists, full reporter filings, and write actions
            are hidden for this role.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 14,
          }}
        >
          {[
            { label: "Reports (30d)", value: "—", hint: "Connect your warehouse or BigQuery export." },
            { label: "Median time to triage", value: "—", hint: "Requires case timestamps in reporting." },
            { label: "Cases resolved", value: "—", hint: "Uses resolved status from submissions." },
            { label: "Active reviewers", value: "—", hint: "Pull from directory when roster sync ships." },
          ].map((m) => (
            <div
              key={m.label}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
                background: "color-mix(in oklab, var(--surface) 90%, var(--bg))",
              }}
            >
              <div className="small-muted">{m.label}</div>
              <div className="page-intro-title" style={{ fontSize: 22, marginTop: 8 }}>
                {m.value}
              </div>
              <p className="small-muted" style={{ margin: "10px 0 0" }}>
                {m.hint}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="page-intro-title" style={{ fontSize: 18 }}>
          Something went wrong
        </div>
        <p className="subtext" style={{ marginTop: 8 }}>
          {error}
        </p>
      </div>
    );
  }

  const selected = selectedId ? cases.find((c) => c.id === selectedId) ?? null : null;

  if (view === "team") {
    if (!mayAccessTeamInUi(role)) {
      return (
        <div className="card stack-16">
          <div className="header-title">{labels.teamPageTitle}</div>
          <p className="subtext" style={{ marginTop: 8 }}>{labels.teamRosterLimitedBody}</p>
        </div>
      );
    }
    const email =
      authState.status === "signedInWorkspace" ||
      authState.status === "signedInNoRole" ||
      authState.status === "signedInButUnauthorized"
        ? authState.user.email ?? "You"
        : "You";
    const name =
      authState.status === "signedInWorkspace" ||
      authState.status === "signedInNoRole" ||
      authState.status === "signedInButUnauthorized"
        ? authState.user.displayName || email.split("@")[0]
        : "Team member";
    const roleLine =
      authState.status === "signedInWorkspace" ? ROLE_LABEL[authState.role] : "Not signed in";

    return (
      <div className="card stack-16">
        <div>
          <div className="header-title">{labels.teamPageTitle}</div>
          <p className="subtext" style={{ marginTop: 8 }}>{labels.teamPageIntro}</p>
        </div>

        <div className="detail-section-title">You</div>
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "color-mix(in oklab, var(--surface) 90%, var(--bg))",
          }}
        >
          <div className="strong">{name}</div>
          <div className="small-muted" style={{ marginTop: 4 }}>
            {email}
          </div>
          <div className="small-muted" style={{ marginTop: 6 }}>
            {roleLine}
          </div>
        </div>

        <div className="detail-section-title">Colleagues (preview)</div>
        <ul className="subtext" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>
            <span className="strong">Amina</span> — Field coordinator ·{" "}
            <span className="small-muted">Case count: —</span>
          </li>
          <li>
            <span className="strong">James</span> — Legal liaison ·{" "}
            <span className="small-muted">Case count: —</span>
          </li>
          <li>
            <span className="strong">Verification Desk</span> — Shared queue ·{" "}
            <span className="small-muted">Case count: —</span>
          </li>
        </ul>

        <p className="small-muted" style={{ margin: 0 }}>
          Counts will reflect live assignments once owner fields are stored on each case. Member
          management and invitations are not available in this release.
        </p>
      </div>
    );
  }

  const showDecrypt =
    selected && userCtx && role ? mayShowDecryptUi(role, selected, userCtx) : false;
  const selectedCaseFiling = selected ? filingByCaseId[selected.id] : undefined;
  const decryptPanelLoading =
    showDecrypt &&
    !!selected?.encryptedPayload?.trim() &&
    !selectedCaseFiling &&
    !decryptError;
  const showAssign = canAssignItem(role);
  const showDelete = canDeleteItem(role);
  const showExportDocx =
    !!selected &&
    !!role &&
    !!userCtx &&
    mayExportSubmissionDocx({ role, workspaceCase: selected, ctx: userCtx });
  const showExportOneDrive = showExportDocx;
  const stageLabel =
    editorDesk || managingEditorDesk ? labels.stageColumnTitleDesk : labels.stageColumnTitleDefault;
  const leadLabel =
    editorDesk || managingEditorDesk ? labels.leadColumnTitleDesk : labels.leadColumnTitleDefault;
  const priorityLabel = editorDesk || managingEditorDesk ? "Attention" : "Priority";

  const showStatusPicker =
    selected && userCtx && role ? mayChangeCaseStatusInUi(role, selected, userCtx) : false;
  const showPriorityScaffold =
    selected && userCtx && role ? mayChangePriorityScaffoldInUi(role, selected, userCtx) : false;
  const showResolveArchive =
    selected && userCtx && role ? mayResolveOrArchiveInUi(role, selected, userCtx) : false;
  const notesEnabled = mayEditInternalNotesInUi(role);

  const caseWorkspaceClass = [
    "case-workspace",
    editorDesk ? "case-workspace--editor-desk" : "",
    managingEditorDesk ? "case-workspace--managing-editor-desk" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      {managingEditorDesk ? (
        <>
          <section className="me-desk-hero" aria-labelledby="me-desk-headline">
            <div className="me-desk-hero-grid">
              <div className="me-desk-hero-main">
                <div className="me-desk-hero-intro">
                  <p className="me-desk-kicker">{labels.managingEditorDesk}</p>
                  <h1 id="me-desk-headline" className="me-desk-title">
                    {labels.newsroomOperations}
                  </h1>
                  <p className="me-desk-subtitle">{labels.managingEditorDeskSubline}</p>
                </div>
                {managingEditorOps && viewConfig?.showRunSheet ? (
                  <div className="me-desk-kpis" aria-label="Room pulse">
                    <Link className="me-desk-kpi me-desk-kpi--active" href="/dashboard">
                      <span className="me-desk-kpi-icon">
                        <MeDeskKpiIcon kind="active" />
                      </span>
                      <span className="me-desk-kpi-body">
                        <span className="me-desk-kpi-value">{managingEditorOps.activeTotal}</span>
                        <span className="me-desk-kpi-label">{labels.activeReports}</span>
                      </span>
                    </Link>
                    <Link className="me-desk-kpi me-desk-kpi--lead" href={needsTriageHref}>
                      <span className="me-desk-kpi-icon">
                        <MeDeskKpiIcon kind="lead" />
                      </span>
                      <span className="me-desk-kpi-body">
                        <span className="me-desk-kpi-value">{managingEditorOps.unassignedCount}</span>
                        <span className="me-desk-kpi-label">{labels.needsALead}</span>
                      </span>
                    </Link>
                    <Link className="me-desk-kpi me-desk-kpi--review" href="/dashboard?view=in_review">
                      <span className="me-desk-kpi-icon">
                        <MeDeskKpiIcon kind="review" />
                      </span>
                      <span className="me-desk-kpi-body">
                        <span className="me-desk-kpi-value">{managingEditorOps.inReviewCount}</span>
                        <span className="me-desk-kpi-label">{labels.inReview}</span>
                      </span>
                    </Link>
                    <Link className="me-desk-kpi me-desk-kpi--resolved" href="/dashboard?view=resolved">
                      <span className="me-desk-kpi-icon">
                        <MeDeskKpiIcon kind="resolved" />
                      </span>
                      <span className="me-desk-kpi-body">
                        <span className="me-desk-kpi-value">{managingEditorOps.resolvedTodayCount}</span>
                        <span className="me-desk-kpi-label">{labels.resolvedToday}</span>
                      </span>
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {execOverview ? (
        <section className="exec-overview" aria-label="Executive overview">
          <div className="exec-overview-header">
            <div>
              <div className="exec-overview-kicker">{labels.workspaceName}</div>
              <div className="exec-overview-title">{branding.welcomeText}</div>
            </div>
          </div>
          <div className="exec-overview-grid">
            <Link href="/dashboard?view=new" className="exec-kpi exec-kpi--new">
              <div className="exec-kpi-label">New Today</div>
              <div className="exec-kpi-value">{execOverview.newToday}</div>
              <div className="exec-kpi-hint">Filed since midnight (local)</div>
            </Link>
            <Link href="/dashboard?view=needs_triage" className="exec-kpi exec-kpi--awaiting">
              <div className="exec-kpi-label">Awaiting Review</div>
              <div className="exec-kpi-value">{execOverview.awaitingReview}</div>
              <div className="exec-kpi-hint">{labels.caseStatusLabels.needs_triage}</div>
            </Link>
            <Link href="/dashboard?view=in_review" className="exec-kpi exec-kpi--review">
              <div className="exec-kpi-label">In Review</div>
              <div className="exec-kpi-value">{execOverview.inReview}</div>
              <div className="exec-kpi-hint">{labels.caseStatusLabels.in_review}</div>
            </Link>
            <Link href="/dashboard?view=resolved" className="exec-kpi exec-kpi--resolved">
              <div className="exec-kpi-label">Resolved</div>
              <div className="exec-kpi-value">{execOverview.resolved}</div>
              <div className="exec-kpi-hint">{labels.caseStatusLabels.resolved}</div>
            </Link>
            <div className="exec-kpi exec-kpi--avg" role="group" aria-label="Average response time">
              <div className="exec-kpi-label">Average Response Time</div>
              <div className="exec-kpi-value">{execOverview.avgResponseLabel}</div>
              <div className="exec-kpi-hint">{execOverview.avgResponseHint}</div>
            </div>
          </div>
        </section>
      ) : null}

      <div className={caseWorkspaceClass}>
      <div className="case-board">
        {cases.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">
              {editorDesk
                ? labels.emptyNoCasesTitleEditor
                : managingEditorDesk
                  ? labels.emptyNoCasesTitleManagingEditor
                  : labels.emptyNoCasesTitleDefault}
            </p>
            <p className="subtext" style={{ margin: 0 }}>
              {editorDesk
                ? labels.emptyNoCasesBodyEditor
                : managingEditorDesk
                  ? labels.emptyNoCasesBodyManagingEditor
                  : labels.emptyNoCasesBodyDefault}
            </p>
          </div>
        ) : roleFilteredCases.length === 0 && role === "reviewer" ? (
          <div className="empty-state">
            <p className="empty-state-title">{labels.emptyReviewerNothingAssignedTitle}</p>
            <p className="subtext" style={{ margin: 0 }}>{labels.emptyReviewerNothingAssignedBody}</p>
          </div>
        ) : roleFilteredCases.length === 0 && role === "intake" ? (
          <div className="empty-state">
            <p className="empty-state-title">{labels.intakeEmptyTitle}</p>
            <p className="subtext" style={{ margin: 0 }}>
              {labels.intakeEmptyBeforeStates}
              <span className="strong">{labels.intakeEmptyStateNewLabel}</span>
              {labels.intakeEmptyOrWord}
              <span className="strong">{labels.intakeEmptyStateTriageLabel}</span>
              {labels.intakeEmptyAfterStates}
            </p>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">{viewConfig?.emptyTitle ?? "Nothing in this view"}</p>
            <p className="subtext" style={{ margin: 0 }}>
              {viewConfig?.emptyBody ??
                "Try another tab on the left, or check back as cases move through the workflow."}
            </p>
          </div>
        ) : (
          <div className="report-grid">
            {filteredCases.map((c) => (
              <ItemCard
                key={c.id}
                submission={c}
                decryptedFiling={filingByCaseId[c.id]}
                selected={c.id === selectedId}
                editorDesk={editorDesk}
                managingEditorDesk={managingEditorDesk}
                coverImageUrl={editorialCoverByCaseId.get(c.id)}
                onSelect={() => setSelectedId(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      <ItemDetailPanel
        selected={selected}
        selectedCaseFiling={selectedCaseFiling}
        role={role}
        editorDesk={editorDesk}
        managingEditorDesk={managingEditorDesk}
        scaffoldMessage={scaffoldMessage}
        setScaffoldMessage={setScaffoldMessage}
        showDecrypt={showDecrypt}
        decryptError={decryptError}
        decryptDebug={decryptDebug}
        decryptPanelLoading={decryptPanelLoading}
        stageLabel={stageLabel}
        leadLabel={leadLabel}
        priorityLabel={priorityLabel}
        notesEnabled={notesEnabled}
        noteDraft={noteDraft}
        setNoteDraft={setNoteDraft}
        actionPending={actionPending}
        actionError={actionError}
        onSaveNote={() => runAction("save_reviewer_note", noteDraft)}
        showAssign={showAssign}
        assignPanelOpen={assignPanelOpen}
        setAssignPanelOpen={setAssignPanelOpen}
        membersLoading={membersLoading}
        membersError={membersError}
        workspaceMembers={workspaceMembers}
        assigneeUidDraft={assigneeUidDraft}
        setAssigneeUidDraft={setAssigneeUidDraft}
        assignBusy={assignBusy}
        assignError={assignError}
        onConfirmAssignOwner={() => void confirmAssignOwner()}
        showPriorityScaffold={showPriorityScaffold}
        showResolveArchive={showResolveArchive}
        onResolve={() => void updateCaseWorkflowStatus("resolved")}
        onArchive={() => void updateCaseWorkflowStatus("archived")}
        showDelete={showDelete}
        deleteConfirmOpen={deleteConfirmOpen}
        setDeleteConfirmOpen={setDeleteConfirmPanelOpen}
        deleteBusy={deleteBusy}
        deleteError={deleteError}
        onDeletePermanently={() => void deleteSubmissionPermanently()}
        showExportDocx={showExportDocx}
        exportDocxBusy={exportDocxBusy}
        exportDocxError={exportDocxError}
        onExportDocx={() => void exportSelectedDocx()}
        showExportOneDrive={showExportOneDrive}
        exportOneDriveBusy={exportOneDriveBusy}
        exportOneDriveError={exportOneDriveError}
        onExportOneDrive={() => void exportSelectedToOneDrive()}
        showStatusPicker={showStatusPicker}
        allowedStatusTargets={allowedStatusTargets}
        workflowStatusDraft={workflowStatusDraft}
        setWorkflowStatusDraft={(v) => setWorkflowStatusDraft(v)}
        workflowBusy={workflowBusy}
        workflowError={workflowError}
        onApplyWorkflowStatus={() => {
          if (!workflowStatusDraft) return;
          void updateCaseWorkflowStatus(workflowStatusDraft);
        }}
      />
    </div>

      {managingEditorDesk && managingEditorOps && viewConfig?.showRunSheet ? (
        <section
          className="ops-run-sheet ops-run-sheet--me-tier ops-run-sheet--me-tier-after-cards"
          aria-label={labels.runSheetAriaLabel}
        >
          <div className="ops-run-sheet-header">
            <div className="ops-run-sheet-kicker">{labels.runSheet}</div>
            <p className="ops-run-sheet-lede">{labels.runSheetIntroLede}</p>
          </div>
          {viewConfig?.showKpis ? (
            <div className="ops-run-sheet-stats">
              <Link href="/dashboard" className="ops-stat ops-stat--link ops-stat--me ops-stat--me-pulse">
                <div className="ops-stat-value">{managingEditorOps.pipelineTotal}</div>
                <div className="ops-stat-label">{labels.mePipelineInMotionLabel}</div>
                <div className="ops-stat-hint">{labels.mePipelineInMotionHint}</div>
              </Link>
              <div className="ops-stat ops-stat--me ops-stat--me-books">
                <div className="ops-stat-value">{managingEditorOps.activeTotal}</div>
                <div className="ops-stat-label">{labels.onTheBooks}</div>
                <div className="ops-stat-hint">{labels.meOnTheBooksHint}</div>
              </div>
              {managingEditorOps.resolvedStillOpen > 0 ? (
                <Link
                  href="/dashboard?view=resolved"
                  className="ops-stat ops-stat--link ops-stat--me ops-stat--me-resolved-open"
                >
                  <div className="ops-stat-value">{managingEditorOps.resolvedStillOpen}</div>
                  <div className="ops-stat-label">{labels.meResolvedStillOpenLabel}</div>
                  <div className="ops-stat-hint">{labels.meResolvedStillOpenHint}</div>
                </Link>
              ) : null}
            </div>
          ) : null}

          {viewConfig?.showWhereItStacks ? (
            managingEditorOps.bottlenecks.length > 0 ? (
              <div className="ops-run-sheet-block">
                <div className="ops-run-sheet-block-title">{labels.meWhereItStacksTitle}</div>
                <div className="ops-bottleneck-row">
                  {managingEditorOps.bottlenecks.map(({ status, count }) => (
                    <Link
                      key={status}
                              href={meDeskHrefForStage(status, labels)}
                      className={`ops-bottleneck-chip ops-bottleneck-chip--${status}`}
                    >
                      <span>{labels.caseStatusLabels[status]}</span>
                      <span className="ops-bottleneck-count">{count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : managingEditorOps.pipelineTotal > 0 ? (
              <p className="ops-run-sheet-muted">{labels.meBottleneckBalancedCopy}</p>
            ) : null
          ) : null}
        </section>
      ) : null}

      {managingEditorDesk && managingEditorOps && viewConfig?.showRunSheet && viewConfig?.showUnclaimed ? (
        managingEditorOps.unassignedCount > 0 ? (
          <section className="me-unclaimed-deck" aria-label={labels.unclaimedPickTheseUpFirst}>
            <div className="me-unclaimed-deck__inner">
              <div className="ops-run-sheet-block me-unclaimed-deck__block">
                <div className="ops-run-sheet-block-title">{labels.unclaimedPickTheseUpFirst}</div>
                <ul className="ops-unassigned-list">
                  {managingEditorOps.unassignedPreview.map((c) => (
                    <li key={c.id}>
                      <div
                        className="ops-unclaimed-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(c.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(c.id);
                          }
                        }}
                      >
                        {(() => {
                          const display = getSubmissionDisplay({
                            submission: c,
                            decryptedFiling: filingByCaseId[c.id],
                          });
                          return (
                            <>
                              <div className="ops-unclaimed-top">
                                <span className={`${statusBadgeClass(c.status)} badge--compact`}>
                                  {statusChipLabel(c.status, labels)}
                                </span>
                                <span className="ops-unclaimed-time">{relativeTimeShort(c.createdAt)}</span>
                              </div>

                              <div className="ops-unclaimed-title" dir="auto">
                                {display.displayTitle}
                              </div>

                              <div className="ops-unclaimed-bottom">
                                <div className="ops-unclaimed-meta">
                                  <div className="ops-unclaimed-ref">Ref: {c.referenceCode}</div>
                                  <div className="ops-unclaimed-owner">{labels.noLeadYet}</div>
                                </div>
                                <div className="ops-unclaimed-actions">
                                  <button
                                    type="button"
                                    className="btn btn-small ops-unclaimed-open"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedId(c.id);
                                    }}
                                  >
                                    {labels.actionLabels?.open ?? labels.cardOpenLabel ?? "Open"}
                                  </button>
                                  {showAssign ? (
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedId(c.id);
                                        setAssignPanelOpen(true);
                                      }}
                                    >
                                      {labels.actionLabels?.assign ?? labels.cardAssignLabel ?? "Assign"}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </li>
                  ))}
                </ul>
                {managingEditorOps.unassignedCount > managingEditorOps.unassignedPreview.length ? (
                  <p className="ops-run-sheet-muted">
                    +{managingEditorOps.unassignedCount - managingEditorOps.unassignedPreview.length}
                    {labels.meUnclaimedOverflowSuffix}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : managingEditorOps.pipelineTotal > 0 ? (
          <section className="me-unclaimed-deck" aria-label={labels.meAssignmentStatusAriaLabel}>
            <div className="me-unclaimed-deck__inner">
              <p className="ops-run-sheet-muted me-unclaimed-deck__solo">{labels.meAllClaimedMessage}</p>
            </div>
          </section>
        ) : null
      ) : null}
    </>
  );
}
