import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { buildEmailHtml, interpolateVars, sendEmail } from "@/app/_lib/server/sendEmail";
import { applyLocaleToLabels } from "@/app/_lib/i18n/applyLocaleToLabels";
import { getOrgLabels } from "@/app/_lib/org/getOrgLabels";
import {
  WORKSPACE_ROLES,
  allowedCaseStatusTargets,
  normalizeWorkspaceRole,
  type WorkspaceRole,
} from "@/app/_lib/rbac";
import { isWorkspaceUserActive, type WorkspaceUserProfile } from "@/app/_lib/workspace/userProfile";
import type { CaseStatus, WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";

export type NotificationType = "assigned" | "designed";

export type NotificationRecord = {
  type: NotificationType;
  caseId: string;
  caseRef: string;
  message: string;
  read: boolean;
  createdAt: unknown; // FieldValue.serverTimestamp() on write
};

const DASHBOARD_URL =
  (process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://desk.blueteamafrica.com").replace(/\/$/, "");

/**
 * Returns notification labels always in Arabic — workspace language, not per-user locale.
 * Notifications must be readable by all Arabic-speaking recipients regardless of
 * whatever UI language a sender happened to have active at the time of the action.
 */
function getNotificationLabels() {
  const base = getOrgLabels();
  return applyLocaleToLabels(base, "ar").notificationLabels;
}

/** Returns roles that include `status` in their allowed target list (derived from RBAC, not hardcoded). */
function rolesThatCanTargetStatus(status: CaseStatus): WorkspaceRole[] {
  const dummy = {} as WorkspaceCase;
  const dummyCtx = { uid: "", email: null, displayName: null };
  return WORKSPACE_ROLES.filter((role) =>
    allowedCaseStatusTargets(role, status, dummy, dummyCtx).includes(status),
  );
}

/** Writes one notification doc to notifications/{uid}/items/{auto-id}. */
async function writeNotification(uid: string, record: Omit<NotificationRecord, "createdAt" | "read">): Promise<void> {
  const db = getAdminFirestore();
  await db
    .collection("notifications")
    .doc(uid)
    .collection("items")
    .add({ ...record, read: false, createdAt: FieldValue.serverTimestamp() });
}

/** Fetches all active workspace users from `users` collection. */
async function fetchAllActiveUsers(): Promise<Array<{ uid: string; email: string | null; role: WorkspaceRole }>> {
  const db = getAdminFirestore();
  const snap = await db.collection("users").get();
  const results: Array<{ uid: string; email: string | null; role: WorkspaceRole }> = [];
  for (const doc of snap.docs) {
    const data = doc.data() as WorkspaceUserProfile;
    if (!isWorkspaceUserActive(data)) continue;
    const role = normalizeWorkspaceRole(data.role);
    if (!role) continue;
    const email =
      typeof data.email === "string" && data.email.trim() ? data.email.trim() : null;
    results.push({ uid: doc.id, email, role });
  }
  return results;
}

/**
 * Fetches email for a single UID — checks Firestore users/{uid}.email first,
 * then falls back to Firebase Auth record (same pattern as assign-owner route).
 */
async function fetchUserEmail(uid: string): Promise<string | null> {
  const db = getAdminFirestore();
  const snap = await db.collection("users").doc(uid).get();
  if (snap.exists) {
    const data = snap.data() as WorkspaceUserProfile;
    const email =
      typeof data.email === "string" && data.email.trim() ? data.email.trim() : null;
    if (email) return email;
  }
  // Firestore field missing or empty — try Firebase Auth record.
  try {
    const u = await getAdminAuth().getUser(uid);
    if (u.email) return u.email;
  } catch {
    /* Auth user lookup failure is non-fatal */
  }
  return null;
}

/**
 * Trigger 1: case assigned to a user.
 * Writes one in-app notification for the assignee and sends them an email.
 * Fire-and-forget from the route — errors are logged but never surface to the client.
 */
export async function notifyAssignment(opts: {
  caseId: string;
  caseRef: string;
  caseTitle?: string;
  assigneeUid: string;
  /** Already-resolved email from the calling route — skips a second Firestore + Auth lookup. */
  assigneeEmail?: string | null;
}): Promise<void> {
  const { caseId, caseRef, caseTitle, assigneeUid, assigneeEmail } = opts;
  const nl = getNotificationLabels();
  const titleVar = caseTitle?.trim() || caseRef;
  const vars = { title: titleVar, ref: caseRef };

  const message = interpolateVars(nl.assignedBody, vars);

  // In-app notification
  await writeNotification(assigneeUid, {
    type: "assigned",
    caseId,
    caseRef,
    message,
  });

  // Email — use caller-supplied email if already known; otherwise look it up.
  const email = assigneeEmail ?? await fetchUserEmail(assigneeUid);
  if (email) {
    const subject = interpolateVars(nl.emailSubjectAssigned, vars);
    const ctaUrl = `${DASHBOARD_URL}/dashboard`;
    await sendEmail({
      to: email,
      subject,
      text: `${nl.assignedTitle}\n\n${message}\n\n${ctaUrl}\n\n${nl.emailFooter}`,
      html: buildEmailHtml({
        title: nl.assignedTitle,
        body: message,
        ctaLabel: nl.emailViewCase,
        ctaUrl,
        footer: nl.emailFooter,
        dir: "rtl",
        lang: "ar",
      }),
    });
  }
}

/**
 * Trigger 2: case moved to "designed" stage.
 * Notifies all active workspace users whose role can target the "designed" stage
 * (derived from allowedCaseStatusTargets — currently owner + admin).
 * Fire-and-forget from the route.
 */
export async function notifyStageDesigned(opts: {
  caseId: string;
  caseRef: string;
  caseTitle?: string;
}): Promise<void> {
  const { caseId, caseRef, caseTitle } = opts;
  const nl = getNotificationLabels();
  const titleVar = caseTitle?.trim() || caseRef;
  const vars = { title: titleVar, ref: caseRef };

  const eligibleRoles = new Set(rolesThatCanTargetStatus("designed"));
  const allUsers = await fetchAllActiveUsers();
  const recipients = allUsers.filter((u) => eligibleRoles.has(u.role));

  const message = interpolateVars(nl.designedBody, vars);
  const subject = interpolateVars(nl.emailSubjectDesigned, vars);
  const ctaUrl = `${DASHBOARD_URL}/dashboard`;
  const html = buildEmailHtml({
    title: nl.designedTitle,
    body: message,
    ctaLabel: nl.emailViewCase,
    ctaUrl,
    footer: nl.emailFooter,
    dir: "rtl",
    lang: "ar",
  });

  await Promise.all(
    recipients.map(async (u) => {
      try {
        await writeNotification(u.uid, {
          type: "designed",
          caseId,
          caseRef,
          message,
        });
        if (u.email) {
          await sendEmail({
            to: u.email,
            subject,
            text: `${nl.designedTitle}\n\n${message}\n\n${ctaUrl}\n\n${nl.emailFooter}`,
            html,
          });
        }
      } catch (e) {
        console.error(`[notifications] notifyStageDesigned failed for uid=${u.uid}`, e);
      }
    }),
  );
}
