"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/_components/auth/AuthContext";
import { useCaseQueue } from "@/app/_components/dashboard/CaseQueueContext";
import { editorialCoverUrlByCaseId } from "@/app/_lib/assignEditorialCoverUrls";
import { fetchSubmissionDocxDownload, triggerBrowserDownload } from "@/app/_lib/downloadSubmissionDocx";
import { getFirebaseAuth } from "@/app/_lib/firebase/auth";
import { db } from "@/app/_lib/firebase/firestore";
import { collection, onSnapshot } from "firebase/firestore";
import {
  caseHasNoVisibleLead,
  normalizeSubmissionToCase,
  toCaseQueueSnapshot,
  type WorkspaceCase,
  type CaseStatus,
} from "@/app/_lib/caseWorkspaceModel";
import type { CachedCaseFiling } from "@/app/_lib/decryptedSubmissionReadout";
import { extractDecryptedFiling, payloadFingerprint } from "@/app/_lib/decryptedSubmissionReadout";
import {
  allowedCaseStatusTargets,
  filterCasesVisibleToRole,
  isCaseAssignedToWorkspaceUser,
  mayAssignInUi,
  mayChangeCaseStatusInUi,
  mayChangePriorityScaffoldInUi,
  mayEditInternalNotesInUi,
  mayResolveOrArchiveInUi,
  mayShowDecryptUi,
  type WorkspaceRole,
  type WorkspaceUserContext,
} from "@/app/_lib/rbac";
import { canAssignItem, canDeleteItem, mayExportSubmissionDocx } from "@/app/_lib/workflow/permissions";
import { getOrgLabels } from "@/app/_lib/org/getOrgLabels";
import { ItemCard } from "@/components/items/ItemCard";
import { ItemDetailPanel } from "@/components/items/ItemDetailPanel";

type WorkspaceMemberRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
};

