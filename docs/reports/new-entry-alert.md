# Phase: new-entry-alert

Date: 2026-11-11 · Desk: `main` · App: `feat/phase2b` (current branch, left as is) · Nothing deployed.

## 1. Function (`secure-reporter-app/functions`)

New file `functions/src/newSubmissionAlert.ts`; `index.ts` gains one re-export line at the end. Existing
`attachmentRelay` / `attachmentRollback` untouched. No new npm dependency (Resend called via `fetch`, Node 20).

`notifyNewSubmission` = `onDocumentCreated("submissions/{id}")`, 2nd gen, **region europe-west1** (Firestore
`(default)` of `sudanfcts-reporting` is in `europe-west1`, checked with `firebase firestore:databases:get`),
`secrets: [RESEND_API_KEY]`, `retry: false`, 60 s, 256 MiB.

- **Recipients**: same as the desk's "designed" path. `users` docs that are active (`active` true/"true", or
  `status=="active"`, or `enabled===true`) with role owner/admin (`managing_editor` counts as admin). Email from
  `users/{uid}.email`, with `admin.auth().getUser(uid).email` as fallback. Owner/admin is hardcoded with a comment:
  the function can't import desk `rbac.ts`. If RBAC for "designed" ever changes, update both.
- **Bell**: `notifications/{uid}/items/new_submission_<hash(event.id)>`, `create()`, shape
  `{type:"new_submission", caseId:"", caseRef:"", message:<Arabic fixed text>, actorName:null, read:false, createdAt}`.
- **Email**: from `notifications@desk.blueteamafrica.com` (same as desk). Subject
  "عنصر جديد على المكتب · New item on the desk". Body "عنصر جديد بانتظاركم على المكتب." + "A new item is
  waiting on the desk." + button to `https://desk.blueteamafrica.com/dashboard?view=incoming`. No name, title,
  content, file name, doc ID or ref code. The submission document is never read.
- **Duplicate guard**: (a) `notificationEventGuards/{sha256(event.id)[:32]}` is claimed with `create()` before
  anything is sent, and a redelivery hits ALREADY_EXISTS → `SKIPPED reason=duplicate_event`. (b) Bell item IDs
  are deterministic, so even with no guard a second write is `bell_write SKIPPED reason=already_exists`.
  `retry:false` also means a failed run is not retried. Rules have no catch-all, so clients can't read or write
  the guard collection. Guard docs pile up (one per submission, tiny); a TTL policy on `createdAt` can be added later.
- **Logs** (no names/emails/IDs/content): `bell_write ok|SKIPPED|FAILED code= message=`, `email ok|SKIPPED
  reason=no_api_key|no_recipient_email|FAILED status= name= message=`, `recipients=N withEmail=M project=`,
  `ZERO_RECIPIENTS activeUsers= eligibleRoles= project=`, `guard FAILED`, `recipients FAILED`,
  `auth_email_lookup FAILED code=`. Error messages pass through an email redactor.

Arabic text "عنصر جديد بانتظاركم على المكتب." is my translation (lit. "a new item awaits you on the desk") — please confirm wording.

## 2. Desk

