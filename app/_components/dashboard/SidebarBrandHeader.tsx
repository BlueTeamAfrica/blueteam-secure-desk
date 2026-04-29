"use client";

import type { WorkspaceRole } from "@/app/_lib/rbac";
import type { OrgLabels } from "@/app/_lib/org/types";

export function SidebarBrandHeader(props: { labels: OrgLabels; role: WorkspaceRole | null }) {
  const { labels, role } = props;

  const roleLine =
    role === "owner" || role === "admin"
      ? labels.managingEditorDesk
      : role === "reviewer"
        ? labels.editorDeskSidebarTitle
        : labels.workspaceType;

  return (
    <div className="sidebar-brand-card">
      <div className="sidebar-logo-box" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={labels.workspaceLogoPath} alt="" className="sidebar-logo-img" />
      </div>
      <div className="sidebar-brand-workspace">{labels.workspaceName}</div>
      <div className="sidebar-brand-role">{roleLine}</div>
      <div className="sidebar-brand-powered">
        <span className="sidebar-brand-powered-label">{labels.poweredByPrefix}</span>
        <span className="sidebar-brand-powered-name">{labels.productName}</span>
      </div>
    </div>
  );
}

