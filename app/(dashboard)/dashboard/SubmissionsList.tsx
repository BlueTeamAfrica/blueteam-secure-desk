"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extractDecryptedFiling,
  payloadFingerprint,
  type CachedCaseFiling,
} from "@/app/_lib/decryptedSubmissionReadout";
import { editorialCoverUrlByCaseId } from "@/app/_lib/assignEditorialCoverUrls";
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
  normalizeSubmissionToCase,
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

/** Returns a small SVG icon element for a given stage/stat key. Pure presentation. */
function StatIcon({ stage }: { stage: string }) {
  const props = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (stage) {
    case "total":
      return <svg {...props}><rect x="1.5" y="1.5" width="6" height="6" rx="1.5"/><rect x="10.5" y="1.5" width="6" height="6" rx="1.5"/><rect x="1.5" y="10.5" width="6" height="6" rx="1.5"/><rect x="10.5" y="10.5" width="6" height="6" rx="1.5"/></svg>;
    case "incoming":
      return <svg {...props}><path d="M10 1.5H4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6.5z"/><path d="M10 1.5v5h5"/></svg>;
    case "raw":
      return <svg {...props}><path d="M2 3.5h14l-5.5 6.5V15l-3-1.5v-4z"/></svg>;
    case "first_edit":
      return <svg {...props}><circle cx="9" cy="6" r="3.5"/><path d="M2 17c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"/></svg>;
    case "second_edit":
      return <svg {...props}><path d="M1.5 9s3-5.5 7.5-5.5S16.5 9 16.5 9s-3 5.5-7.5 5.5S1.5 9 1.5 9z"/><circle cx="9" cy="9" r="2.5"/></svg>;
    case "in_review":
      return <svg {...props}><circle cx="9" cy="9" r="7.5"/><path d="M9 5v4l3 2"/></svg>;
    case "reviewed":
      return <svg {...props}><circle cx="9" cy="9" r="7.5"/><path d="M5.5 9l2.5 2.5 5-5"/></svg>;
    case "designed":
      return <svg {...props}><rect x="1.5" y="2.5" width="15" height="3.5" rx="1"/><path d="M3 6v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6"/><path d="M6.5 10h5"/></svg>;
    case "urgent":
      return <svg {...props}><path d="M10.5 1.5 3.5 10H9l-1.5 6.5L14.5 8H9.5z"/></svg>;
    default:
      return <svg {...props}><circle cx="9" cy="9" r="7.5"/><path d="M9 6v3.5l2 2"/></svg>;
  }
}

export type WorkspaceMemberRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
};

