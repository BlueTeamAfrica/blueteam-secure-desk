import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { buildEmailHtml, interpolateRef, sendEmail } from "@/app/_lib/server/sendEmail";
import { getWorkspaceConfig } from "@/app/_lib/org/getWorkspaceConfig";
import { applyLocaleToLabels } from "@/app/_lib/i18n/applyLocaleToLabels";
import type { SupportedLocale } from "@/app/_lib/i18n/useLocale";
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

/** Returns workspace labels merged with locale (server-side). */
function getLabels() {
  const cfg = getWorkspaceConfig();
  const base = getOrgLabels();
  return applyLocaleToLabels(base, cfg.locale as SupportedLocale);
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

/** Fetches email for a single UID from the `users` collection. */
async function fetchUserEmail(uid: string): Promise<string | null> {
  const db = getAdminFirestore();
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() as WorkspaceUserProfile;
  const email =
    typeof data.email === "string" && data.email.trim() ? data.email.trim() : null;
  return email;
}

/**
 * Trigger 1: case assigned to a user.
 * Writes one in-app notification for the assignee and sends them an email.
 * Fire-and-forget from the route — errors are logged but never surface to the client.
 */
export async function notifyAssignment(opts: {
  caseId: string;
  caseRef: string;
  assigneeUid: string;
}): Promise<void> {
  const { caseId, caseRef, assigneeUid } = opts;
  const labels = getLabels();
  const nl = labels.notificationLabels;
  const cfg = getWorkspaceConfig();
  const isRtl = cfg.locale === "ar";
  const lang = cfg.locale;

  const message = interpolateRef(nl.assignedBody, caseRef);

  // In-app notification
  await writeNotification(assigneeUid, {
    type: "assigned",
    caseId,
    caseRef,
    message,
  });

  // Email
  const email = await fetchUserEmail(assigneeUid);
  if (email) {
    const subject = interpolateRef(nl.emailSubjectAssigned, caseRef);
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
        dir: isRtl ? "rtl" : "ltr",
        lang,
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
}): Promise<void> {
  const { caseId, caseRef } = opts;
  const labels = getLabels();
  const nl = labels.notificationLabels;
  const cfg = getWorkspaceConfig();
  const isRtl = cfg.locale === "ar";
  const lang = cfg.locale;

  const eligibleRoles = new Set(rolesThatCanTargetStatus("designed"));
  const allUsers = await fetchAllActiveUsers();
  const recipients = allUsers.filter((u) => eligibleRoles.has(u.role));

  const message = interpolateRef(nl.designedBody, caseRef);
  const subject = interpolateRef(nl.emailSubjectDesigned, caseRef);
  const ctaUrl = `${DASHBOARD_URL}/dashboard`;
  const html = buildEmailHtml({
    title: nl.designedTitle,
    body: message,
    ctaLabel: nl.emailViewCase,
    ctaUrl,
    footer: nl.emailFooter,
    dir: isRtl ? "rtl" : "ltr",
    lang,
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
