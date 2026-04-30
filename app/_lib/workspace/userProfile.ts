export type WorkspaceUserProfile = {
  active?: unknown;
  status?: unknown;
  role?: unknown;
  email?: unknown;
  displayName?: unknown;
};

export function isTrueish(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Workspace user "active" normalization.
 *
 * Production data may store booleans as strings; accept both.
 * Also accept legacy status = "active".
 */
export function isWorkspaceUserActive(data: WorkspaceUserProfile | null | undefined): boolean {
  if (!data) return false;
  if (isTrueish(data.active)) return true;
  return data.status === "active";
}