export function MyQueueView() {
  const labels = getOrgLabels();
  const { state: authState } = useAuth();
  const { setRows: setCaseQueueRows } = useCaseQueue();

  const sessionReady = authState.status === "signedInWorkspace";
  const role: WorkspaceRole | null = sessionReady ? authState.role : null;
  const userCtx: WorkspaceUserContext | null = useMemo(() => {
    if (authState.status !== "signedInWorkspace") return null;
    const u = authState.user;
    return { uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null };
  }, [authState]);

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
  const setDeleteConfirmPanelOpen = useCallback((open: boolean) => {
    setDeleteConfirmOpen(open);
    if (open) setDeleteError(null);
  }, []);

  const prevSelectedId = useRef<string | null>(null);

  // Subscribe to submissions (same data source).
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
  }, [caseDataEnabled, role, userCtx, setCaseQueueRows]);

  // Personal queue: reviewer sees assigned-to-me via existing role filter; owner/admin get assigned-to-me.
  const visibleCases = useMemo(() => {
    if (!role || !userCtx) return [];
    const base = filterCasesVisibleToRole(role, cases, userCtx);
    if (role === "owner" || role === "admin") {
      return base.filter((c) => !caseHasNoVisibleLead(c) && isCaseAssignedToWorkspaceUser(c, userCtx));
    }
    return base;
  }, [role, userCtx, cases]);

  const editorialCoverByCaseId = useMemo(
    () => editorialCoverUrlByCaseId(visibleCases),
    [visibleCases],
  );

  useEffect(() => {
    if (visibleCases.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((cur) => {
      if (cur && visibleCases.some((c) => c.id === cur)) return cur;
      return visibleCases[0]!.id;
    });
  }, [visibleCases]);

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

  useEffect(() => setWorkflowError(null), [selectedId]);

  const selected = selectedId ? cases.find((c) => c.id === selectedId) ?? null : null;

  const showDecrypt = selected && userCtx && role ? mayShowDecryptUi(role, selected, userCtx) : false;
  const selectedCaseFiling = selected ? filingByCaseId[selected.id] : undefined;
  const decryptPanelLoading =
    showDecrypt && !!selected?.encryptedPayload?.trim() && !selectedCaseFiling && !decryptError;

  // Decrypt prefetch (trusted users see plain text automatically).
  useEffect(() => {
    if (!caseDataEnabled || !role || !userCtx) return;
    if (role === "intake") return;
    let cancelled = false;
    void (async () => {
      const user = getFirebaseAuth().currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const eligible = cases.filter((c) => !!c.encryptedPayload?.trim() && mayShowDecryptUi(role, c, userCtx));
      for (const c of eligible) {
        if (cancelled) return;
        const payload = c.encryptedPayload!.trim();
        const fp = payloadFingerprint(payload);
        if (filingByCaseIdRef.current[c.id]?.fp === fp) continue;
        try {
          const res = await fetch(`/api/admin/submissions/${encodeURIComponent(c.id)}/decrypt`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          });
          const text = await res.text();
          let body: unknown;
          try {
            body = text.length > 0 ? JSON.parse(text) : null;
          } catch {
            if (c.id === selectedId) setDecryptError("We couldn’t read the response from the server.");
            continue;
          }
          if (!res.ok) {
            if (c.id === selectedId) setDecryptError("We couldn’t open this filing. Try again shortly.");
            continue;
          }
          if (cancelled) return;
          const readout = extractDecryptedFiling(body);
          setFilingByCaseId((prev) => ({ ...prev, [c.id]: { ...readout, fp } }));
          if (c.id === selectedId) setDecryptError(null);
        } catch {
          if (c.id === selectedId) setDecryptError("We couldn’t load the filing. Check your connection and try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cases, caseDataEnabled, role, userCtx, selectedId]);

  // Workflow status picker defaults.
  const allowedStatusTargets = useMemo((): CaseStatus[] => {
    if (!selectedId || !role || !userCtx) return [];
    const c = cases.find((x) => x.id === selectedId);
    if (!c) return [];
    return allowedCaseStatusTargets(role, c.status, c, userCtx);
  }, [selectedId, cases, role, userCtx]);

  useEffect(() => {
    if (!selectedId || !role || !userCtx) {
      setWorkflowStatusDraft(null);
      return;
    }
    const c = cases.find((x) => x.id === selectedId);
    if (!c) {
      setWorkflowStatusDraft(null);
      return;
    }
    const allowed = allowedCaseStatusTargets(role, c.status, c, userCtx);
    if (allowed.length === 0) {
      setWorkflowStatusDraft(null);
      return;
    }
    setWorkflowStatusDraft(allowed.includes(c.status) ? c.status : allowed[0]!);
  }, [selectedId, cases, role, userCtx]);

  const showAssign = canAssignItem(role);
  const showDelete = canDeleteItem(role);
  const showExportDocx =
    !!selected &&
    !!role &&
    !!userCtx &&
    mayExportSubmissionDocx({ role, workspaceCase: selected, ctx: userCtx });
  const stageLabel = editorDesk || managingEditorDesk ? "Where it stands" : "Case status";
  const leadLabel = editorDesk || managingEditorDesk ? "Who has it" : "Owner";
  const priorityLabel = editorDesk || managingEditorDesk ? "Attention" : "Priority";
  const showStatusPicker = selected && userCtx && role ? mayChangeCaseStatusInUi(role, selected, userCtx) : false;
  const showPriorityScaffold =
    selected && userCtx && role ? mayChangePriorityScaffoldInUi(role, selected, userCtx) : false;
  const showResolveArchive = selected && userCtx && role ? mayResolveOrArchiveInUi(role, selected, userCtx) : false;
  const notesEnabled = role ? mayEditInternalNotesInUi(role) : false;

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
        const res = await fetch("/api/workspace/users", { headers: { Authorization: `Bearer ${token}` } });
        const text = await res.text();
        let body: unknown;
        try {
          body = text.length > 0 ? JSON.parse(text) : null;
        } catch {
          setMembersError("Could not read member list.");
          return;
        }
        if (!res.ok) {
          setMembersError("Failed to load workspace members.");
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
      const res = await fetch(`/api/admin/submissions/${encodeURIComponent(selectedId)}/workflow-status`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ caseStatus: next }),
      });
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
          typeof body === "object" && body !== null && "error" in body && typeof (body as { error: unknown }).error === "string"
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
      const res = await fetch(`/api/admin/submissions/${encodeURIComponent(selected.id)}/assign-owner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeUid: assigneeUidDraft.trim() }),
      });
      const text = await res.text();
      try {
        void (text.length > 0 ? JSON.parse(text) : null);
      } catch {
        setAssignError("The server returned an unreadable response.");
        return;
      }
      if (!res.ok) {
        setAssignError("Assignment failed.");
        return;
      }
      setAssignPanelOpen(false);
    } catch {
      setAssignError("Network error while assigning.");
    } finally {
      setAssignBusy(false);
    }
  }

  async function deleteSubmissionPermanently() {
    if (!selectedId || !canDeleteItem(role)) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const id = selectedId;
    const prevIndex = visibleCases.findIndex((c) => c.id === id);
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
          typeof body === "object" && body !== null && "error" in body && typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : res.status === 403
              ? "You don’t have permission to delete this report."
              : res.status === 404
                ? "This submission was not found. It may have already been removed."
                : "Delete failed. Try again.";
        setDeleteError(msg);
        return;
      }
      // Keep behavior consistent: remove locally immediately.
      const nextCases = cases.filter((c) => c.id !== id);
      setCases(nextCases);
      if (role && userCtx) {
        setCaseQueueRows(filterCasesVisibleToRole(role, nextCases, userCtx).map(toCaseQueueSnapshot));
      } else {
        setCaseQueueRows([]);
      }
      if (role && userCtx) {
        const nextVisible = filterCasesVisibleToRole(role, nextCases, userCtx).filter(
          (c) => !caseHasNoVisibleLead(c) && isCaseAssignedToWorkspaceUser(c, userCtx),
        );
        const nextId =
          nextVisible.length === 0
            ? null
            : nextVisible[Math.min(Math.max(prevIndex, 0), nextVisible.length - 1)]?.id ?? null;
        setSelectedId(nextVisible.length ? nextId : null);
      } else {
        setSelectedId(null);
      }
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
        getIdToken: () => user.getIdToken(true),
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

  async function runActionSaveNote() {
    if (!caseDataEnabled || authState.status !== "signedInWorkspace" || !role || !userCtx) return;
    if (!selectedId) return;
    const sel = cases.find((x) => x.id === selectedId);
    if (!sel) return;
    if (role === "reviewer" && !isCaseAssignedToWorkspaceUser(sel, userCtx)) return;
    setActionError(null);
    setActionPending(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) {
        setActionError("Please sign in again.");
        return;
      }
      const token = await user.getIdToken(true);
      const res = await fetch(`/api/admin/submissions/${encodeURIComponent(selectedId)}/reviewer-action`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_reviewer_note", reviewerNote: noteDraft ?? "" }),
      });
      if (!res.ok) {
        setActionError("Something went wrong. Please try again.");
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
  if (role === "readonly") {
    return (
      <div className="card">
        <p className="subtext">This view is not available in read-only mode.</p>
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

  const emptyTitle = editorDesk ? "Nothing assigned to you right now" : `Nothing in ${labels.myQueue.toLowerCase()}`;
  const emptyBody = editorDesk
    ? "Your list only shows submissions where you are the lead. If you expected work here, ask the desk to confirm the assignment."
    : "When you take the lead on a report, it will appear here for quick access.";

  return (
    <div className="case-workspace">
      <div className="case-board">
        {visibleCases.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">{emptyTitle}</p>
            <p className="subtext" style={{ margin: 0 }}>
              {emptyBody}
            </p>
          </div>
        ) : (
          <div className="report-grid">
            {visibleCases.map((c) => (
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
        decryptPanelLoading={decryptPanelLoading}
        stageLabel={stageLabel}
        leadLabel={leadLabel}
        priorityLabel={priorityLabel}
        notesEnabled={notesEnabled}
        noteDraft={noteDraft}
        setNoteDraft={setNoteDraft}
        actionPending={actionPending}
        actionError={actionError}
        onSaveNote={() => void runActionSaveNote()}
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
        showStatusPicker={showStatusPicker}
        allowedStatusTargets={allowedStatusTargets}
        workflowStatusDraft={workflowStatusDraft}
        setWorkflowStatusDraft={setWorkflowStatusDraft}
        workflowBusy={workflowBusy}
        workflowError={workflowError}
        onApplyWorkflowStatus={() => {
          if (!workflowStatusDraft) return;
          void updateCaseWorkflowStatus(workflowStatusDraft);
        }}
      />
    </div>
  );
}