- `WorkspaceNotificationLabels` + factsd/demoNgo/ar: `newSubmissionTitle`, `newSubmissionBody`.
- `NotificationBell.tsx`: `new_submission` items render title/body **from labels** (follows the UI language,
  not the stored Arabic message), no ref, no "By:" line, wrapped in a `Link` to the incoming list (the
  workflow's `new` sidebar view href, `/dashboard` → `/sudanfacts` base path rewrite like SidebarNav). It closes the panel on click.
  New `.notif-link` CSS.
- "By:" fix: server `resolveActorName` now returns `users.displayName` → Auth `displayName` → `null` (never
  email). The bell also hides any stored `actorName` containing "@", which covers older items. Result: users with no
  display name set show no "By:" line rather than their email.
- Bell console log line no longer contains the uid (`path=notifications/{uid}/items project=...`).

## 3. Verification
- Functions: `npx tsc --noEmit -p functions` exit 0; `npm run build` ok; loaded `lib/index.js` → exports
  `attachmentRelay, attachmentRollback, notifyNewSubmission`; endpoint manifest: `platform gcfv2, region
  europe-west1, eventType google.cloud.firestore.document.v1.created, document submissions/{id},
  secretEnvironmentVariables RESEND_API_KEY, retry false`.
- Functions lint: `npx eslint --no-warn-ignored functions/src/newSubmissionAlert.ts` → clean.
- App: `npx tsc --noEmit` exit 0; `npm run lint` 0 errors, 1 pre-existing warning; `npm run test:vault` 161/161 pass.
- Desk: tsc clean; lint 0 errors, 3 pre-existing warnings; `npm run build` ok. No test runner in desk.
- Not run in the emulator or against live Firestore/Resend.

## 4. Plan / deploy facts
- `firebase functions:list --project sudanfcts-reporting` → 403 "Cloud Functions API has not been used in
  project sudanfcts-reporting before or it is disabled". **No functions have ever been deployed to this project**
  (so the relay functions are not live, consistent with SHARED_CONTEXT §4).
- Plan: not determinable from the CLI. 2nd-gen functions, Eventarc Firestore triggers and Secret Manager require
  **Blaze**. Check Firebase console → Usage and billing. First deploy will enable Cloud Functions, Cloud Build,
  Artifact Registry, Cloud Run, Eventarc, Pub/Sub, Secret Manager APIs.
- Commands (run from `secure-reporter-app/`):
  - `firebase functions:secrets:set RESEND_API_KEY --project sudanfcts-reporting`
  - `firebase deploy --only functions:notifyNewSubmission --project sudanfcts-reporting`
- Resend free-tier: 100/day; each submission sends one email per owner/admin.

## 5. Test
1. Send a report from the app.
2. Desk bell (signed in as an active owner/admin): new unread item "New item / عنصر جديد" with the fixed body.
   Clicking it opens the incoming list. Email arrives with the bilingual fixed text only.
3. Firebase console → Functions → notifyNewSubmission → Logs: `recipients=N withEmail=M project=sudanfcts-reporting`,
   then N × `bell_write ok type=new_submission ...` and N × `email ok type=new_submission`.

## 6. Diffs
### secure-reporter-app
```diff
diff --git a/functions/src/index.ts b/functions/src/index.ts
index 7d03e38..0e6f6de 100644
--- a/functions/src/index.ts
+++ b/functions/src/index.ts
@@ -385,3 +385,6 @@ export const attachmentRollback = onRequest({ cors: true, timeoutSeconds: 60 },
     res.status(500).json({ error: err instanceof Error ? err.message : String(err), stage });
   }
 });
+
+// New-submission alert (bell + email to desk owners/admins). See newSubmissionAlert.ts.
+export { notifyNewSubmission } from "./newSubmissionAlert";
diff --git a/functions/src/newSubmissionAlert.ts b/functions/src/newSubmissionAlert.ts
new file mode 100644
index 0000000..47b4976
--- /dev/null
+++ b/functions/src/newSubmissionAlert.ts
@@ -0,0 +1,263 @@
+/**
+ * New-submission alert: when a reporter submission is created, notify the desk's active
+ * owners and admins by in-app bell (notifications/{uid}/items) and by email (Resend).
+ *
+ * Mirrors the desk's existing notification paths (blueteam-secure-desk
+ * app/_lib/server/notifications.ts):
+ * - Recipients: `users` docs that are active (active trueish | status=="active" | enabled===true)
+ *   with role owner or admin (legacy "managing_editor" counts as admin), the same set the desk's
+ *   "designed" path derives from RBAC. Email from users/{uid}.email, Firebase Auth fallback.
+ * - Bell document shape: type, caseId, caseRef, message, actorName, read, createdAt.
+ *
+ * Privacy: the bell item and the email carry fixed text only. No reporter name, title,
+ * content, file names, document ID or reference code. Logs never carry names, emails, IDs
+ * or content: only per-channel ok / SKIPPED / FAILED with counts and error codes.
+ *
+ * Idempotency: Firestore triggers are at-least-once. A guard doc keyed by the event ID is
+ * created with `create()` (fails if it exists) before any notification goes out, and bell
+ * items use a deterministic ID derived from the event ID, so a redelivered event writes nothing.
+ *
+ * Reads `submissions` only to receive the trigger; never reads or writes submission data.
+ */
+import { createHash } from "crypto";
+import * as logger from "firebase-functions/logger";
+import { defineSecret } from "firebase-functions/params";
+import { onDocumentCreated } from "firebase-functions/v2/firestore";
+import * as admin from "firebase-admin";
+import { FieldValue } from "firebase-admin/firestore";
+
+const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
+
+/** Same sender as the desk (blueteam-secure-desk app/_lib/server/sendEmail.ts). */
+const SENDER = "notifications@desk.blueteamafrica.com";
+const DESK_INCOMING_URL = "https://desk.blueteamafrica.com/dashboard?view=incoming";
+
+const TYPE = "new_submission";
+const BELL_PATH_PATTERN = "notifications/{uid}/items";
+const GUARD_COLLECTION = "notificationEventGuards";
+
+/** Owner + admin: the roles the desk's RBAC lets target the "designed" stage. */
+const ELIGIBLE_ROLES = new Set(["owner", "admin"]);
+
+const TEXT_AR = "عنصر جديد بانتظاركم على المكتب.";
+const TEXT_EN = "A new item is waiting on the desk.";
+const SUBJECT = "عنصر جديد على المكتب · New item on the desk";
+const FOOTER = "Secure Desk";
+
+function isTrueish(v: unknown): boolean {
+  return v === true || v === "true";
+}
+
+/** Mirrors desk `isWorkspaceUserActive`. */
+function isActive(d: Record<string, unknown>): boolean {
+  return isTrueish(d.active) || d.status === "active" || d.enabled === true;
+}
+
+/** Mirrors desk `normalizeWorkspaceRole` for the roles this alert cares about. */
+function normalizeRole(v: unknown): string | null {
+  if (typeof v !== "string") return null;
+  const raw = v.trim().toLowerCase();
+  if (raw === "managing_editor") return "admin";
+  if (raw === "editor") return "reviewer";
+  return raw || null;
+}
+
+function errorCode(e: unknown): string {
+  return e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "none";
+}
+
+/** Never let an address slip into logs through a provider error message. */
+function redact(text: string): string {
+  return text.replace(/[^\s@<>"']+@[^\s@<>"']+/g, "<redacted>");
+}
+
+function errorMessage(e: unknown): string {
+  return redact(e instanceof Error ? e.message : String(e));
+}
+
+function shortHash(s: string): string {
+  return createHash("sha256").update(s).digest("hex").slice(0, 32);
+}
+
+type Recipient = { uid: string; email: string | null };
+
+async function findRecipients(): Promise<{ recipients: Recipient[]; activeUsers: number }> {
+  const snap = await admin.firestore().collection("users").get();
+  let activeUsers = 0;
+  const recipients: Recipient[] = [];
+  for (const doc of snap.docs) {
+    const d = doc.data() as Record<string, unknown>;
+    if (!isActive(d)) continue;
+    activeUsers++;
+    const role = normalizeRole(d.role);
+    if (!role || !ELIGIBLE_ROLES.has(role)) continue;
+    const email = typeof d.email === "string" && d.email.trim() ? d.email.trim() : null;
+    recipients.push({ uid: doc.id, email });
+  }
+  await Promise.all(
+    recipients.map(async (r) => {
+      if (r.email) return;
+      try {
+        const u = await admin.auth().getUser(r.uid);
+        if (u.email) r.email = u.email;
+      } catch (e) {
+        logger.warn(`newSubmissionAlert: auth_email_lookup FAILED code=${errorCode(e)}`);
+      }
+    }),
+  );
+  return { recipients, activeUsers };
+}
+
+async function writeBell(uid: string, itemId: string, projectId: string): Promise<void> {
+  try {
+    await admin
+      .firestore()
+      .collection("notifications")
+      .doc(uid)
+      .collection("items")
+      .doc(itemId)
+      .create({
+        type: TYPE,
+        caseId: "",
+        caseRef: "",
+        message: TEXT_AR,
+        actorName: null,
+        read: false,
+        createdAt: FieldValue.serverTimestamp(),
+      });
+    logger.info(`newSubmissionAlert: bell_write ok type=${TYPE} path=${BELL_PATH_PATTERN} project=${projectId}`);
+  } catch (e) {
+    const code = errorCode(e);
+    // 6 = ALREADY_EXISTS: a redelivered event; the item is already there.
+    if (code === "6" || code === "already-exists") {
+      logger.warn(`newSubmissionAlert: bell_write SKIPPED type=${TYPE} reason=already_exists`);
+      return;
+    }
+    logger.error(
+      `newSubmissionAlert: bell_write FAILED type=${TYPE} path=${BELL_PATH_PATTERN} project=${projectId} code=${code} message=${errorMessage(e)}`,
+    );
+  }
+}
+
+function buildHtml(): string {
+  return `<!DOCTYPE html>
+<html lang="ar" dir="rtl">
+<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Secure Desk</title></head>
+<body style="margin:0;padding:0;background:#f5f4f0;font-family:system-ui,sans-serif;">
+<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 16px;">
+  <tr><td align="center">
+    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
+      <tr><td style="background:#1a1a2e;padding:20px 28px;"><span style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.02em;">Secure Desk</span></td></tr>
+      <tr><td style="padding:28px 28px 0;text-align:right;" dir="rtl" lang="ar">
+        <p style="margin:0 0 8px;font-size:15px;color:#1a1a2e;line-height:1.6;">${TEXT_AR}</p>
+      </td></tr>
+      <tr><td style="padding:0 28px 0;text-align:left;" dir="ltr" lang="en">
+        <p style="margin:0 0 24px;font-size:15px;color:#1a1a2e;line-height:1.6;">${TEXT_EN}</p>
+      </td></tr>
+      <tr><td style="padding:0 28px;text-align:center;">
+        <a href="${DESK_INCOMING_URL}" style="display:inline-block;background:#1a1a2e;color:#ffffff;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none;">فتح المكتب · Open the desk</a>
+      </td></tr>
+      <tr><td style="padding:24px 28px;text-align:center;"><p style="margin:0;font-size:12px;color:#999;">${FOOTER}</p></td></tr>
+    </table>
+  </td></tr>
+</table>
+</body>
+</html>`;
+}
+
+async function sendEmail(to: string | null, apiKey: string): Promise<void> {
+  if (!to) {
+    logger.warn(`newSubmissionAlert: email SKIPPED type=${TYPE} reason=no_recipient_email`);
+    return;
+  }
+  if (!apiKey) {
+    logger.warn(`newSubmissionAlert: email SKIPPED type=${TYPE} reason=no_api_key`);
+    return;
+  }
+  try {
+    const res = await fetch("https://api.resend.com/emails", {
+      method: "POST",
+      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
+      body: JSON.stringify({
+        from: SENDER,
+        to,
+        subject: SUBJECT,
+        text: `${TEXT_AR}\n\n${TEXT_EN}\n\n${DESK_INCOMING_URL}\n\n${FOOTER}`,
+        html: buildHtml(),
+      }),
+    });
+    if (res.ok) {
+      logger.info(`newSubmissionAlert: email ok type=${TYPE}`);
+      return;
+    }
+    let detail = "";
+    try {
+      const body = (await res.json()) as { name?: unknown; message?: unknown };
+      detail = `name=${String(body.name ?? "unknown")} message=${redact(String(body.message ?? ""))}`;
+    } catch {
+      /* non-JSON error body */
+    }
+    logger.error(`newSubmissionAlert: email FAILED type=${TYPE} status=${res.status} ${detail}`.trim());
+  } catch (e) {
+    logger.error(`newSubmissionAlert: email FAILED type=${TYPE} code=${errorCode(e)} message=${errorMessage(e)}`);
+  }
+}
+
+export const notifyNewSubmission = onDocumentCreated(
+  {
+    document: "submissions/{id}",
+    // Must match the Firestore database location (sudanfcts-reporting: europe-west1).
+    region: "europe-west1",
+    secrets: [RESEND_API_KEY],
+    retry: false,
+    timeoutSeconds: 60,
+    memory: "256MiB",
+  },
+  async (event) => {
+    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "unknown";
+    const eventKey = shortHash(event.id);
+
+    // Guard: claim this event once. A redelivery finds the guard doc and stops here.
+    try {
+      await admin
+        .firestore()
+        .collection(GUARD_COLLECTION)
+        .doc(eventKey)
+        .create({ type: TYPE, createdAt: FieldValue.serverTimestamp() });
+    } catch (e) {
+      const code = errorCode(e);
+      if (code === "6" || code === "already-exists") {
+        logger.warn(`newSubmissionAlert: SKIPPED reason=duplicate_event`);
+        return;
+      }
+      // Guard unavailable: carry on; bell items are still deduplicated by their deterministic ID.
+      logger.error(`newSubmissionAlert: guard FAILED code=${code} message=${errorMessage(e)}`);
+    }
+
+    let found: { recipients: Recipient[]; activeUsers: number };
+    try {
+      found = await findRecipients();
+    } catch (e) {
+      logger.error(`newSubmissionAlert: recipients FAILED code=${errorCode(e)} message=${errorMessage(e)} project=${projectId}`);
+      return;
+    }
+    const { recipients, activeUsers } = found;
+    if (recipients.length === 0) {
+      logger.warn(
+        `newSubmissionAlert: ZERO_RECIPIENTS activeUsers=${activeUsers} eligibleRoles=owner,admin project=${projectId}`,
+      );
+      return;
+    }
+    logger.info(
+      `newSubmissionAlert: recipients=${recipients.length} withEmail=${recipients.filter((r) => r.email).length} project=${projectId}`,
+    );
+
+    const apiKey = RESEND_API_KEY.value().trim();
+    await Promise.all(
+      recipients.map(async (r) => {
+        await writeBell(r.uid, `${TYPE}_${eventKey}`, projectId);
+        await sendEmail(r.email, apiKey);
+      }),
+    );
+  },
+);
```
### blueteam-secure-desk
```diff
diff --git a/app/_components/dashboard/NotificationBell.tsx b/app/_components/dashboard/NotificationBell.tsx
index 0b2c761..fde95e1 100644
--- a/app/_components/dashboard/NotificationBell.tsx
+++ b/app/_components/dashboard/NotificationBell.tsx
@@ -1,15 +1,19 @@
 "use client";
 
 import { useEffect, useRef, useState } from "react";
+import Link from "next/link";
+import { usePathname } from "next/navigation";
 import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
 import { db } from "@/app/_lib/firebase/firestore";
 import { useAuth } from "@/app/_components/auth/AuthContext";
 import { getFirebaseAuth } from "@/app/_lib/firebase/auth";
 import { useDashboardBranding } from "@/app/_components/dashboard/WorkspaceBrandingProvider";
 
+type NotificationType = "assigned" | "designed" | "new_submission";
+
 type NotificationItem = {
   id: string;
-  type: "assigned" | "designed";
+  type: NotificationType;
   caseId: string;
   caseRef: string;
   message: string;
@@ -31,6 +35,14 @@ function relativeTime(
   return sub(nl.relativeTimeDaysAgo, Math.floor(diffSec / 86400));
 }
 
+/** Older items stored an email as actorName; the bell shows names only. */
+function displayableActorName(name: string | null): string | null {
+  if (!name) return null;
+  const t = name.trim();
+  if (!t || t.includes("@")) return null;
+  return t;
+}
+
 function BellIcon() {
   return (
     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
@@ -45,6 +57,12 @@ export function NotificationBell() {
   const { labels } = useDashboardBranding();
   const nl = labels.notificationLabels;
   const uid = state.status === "signedInWorkspace" ? state.user.uid : null;
+  const pathname = usePathname() ?? "";
+  const basePath = pathname.startsWith("/sudanfacts") ? "/sudanfacts" : "/dashboard";
+  // Incoming list href from the workspace workflow config (same mapping as SidebarNav).
+  const incomingHref = (
+    labels.workflow.sidebarStageViews.find((v) => v.key === "new")?.href ?? "/dashboard?view=incoming"
+  ).replace(/^\/dashboard\b/, basePath);
 
   const [items, setItems] = useState<NotificationItem[]>([]);
   const [open, setOpen] = useState(false);
@@ -56,7 +74,7 @@ export function NotificationBell() {
   // Real-time listener
   useEffect(() => {
     if (!uid) return;
-    console.log(`[NotificationBell] subscribing uid=${uid} path=notifications/${uid}/items project=${db.app.options.projectId ?? "unknown"}`);
+    console.log(`[NotificationBell] subscribing path=notifications/{uid}/items project=${db.app.options.projectId ?? "unknown"}`);
     const q = query(
       collection(db, "notifications", uid, "items"),
       orderBy("createdAt", "desc"),
@@ -70,7 +88,7 @@ export function NotificationBell() {
             const data = d.data();
             return {
               id: d.id,
-              type: data.type as "assigned" | "designed",
+              type: data.type as NotificationType,
               caseId: typeof data.caseId === "string" ? data.caseId : "",
               caseRef: typeof data.caseRef === "string" ? data.caseRef : "",
               message: typeof data.message === "string" ? data.message : "",
@@ -165,10 +183,24 @@ export function NotificationBell() {
               <li className="notif-empty">{nl?.emptyState ?? "No notifications yet"}</li>
             ) : (
               items.map((n) => {
-                const actorLine = n.actorName && nl?.byActor ? `${nl.byActor} ${n.actorName}` : null;
+                const actorName = displayableActorName(n.actorName);
+                const actorLine = actorName && nl?.byActor ? `${nl.byActor} ${actorName}` : null;
                 const timeLine = nl ? relativeTime(n.createdAt, nl) : null;
+                const itemClass = `notif-item${n.read ? "" : " notif-item--unread"}`;
+                if (n.type === "new_submission") {
+                  // Fixed text from labels (follows the UI language); links to the incoming list, not a case.
+                  return (
+                    <li key={n.id} className={itemClass}>
+                      <Link href={incomingHref} className="notif-link" onClick={() => setOpen(false)}>
+                        <span className="notif-ref">{nl?.newSubmissionTitle ?? "New item"}</span>
+                        <span className="notif-msg">{nl?.newSubmissionBody ?? "A new item is waiting on the desk."}</span>
+                        {timeLine && <span className="notif-time">{timeLine}</span>}
+                      </Link>
+                    </li>
+                  );
+                }
                 return (
-                  <li key={n.id} className={`notif-item${n.read ? "" : " notif-item--unread"}`}>
+                  <li key={n.id} className={itemClass}>
                     <span className="notif-ref">{n.caseRef}</span>
                     <span className="notif-msg">{n.message}</span>
                     {actorLine && <span className="notif-actor">{actorLine}</span>}
diff --git a/app/_lib/i18n/ar.ts b/app/_lib/i18n/ar.ts
index 39bec9d..1070f79 100644
--- a/app/_lib/i18n/ar.ts
+++ b/app/_lib/i18n/ar.ts
@@ -486,5 +486,7 @@ export const arLabels: Partial<OrgLabels> = {
     relativeTimeMinutesAgo: "منذ {n} دقيقة",
     relativeTimeHoursAgo: "منذ {n} ساعة",
     relativeTimeDaysAgo: "منذ {n} يوم",
+    newSubmissionTitle: "عنصر جديد",
+    newSubmissionBody: "عنصر جديد بانتظاركم على المكتب.",
   },
 };
diff --git a/app/_lib/org/configs/demoNgo.ts b/app/_lib/org/configs/demoNgo.ts
index c2b0c05..a6ef597 100644
--- a/app/_lib/org/configs/demoNgo.ts
+++ b/app/_lib/org/configs/demoNgo.ts
@@ -422,6 +422,8 @@ export const demoNgoWorkspaceConfig: WorkspaceConfig = {
     relativeTimeMinutesAgo: "{n}m ago",
     relativeTimeHoursAgo: "{n}h ago",
     relativeTimeDaysAgo: "{n}d ago",
+    newSubmissionTitle: "New item",
+    newSubmissionBody: "A new item is waiting on the desk.",
   },
 };
 
diff --git a/app/_lib/org/configs/factsd.ts b/app/_lib/org/configs/factsd.ts
index 8c5ba11..37f41c7 100644
--- a/app/_lib/org/configs/factsd.ts
+++ b/app/_lib/org/configs/factsd.ts
@@ -507,5 +507,7 @@ export const factsdWorkspaceConfig: WorkspaceConfig = {
     relativeTimeMinutesAgo: "{n}m ago",
     relativeTimeHoursAgo: "{n}h ago",
     relativeTimeDaysAgo: "{n}d ago",
+    newSubmissionTitle: "New item",
+    newSubmissionBody: "A new item is waiting on the desk.",
   },
 };
diff --git a/app/_lib/org/types.ts b/app/_lib/org/types.ts
index 3d8073a..ec148a7 100644
--- a/app/_lib/org/types.ts
+++ b/app/_lib/org/types.ts
@@ -404,6 +404,10 @@ export type WorkspaceNotificationLabels = {
   relativeTimeMinutesAgo: string;
   relativeTimeHoursAgo: string;
   relativeTimeDaysAgo: string;
+  /** Bell title for a new reporter submission (written by the Functions trigger). Fixed text, no case details. */
+  newSubmissionTitle: string;
+  /** Bell body for a new reporter submission. Fixed text, no case details. */
+  newSubmissionBody: string;
 };
 
 /** Flattened labels consumed across dashboard UI (back-compat shape). */
diff --git a/app/_lib/server/notifications.ts b/app/_lib/server/notifications.ts
index 420f449..8622151 100644
--- a/app/_lib/server/notifications.ts
+++ b/app/_lib/server/notifications.ts
@@ -123,25 +123,25 @@ async function sendNotificationEmail(
 
 /**
  * Resolves a display name for the actor who triggered a notification.
- * Checks Firestore users/{uid}.displayName first, then Firebase Auth, then falls back to email.
+ * Firestore users/{uid}.displayName first, then the Firebase Auth displayName.
+ * Never falls back to an email: the bell shows names only, so no name ⇒ null (no "By:" line).
  */
-async function resolveActorName(uid: string, fallbackEmail: string | null): Promise<string | null> {
+async function resolveActorName(uid: string): Promise<string | null> {
   const db = getAdminFirestore();
   try {
     const snap = await db.collection("users").doc(uid).get();
     if (snap.exists) {
       const data = snap.data() as WorkspaceUserProfile;
-      if (typeof data.displayName === "string" && data.displayName.trim()) {
+      if (typeof data.displayName === "string" && data.displayName.trim() && !data.displayName.includes("@")) {
         return data.displayName.trim();
       }
     }
   } catch { /* non-fatal */ }
   try {
     const u = await getAdminAuth().getUser(uid);
-    if (u.displayName) return u.displayName;
-    if (u.email) return u.email;
+    if (u.displayName && u.displayName.trim() && !u.displayName.includes("@")) return u.displayName.trim();
   } catch { /* non-fatal */ }
-  return fallbackEmail;
+  return null;
 }
 
 /**
@@ -213,14 +213,15 @@ export async function notifyAssignment(opts: {
   /** Already-resolved email from the calling route — skips a second Firestore + Auth lookup. */
   assigneeEmail?: string | null;
   actorUid: string;
+  /** Accepted for call-site compatibility; no longer used (actor shown by name only). */
   actorEmail?: string | null;
 }): Promise<void> {
-  const { caseId, caseRef, assigneeUid, assigneeEmail, actorUid, actorEmail } = opts;
+  const { caseId, caseRef, assigneeUid, assigneeEmail, actorUid } = opts;
   const nl = getNotificationLabels();
   const vars = { ref: caseRef };
 
   const message = interpolateVars(nl.assignedBody, vars);
-  const actorName = await resolveActorName(actorUid, actorEmail ?? null);
+  const actorName = await resolveActorName(actorUid);
 
   // In-app bell and email are independent: a failed bell write no longer suppresses the email,
   // and each outcome is logged separately.
@@ -267,9 +268,10 @@ export async function notifyStageDesigned(opts: {
   caseRef: string;
   caseTitle?: string;
   actorUid: string;
+  /** Accepted for call-site compatibility; no longer used (actor shown by name only). */
   actorEmail?: string | null;
 }): Promise<void> {
-  const { caseId, caseRef, actorUid, actorEmail } = opts;
+  const { caseId, caseRef, actorUid } = opts;
   const nl = getNotificationLabels();
   const vars = { ref: caseRef };
 
@@ -288,7 +290,7 @@ export async function notifyStageDesigned(opts: {
 
   const message = interpolateVars(nl.designedBody, vars);
   const subject = interpolateVars(nl.emailSubjectDesigned, vars);
-  const actorName = await resolveActorName(actorUid, actorEmail ?? null);
+  const actorName = await resolveActorName(actorUid);
   const ctaUrl = `${DASHBOARD_URL}/dashboard`;
   const html = buildEmailHtml({
     title: nl.designedTitle,
diff --git a/app/globals.css b/app/globals.css
index 820b6ea..f58300a 100644
--- a/app/globals.css
+++ b/app/globals.css
@@ -5412,6 +5412,16 @@ a.exec-kpi:hover {
   letter-spacing: 0.05em;
 }
 
+.notif-link {
+  display: flex;
+  flex-direction: column;
+  gap: 2px;
+  color: inherit;
+  text-decoration: none;
+  cursor: pointer;
+}
+.notif-link:focus-visible { outline: 2px solid var(--accent, #2563eb); outline-offset: 2px; }
+
 .notif-msg {
   font-size: 13px;
   color: var(--text);
```
