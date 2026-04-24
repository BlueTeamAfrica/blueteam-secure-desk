"use client";

import { ROLE_LABEL, normalizeWorkspaceRole, type WorkspaceRole } from "@/app/_lib/rbac";

type WorkspaceMemberRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
};

function memberPickerLabel(m: WorkspaceMemberRow): string {
  const primary = m.displayName?.trim() || m.email?.trim() || m.uid;
  if (m.email?.trim() && m.displayName?.trim() && m.email.trim() !== m.displayName.trim()) {
    return `${m.displayName.trim()} (${m.email.trim()})`;
  }
  return primary;
}

export function ItemAssignmentPanel({
  open,
  managingEditorDesk,
  role,
  membersLoading,
  membersError,
  workspaceMembers,
  assigneeUidDraft,
  assignBusy,
  assignError,
  onChangeAssigneeUid,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  managingEditorDesk: boolean;
  role: WorkspaceRole;
  membersLoading: boolean;
  membersError: string | null;
  workspaceMembers: WorkspaceMemberRow[];
  assigneeUidDraft: string;
  assignBusy: boolean;
  assignError: string | null;
  onChangeAssigneeUid: (uid: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="assign-panel card stack-12">
      <div className="detail-section-title" style={{ marginBottom: 0 }}>
        {managingEditorDesk ? "Set submission lead" : "Assign case owner"}
      </div>
      <p className="small-muted" style={{ margin: 0 }}>
        {managingEditorDesk
          ? "Choose who carries the edit next. They will see this submission on their own desk the moment it saves."
          : "Pick a workspace member. This updates the submission in Firestore; reviewers see the case when they are the assigned owner."}
      </p>
      {membersLoading ? (
        <div className="row-between" style={{ gap: 10 }}>
          <div className="spinner" />
          <span className="muted" style={{ fontSize: 14 }}>
            Loading members…
          </span>
        </div>
      ) : membersError ? (
        <div className="alert alert-danger" role="alert">
          {membersError}
        </div>
      ) : (
        <>
          <label className="label" htmlFor="assignee-select">
            {managingEditorDesk ? "Lead" : "Assign to"}
          </label>
          <select
            id="assignee-select"
            className="input"
            style={{ width: "100%", maxWidth: "100%" }}
            value={assigneeUidDraft}
            onChange={(e) => onChangeAssigneeUid(e.target.value)}
            disabled={assignBusy}
          >
            <option value="">Select a person…</option>
            {workspaceMembers.map((m) => {
              const wr = normalizeWorkspaceRole(m.role);
              return (
                <option key={m.uid} value={m.uid}>
                  {memberPickerLabel(m)}
                  {wr ? ` · ${ROLE_LABEL[wr]}` : ""}
                </option>
              );
            })}
          </select>
          {assignError ? (
            <div className="alert alert-danger" role="alert">
              {assignError}
            </div>
          ) : null}
          <div className="action-row" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={assignBusy || !assigneeUidDraft.trim() || role === "readonly"}
              onClick={onConfirm}
            >
              {assignBusy ? "Saving…" : "Save assignment"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={assignBusy} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