export function SubmissionsList({
  sessionReady,
  role,
}: {
  sessionReady: boolean;
  role: WorkspaceRole | null;
}) {
  const searchParams = useSearchParams();
  const { labels } = useDashboardBranding();
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
  const [refreshOneDriveBusy, setRefreshOneDriveBusy] = useState(false);
  const [refreshOneDriveError, setRefreshOneDriveError] = useState<string | null>(null);
  const [refreshOneDriveDone, setRefreshOneDriveDone] = useState(false);
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

  /** Per-stage counts across all role-visible cases — used in the stats strip. */
  const stageCounts = useMemo(() => {
    const counts: Partial<Record<CaseStatus, number>> = {};
    for (const c of roleFilteredCases) {
      counts[c.status] = (counts[c.status] ?? 0) + 1;
    }
    return counts;
  }, [roleFilteredCases]);

  /** Non-archived active case count — shown as "All" in the strip + topbar badge. */
  const totalActive = useMemo(
    () => roleFilteredCases.filter((c) => c.status !== "designed").length,
    [roleFilteredCases],
  );

  /** Critical or high-priority cases that aren't reviewed/designed. */
  const urgentCount = useMemo(
    () =>
      roleFilteredCases.filter(
        (c) =>
          (c.priority === "critical" || c.priority === "high") &&
          c.status !== "designed" &&
          c.status !== "reviewed",
      ).length,
    [roleFilteredCases],
  );

  /** Base path for the current tenant (e.g. "/dashboard" or "/sudanfacts"). */
  const deskBasePath = needsTriageHref.split("?")[0] ?? "/dashboard";

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

        // Trigger OneDrive upload for newly created submissions (→ incoming folder).
        // pushSubmissionToOneDrive is a no-op if the submission already has an
        // onedriveItemId, so this is safe to call on initial snapshot load as well.
        if (role === "owner" || role === "admin") {
          for (const change of snap.docChanges()) {
            if (change.type === "added") {
              void fetchWithAuth("/api/admin/onedrive/push-submission", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ submissionId: change.doc.id, force: false }),
              }).catch(() => {
                // Fire-and-forget — never block UI or surface errors for background sync
              });
            }
          }
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
  }, [caseDataEnabled, setCaseQueueRows, role, userCtx, fetchWithAuth]);

  useEffect(() => {
    if (filteredCases.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((cur) => {
      if (cur && filteredCases.some((c) => c.id === cur)) return cur;
      return null;
    });
  }, [filteredCases]);

  useEffect(() => {
    if (selectedId === prevSelectedId.current) return;
    prevSelectedId.current = selectedId;
    setActionError(null);
    setDecryptError(null);
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
            }
            continue;
          }
          if (!res.ok) {
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
            }
            continue;
          }
          if (cancelled) return;
          const readout = extractDecryptedFiling(body);
          setFilingByCaseId((prev) => ({ ...prev, [c.id]: { ...readout, fp } }));
          if (c.id === selectedId) {
            setDecryptError(null);
          }
        } catch {
          if (c.id === selectedId) {
            setDecryptError("We couldn’t load the filing. Check your connection and try again.");
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
      // Stage updated — check if OneDrive sync also succeeded.
      if (
        typeof body === "object" &&
        body !== null &&
        "onedrive" in body
      ) {
        const od = (body as { onedrive: { synced?: boolean; error?: string } }).onedrive;
        if (!od.synced && od.error) {
          setWorkflowError(`Stage updated, but OneDrive sync failed: ${od.error}`);
        }
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

  async function refreshSelectedOneDriveDocx() {
    if (!selectedId || !selected || !role || !userCtx) return;
    if (!mayExportSubmissionDocx({ role, workspaceCase: selected, ctx: userCtx })) return;
    setRefreshOneDriveBusy(true);
    setRefreshOneDriveError(null);
    setRefreshOneDriveDone(false);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) { setRefreshOneDriveError("Please sign in again."); return; }
      const token = await user.getIdToken(true);
      const res = await fetch(
        `/api/admin/submissions/${encodeURIComponent(selected.id)}/refresh-onedrive-docx`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRefreshOneDriveError(data?.error ?? "Refresh failed.");
        return;
      }
      setRefreshOneDriveDone(true);
    } catch {
      setRefreshOneDriveError("Network error during refresh.");
    } finally {
      setRefreshOneDriveBusy(false);
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
      {/* Compact stage-count strip — replaces the old hero + exec-overview blocks */}
      {managingEditorDesk ? (
        <nav className="desk-stats-strip" aria-label="Stage overview">
          {labels.workflow.stageOrder.map((status) => {
            const isActive = view === status;
            const href = `${deskBasePath}?view=${status}`;
            return (
              <Link
                key={status}
                href={href}
                className={`desk-stat-pill${isActive ? " is-active" : ""}`}
                data-stage={status}
              >
                <span className="desk-stat-icon" aria-hidden="true"><StatIcon stage={status} /></span>
                <span className="desk-stat-value">
                  {stageCounts[status as CaseStatus] ?? 0}
                </span>
                <span className="desk-stat-label">
                  {labels.caseStatusLabels[status as CaseStatus]}
                </span>
              </Link>
            );
          })}

          {/* Urgent KPI pill — display-only */}
          {urgentCount > 0 && (
            <span className="desk-stat-pill desk-stat-pill--urgent" data-stage="urgent" aria-label={`${urgentCount} urgent cases`}>
              <span className="desk-stat-icon" aria-hidden="true"><StatIcon stage="urgent" /></span>
              <span className="desk-stat-value">{urgentCount}</span>
              <span className="desk-stat-label">Urgent</span>
            </span>
          )}
        </nav>
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
            <p className="empty-state-title">{viewConfig?.emptyTitle ?? labels.viewEmptyDefaultTitle}</p>
            <p className="subtext" style={{ margin: 0 }}>
              {viewConfig?.emptyBody ?? labels.viewEmptyDefaultBody}
            </p>
          </div>
        ) : (
          <div className="case-accordion">
            {filteredCases.map((c) => {
              const isExpanded = c.id === selectedId;
              return (
                <div key={c.id} className={`card-row${isExpanded ? " card-row--expanded" : ""}`}>
                  <ItemCard
                    submission={c}
                    decryptedFiling={filingByCaseId[c.id]}
                    selected={isExpanded}
                    editorDesk={editorDesk}
                    managingEditorDesk={managingEditorDesk}
                    coverImageUrl={editorialCoverByCaseId.get(c.id)}
                    onSelect={() => setSelectedId(isExpanded ? null : c.id)}
                  />
                  {isExpanded && (
                    <div className="card-detail-expand">
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
                        onResolve={() => void updateCaseWorkflowStatus("reviewed")}
                        onArchive={() => void updateCaseWorkflowStatus("designed")}
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
                        showRefreshOneDrive={showExportOneDrive && !!selected?.onedriveItemId}
                        refreshOneDriveBusy={refreshOneDriveBusy}
                        refreshOneDriveError={refreshOneDriveError}
                        refreshOneDriveDone={refreshOneDriveDone}
                        onRefreshOneDrive={() => void refreshSelectedOneDriveDocx()}
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
                        isOpen={isExpanded}
                        onClose={() => setSelectedId(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

      {/* Run Sheet and Unclaimed sections removed — layout is cards + detail only */}
    </>
  );
}
