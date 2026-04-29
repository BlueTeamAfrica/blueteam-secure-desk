import type { EditorDeskHeaderPair, WorkspaceConfig } from "@/app/_lib/org/types";
import { factsdWorkspaceConfig } from "@/app/_lib/org/configs/factsd";
import { demoNgoWorkspaceConfig } from "@/app/_lib/org/configs/demoNgo";
import { normalizeSidebarView } from "@/app/_lib/caseWorkspaceModel";

/**
 * Phase 1: single static workspace config.
 * Later: select by host, env, or org document without changing call sites.
 */
export function getWorkspaceConfig(): WorkspaceConfig {
  const id = (process.env.NEXT_PUBLIC_WORKSPACE_CONFIG_ID ?? "").trim();
  if (id === "demoNgo") return demoNgoWorkspaceConfig;
  return factsdWorkspaceConfig;
}

/**
 * Editor desk top header copy — same inference as the dashboard layout previously used.
 */
export function getEditorDeskHeaderFor(args: {
  pathname: string;
  viewRaw: string | null;
}): EditorDeskHeaderPair {
  const { pathname, viewRaw } = args;
  const t = (viewRaw ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  const view = t || normalizeSidebarView(viewRaw);

  const inferred =
    pathname.endsWith("/my-queue") || pathname.endsWith("/my-queue/")
      ? "your-queue"
      : pathname.endsWith("/dashboard") || pathname.endsWith("/dashboard/")
        ? view
        : view;

  const cfg = getWorkspaceConfig().editorDeskHeaders;
  return cfg.byInferredView[inferred] ?? cfg.default;
}
