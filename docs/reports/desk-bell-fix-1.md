# Phase: desk-bell-fix-1

Date: 2026-11-11 · Branch: `main` · Base: `86854b0`

## 1. How can the email go out when no bell entry exists?

Rechecked the deployed order (pre-fix code):

- `notifyAssignment`: `await resolveActorName` → `await writeNotification(...)` → `await fetchUserEmail` → `await sendEmail`.
  `writeNotification` had no try/catch, so a failed `.add()` threw and the email line was never reached.
- `notifyStageDesigned`: per recipient, `try { await writeNotification; if (email) await sendEmail } catch { log }`.
  Same: a failed write skips that recipient's email.

So in the old code **an email cannot be sent if the write failed**. Emails arriving means `.add()` resolved
successfully. The write is not failing silently; it is succeeding somewhere you are not looking. Candidates,
most likely first:

1. **Admin SDK project ≠ the project open in the Firebase console / used by the browser.** The server project
   comes from `project_id` inside `FIREBASE_SERVICE_ACCOUNT_BASE64` (or `FIREBASE_PROJECT_ID`); the bell reads
   `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. If they differ, both of your observations follow: nothing in the console,
   and an empty bell with no console error (the listener succeeds on an empty path). The server also reads
   `users/{uid}` from its own project, so that project must hold user docs too. That fits if both projects
   were seeded at some point.
2. **Console display.** `notifications/{uid}` parent docs are never created, only `items` under them. The console
   lists these as greyed/italic "phantom" IDs. Easy to read as "no documents". Click into one to check.
3. **Docs deleted later.** `scripts/cleanup-bad-notifications.mjs` deletes items whose message contains a raw
   20-char doc ID. The designed path still builds `caseRef` from `referenceCode || id` (not `referenceFromId`),
   so its messages can carry the raw ID and would match. Only relevant if someone ran the script.
4. Wrong uid: ruled out as the cause of "nothing in the console" (that would still show docs under another uid).

The new logs print `project=` on every server write and on the browser's bell subscription, which settles (1).

## 2. Changes

| File | Change |
|---|---|
| `app/_lib/server/firebaseAdmin.ts` | Records the project ID at init; new `getAdminProjectId()` export. |
| `app/_lib/server/notifications.ts` | `writeNotification` never throws; logs `bell_write ok` / `bell_write FAILED` with type, path pattern, project, Firestore `code`, message. New `sendNotificationEmail` logs `email ok` / `email SKIPPED reason=...` / `email FAILED code= message=`. Bell and email are now independent (a failed bell write no longer suppresses the email). Designed path: Auth email fallback added in `fetchAllActiveUsers`; `designed ZERO_RECIPIENTS` warning (with active-user count, eligible roles, project); `designed recipients=N withEmail=M` info line. Auth lookup failures are now logged (code only). Removed uid/doc-ID from the old write log. |
| `app/_lib/server/sendEmail.ts` | Returns `{status:"sent"}` or `{status:"skipped",reason:"no_api_key"}`; the missing-key warning now also logs in production and no longer prints the recipient. Resend errors include `name` and `statusCode`. |
| `assign-owner/route.ts` | `void notifyAssignment()` → `after(async () => { await notifyAssignment() })`. Removed the log line that printed the assignee uid. |
| `workflow-status/route.ts` | `void notifyStageDesigned()` → `after(...)`. |
| `NotificationBell.tsx` | Subscription log line also prints the client `project=` (public config, not secret). |

Who is notified: unchanged (assignee for assignment; active owner/admin `users` docs for designed). The only
reach change: an owner/admin with no `email` field on their `users` doc now gets the email via their Auth record.
Before, they got only the bell item.

Error messages are passed through an email-address redactor before logging. No names, emails, content, keys or
IDs are logged by the new lines.

### Why `after()` rather than awaiting
Next 16.2.4 `after()` runs after the response is sent and on Vercel is backed by `waitUntil`, so the function
stays alive until notification work finishes. Response latency is unchanged, and a slow Resend/Firestore call
cannot fail or slow down the assignment / stage change.

## 3. Verification
- `npx tsc --noEmit -p .` → exit 0, no output.
- `npm run lint` → 0 errors, 3 warnings, all pre-existing (identical count on stashed base:
  `SubmissionsList.tsx:213`, `submissionOneDriveSyncServer.ts:214,484`).
- `npm run build` → exit 0.
- Not run against live Firestore/Resend (no local prod creds used).

## 4. Two-minute test
1. Desk → assign any case to yourself (your account must be an active `users` doc, so the email goes to you).
2. Vercel → Project → Logs, filter on `notifications`. Expect, in order:
   - `[assign-owner] notifyAssignment start path=notifications/{uid}/items`
   - `[notifications] bell_write ok type=assigned path=notifications/{uid}/items project=<X>`
     (or `bell_write FAILED ... code=<n> message=...`)
   - `[notifications] email ok type=assigned` (or `email SKIPPED reason=...` / `email FAILED ...`)
3. Browser console on the desk: `[NotificationBell] subscribing ... project=<Y>`.
4. Compare X and Y with the project open in the Firebase console. **X ≠ Y ⇒ cause (1) confirmed.**
5. Optional: move a case to "designed". Expect `designed recipients=N withEmail=M`, then N × `bell_write` and
   N × `email` lines. `designed ZERO_RECIPIENTS ...` means no active owner/admin `users` docs in project X.

## 5. Open / not done
- Designed path `caseRef` still uses `referenceCode || id` instead of `referenceFromId(id)`. Out of scope. It can put a raw
  doc ID in messages, which the cleanup script would delete.
- `assign-owner` already resolves the assignee email but does not pass it to `notifyAssignment`, so there is a
  duplicate lookup. Left as is (the recipient would not change).
- Deployed Firestore rules still unverified (separate open thread). Rules don't affect Admin SDK writes, only the bell read.

## 6. Diff
```diff
diff --git a/app/_components/dashboard/NotificationBell.tsx b/app/_components/dashboard/NotificationBell.tsx
index 5ef8336..0b2c761 100644
--- a/app/_components/dashboard/NotificationBell.tsx
+++ b/app/_components/dashboard/NotificationBell.tsx
@@ -56,7 +56,7 @@ export function NotificationBell() {
   // Real-time listener
   useEffect(() => {
     if (!uid) return;
-    console.log(`[NotificationBell] subscribing uid=${uid} path=notifications/${uid}/items`);
+    console.log(`[NotificationBell] subscribing uid=${uid} path=notifications/${uid}/items project=${db.app.options.projectId ?? "unknown"}`);
     const q = query(
       collection(db, "notifications", uid, "items"),
       orderBy("createdAt", "desc"),
diff --git a/app/_lib/server/firebaseAdmin.ts b/app/_lib/server/firebaseAdmin.ts
index fc07c75..bf758a4 100644
--- a/app/_lib/server/firebaseAdmin.ts
+++ b/app/_lib/server/firebaseAdmin.ts
@@ -5,6 +5,8 @@ import { getAuth, type Auth } from "firebase-admin/auth";
 import { getFirestore, type Firestore } from "firebase-admin/firestore";
 
 let app: App | undefined;
+/** Project ID the Admin SDK was initialised with (not secret; safe to log). */
+let adminProjectId: string | null = null;
 
 /** Preferred on Vercel: full service account JSON, base64-encoded (no PEM newline issues). */
 export const FIREBASE_SERVICE_ACCOUNT_BASE64_ENV = "FIREBASE_SERVICE_ACCOUNT_BASE64";
@@ -136,6 +138,7 @@ function getAdminApp(): App {
   if (process.env.FIRESTORE_EMULATOR_HOST) {
     const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-project";
     console.warn("[firebase-admin] init_credential", { credentialMode: "emulator", projectId });
+    adminProjectId = projectId;
     app = initializeApp({ projectId });
     return app;
   }
@@ -166,6 +169,7 @@ function getAdminApp(): App {
       });
     }
 
+    adminProjectId = fromB64.projectId;
     app = initializeApp({
       credential: cert({
         projectId: fromB64.projectId,
@@ -204,6 +208,7 @@ function getAdminApp(): App {
     });
   }
 
+  adminProjectId = projectId;
   app = initializeApp({
     credential: cert({
       projectId,
@@ -214,6 +219,15 @@ function getAdminApp(): App {
   return app;
 }
 
+/**
+ * Firebase project ID the Admin SDK writes to. Initialises the app if needed.
+ * Falls back to app.options.projectId when the app was created elsewhere.
+ */
+export function getAdminProjectId(): string {
+  const a = getAdminApp();
+  return adminProjectId ?? a.options.projectId ?? "unknown";
+}
+
 export function getAdminAuth(): Auth {
   return getAuth(getAdminApp());
 }
diff --git a/app/_lib/server/notifications.ts b/app/_lib/server/notifications.ts
index 08dee85..420f449 100644
--- a/app/_lib/server/notifications.ts
+++ b/app/_lib/server/notifications.ts
@@ -1,7 +1,7 @@
 import "server-only";
 
 import { FieldValue } from "firebase-admin/firestore";
-import { getAdminAuth, getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
+import { getAdminAuth, getAdminFirestore, getAdminProjectId } from "@/app/_lib/server/firebaseAdmin";
 import { buildEmailHtml, interpolateVars, sendEmail } from "@/app/_lib/server/sendEmail";
 import { applyLocaleToLabels } from "@/app/_lib/i18n/applyLocaleToLabels";
 import { getOrgLabels } from "@/app/_lib/org/getOrgLabels";
@@ -48,15 +48,77 @@ function rolesThatCanTargetStatus(status: CaseStatus): WorkspaceRole[] {
   );
 }
 
-/** Writes one notification doc to notifications/{uid}/items/{auto-id}. */
-async function writeNotification(uid: string, record: Omit<NotificationRecord, "createdAt" | "read">): Promise<void> {
-  const db = getAdminFirestore();
-  const ref = await db
-    .collection("notifications")
-    .doc(uid)
-    .collection("items")
-    .add({ ...record, read: false, createdAt: FieldValue.serverTimestamp() });
-  console.log(`[notifications] wrote ${record.type} notification path=notifications/${uid}/items/${ref.id}`);
+const BELL_PATH_PATTERN = "notifications/{uid}/items";
+
+/** Never let an address slip into logs via a provider error message. */
+function redact(text: string): string {
+  return text.replace(/[^\s@<>"']+@[^\s@<>"']+/g, "<redacted>");
+}
+
+/** Extracts a Firestore/gRPC error code + message without dumping the whole error object. */
+function describeError(e: unknown): { code: string; message: string } {
+  const code =
+    e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "none";
+  const message = e instanceof Error ? e.message : String(e);
+  return { code, message: redact(message) };
+}
+
+function projectIdForLog(): string {
+  try {
+    return getAdminProjectId();
+  } catch {
+    return "uninitialised";
+  }
+}
+
+/**
+ * Writes one notification doc to notifications/{uid}/items/{auto-id}.
+ * Never throws: logs success/failure (path pattern + project only, no IDs) and returns whether it worked.
+ */
+async function writeNotification(
+  uid: string,
+  record: Omit<NotificationRecord, "createdAt" | "read">,
+): Promise<boolean> {
+  try {
+    const db = getAdminFirestore();
+    await db
+      .collection("notifications")
+      .doc(uid)
+      .collection("items")
+      .add({ ...record, read: false, createdAt: FieldValue.serverTimestamp() });
+    console.log(
+      `[notifications] bell_write ok type=${record.type} path=${BELL_PATH_PATTERN} project=${projectIdForLog()}`,
+    );
+    return true;
+  } catch (e) {
+    const { code, message } = describeError(e);
+    console.error(
+      `[notifications] bell_write FAILED type=${record.type} path=${BELL_PATH_PATTERN} project=${projectIdForLog()} code=${code} message=${message}`,
+    );
+    return false;
+  }
+}
+
+/** Sends one email and logs the outcome (never the address or content). Never throws. */
+async function sendNotificationEmail(
+  type: NotificationType,
+  payload: Parameters<typeof sendEmail>[0] | null,
+): Promise<void> {
+  if (!payload) {
+    console.warn(`[notifications] email SKIPPED type=${type} reason=no_recipient_email`);
+    return;
+  }
+  try {
+    const result = await sendEmail(payload);
+    if (result.status === "sent") {
+      console.log(`[notifications] email ok type=${type}`);
+    } else {
+      console.warn(`[notifications] email SKIPPED type=${type} reason=${result.reason}`);
+    }
+  } catch (e) {
+    const { code, message } = describeError(e);
+    console.error(`[notifications] email FAILED type=${type} code=${code} message=${message}`);
+  }
 }
 
 /**
@@ -82,7 +144,10 @@ async function resolveActorName(uid: string, fallbackEmail: string | null): Prom
   return fallbackEmail;
 }
 
-/** Fetches all active workspace users from `users` collection. */
+/**
+ * Fetches all active workspace users from `users` collection.
+ * Email comes from users/{uid}.email, falling back to the Firebase Auth record (same as assignment).
+ */
 async function fetchAllActiveUsers(): Promise<Array<{ uid: string; email: string | null; role: WorkspaceRole }>> {
   const db = getAdminFirestore();
   const snap = await db.collection("users").get();
@@ -96,6 +161,18 @@ async function fetchAllActiveUsers(): Promise<Array<{ uid: string; email: string
       typeof data.email === "string" && data.email.trim() ? data.email.trim() : null;
     results.push({ uid: doc.id, email, role });
   }
+  await Promise.all(
+    results.map(async (r) => {
+      if (r.email) return;
+      try {
+        const u = await getAdminAuth().getUser(r.uid);
+        if (u.email) r.email = u.email;
+      } catch (e) {
+        const { code } = describeError(e);
+        console.warn(`[notifications] auth_email_lookup FAILED code=${code}`);
+      }
+    }),
+  );
   return results;
 }
 
@@ -116,8 +193,9 @@ async function fetchUserEmail(uid: string): Promise<string | null> {
   try {
     const u = await getAdminAuth().getUser(uid);
     if (u.email) return u.email;
-  } catch {
-    /* Auth user lookup failure is non-fatal */
+  } catch (e) {
+    const { code } = describeError(e);
+    console.warn(`[notifications] auth_email_lookup FAILED code=${code}`);
   }
   return null;
 }
@@ -125,7 +203,7 @@ async function fetchUserEmail(uid: string): Promise<string | null> {
 /**
  * Trigger 1: case assigned to a user.
  * Writes one in-app notification for the assignee and sends them an email.
- * Fire-and-forget from the route — errors are logged but never surface to the client.
+ * Runs in the route's after() callback — errors are logged but never surface to the client.
  */
 export async function notifyAssignment(opts: {
   caseId: string;
@@ -144,7 +222,8 @@ export async function notifyAssignment(opts: {
   const message = interpolateVars(nl.assignedBody, vars);
   const actorName = await resolveActorName(actorUid, actorEmail ?? null);
 
-  // In-app notification
+  // In-app bell and email are independent: a failed bell write no longer suppresses the email,
+  // and each outcome is logged separately.
   await writeNotification(assigneeUid, {
     type: "assigned",
     caseId,
@@ -155,31 +234,33 @@ export async function notifyAssignment(opts: {
 
   // Email — use caller-supplied email if already known; otherwise look it up.
   const email = assigneeEmail ?? await fetchUserEmail(assigneeUid);
-  if (email) {
-    const subject = interpolateVars(nl.emailSubjectAssigned, vars);
-    const ctaUrl = `${DASHBOARD_URL}/dashboard`;
-    await sendEmail({
-      to: email,
-      subject,
-      text: `${nl.assignedTitle}\n\n${message}\n\n${ctaUrl}\n\n${nl.emailFooter}`,
-      html: buildEmailHtml({
-        title: nl.assignedTitle,
-        body: message,
-        ctaLabel: nl.emailViewCase,
-        ctaUrl,
-        footer: nl.emailFooter,
-        dir: "rtl",
-        lang: "ar",
-      }),
-    });
-  }
+  const ctaUrl = `${DASHBOARD_URL}/dashboard`;
+  await sendNotificationEmail(
+    "assigned",
+    email
+      ? {
+          to: email,
+          subject: interpolateVars(nl.emailSubjectAssigned, vars),
+          text: `${nl.assignedTitle}\n\n${message}\n\n${ctaUrl}\n\n${nl.emailFooter}`,
+          html: buildEmailHtml({
+            title: nl.assignedTitle,
+            body: message,
+            ctaLabel: nl.emailViewCase,
+            ctaUrl,
+            footer: nl.emailFooter,
+            dir: "rtl",
+            lang: "ar",
+          }),
+        }
+      : null,
+  );
 }
 
 /**
  * Trigger 2: case moved to "designed" stage.
  * Notifies all active workspace users whose role can target the "designed" stage
  * (derived from allowedCaseStatusTargets — currently owner + admin).
- * Fire-and-forget from the route.
+ * Runs in the route's after() callback.
  */
 export async function notifyStageDesigned(opts: {
   caseId: string;
@@ -195,6 +276,15 @@ export async function notifyStageDesigned(opts: {
   const eligibleRoles = new Set(rolesThatCanTargetStatus("designed"));
   const allUsers = await fetchAllActiveUsers();
   const recipients = allUsers.filter((u) => eligibleRoles.has(u.role));
+  if (recipients.length === 0) {
+    console.warn(
+      `[notifications] designed ZERO_RECIPIENTS activeUsers=${allUsers.length} eligibleRoles=${[...eligibleRoles].join(",")} project=${projectIdForLog()}`,
+    );
+    return;
+  }
+  console.log(
+    `[notifications] designed recipients=${recipients.length} withEmail=${recipients.filter((u) => u.email).length}`,
+  );
 
   const message = interpolateVars(nl.designedBody, vars);
   const subject = interpolateVars(nl.emailSubjectDesigned, vars);
@@ -212,25 +302,24 @@ export async function notifyStageDesigned(opts: {
 
   await Promise.all(
     recipients.map(async (u) => {
-      try {
-        await writeNotification(u.uid, {
-          type: "designed",
-          caseId,
-          caseRef,
-          message,
-          actorName,
-        });
-        if (u.email) {
-          await sendEmail({
-            to: u.email,
-            subject,
-            text: `${nl.designedTitle}\n\n${message}\n\n${ctaUrl}\n\n${nl.emailFooter}`,
-            html,
-          });
-        }
-      } catch (e) {
-        console.error(`[notifications] notifyStageDesigned failed for uid=${u.uid}`, e);
-      }
+      await writeNotification(u.uid, {
+        type: "designed",
+        caseId,
+        caseRef,
+        message,
+        actorName,
+      });
+      await sendNotificationEmail(
+        "designed",
+        u.email
+          ? {
+              to: u.email,
+              subject,
+              text: `${nl.designedTitle}\n\n${message}\n\n${ctaUrl}\n\n${nl.emailFooter}`,
+              html,
+            }
+          : null,
+      );
     }),
   );
 }
diff --git a/app/_lib/server/sendEmail.ts b/app/_lib/server/sendEmail.ts
index 87e265f..1ab4714 100644
--- a/app/_lib/server/sendEmail.ts
+++ b/app/_lib/server/sendEmail.ts
@@ -20,18 +20,19 @@ export type EmailPayload = {
   html: string;
 };
 
+export type SendEmailResult = { status: "sent" } | { status: "skipped"; reason: "no_api_key" };
+
 /**
  * Sends a transactional email via Resend.
- * Returns silently on missing API key (useful in dev without credentials).
+ * Returns { status: "skipped" } on missing API key (useful in dev without credentials).
  * Throws on send error so callers can decide whether to swallow it.
+ * Never logs the recipient address.
  */
-export async function sendEmail(payload: EmailPayload): Promise<void> {
+export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
   const resend = getResend();
   if (!resend) {
-    if (process.env.NODE_ENV !== "production") {
-      console.warn("[sendEmail] RESEND_API_KEY not set — skipping email to", payload.to);
-    }
-    return;
+    console.warn("[sendEmail] RESEND_API_KEY not set — email skipped");
+    return { status: "skipped", reason: "no_api_key" };
   }
 
   const { error } = await resend.emails.send({
@@ -43,8 +44,9 @@ export async function sendEmail(payload: EmailPayload): Promise<void> {
   });
 
   if (error) {
-    throw new Error(`Resend error: ${error.message}`);
+    throw new Error(`Resend error name=${error.name} status=${error.statusCode ?? "n/a"}: ${error.message}`);
   }
+  return { status: "sent" };
 }
 
 /** Replaces {ref} placeholder in a label string. */
diff --git a/app/api/admin/submissions/[id]/assign-owner/route.ts b/app/api/admin/submissions/[id]/assign-owner/route.ts
index 2d5f1e2..5fa24b3 100644
--- a/app/api/admin/submissions/[id]/assign-owner/route.ts
+++ b/app/api/admin/submissions/[id]/assign-owner/route.ts
@@ -1,4 +1,4 @@
-import { NextRequest, NextResponse } from "next/server";
+import { NextRequest, NextResponse, after } from "next/server";
 import { FieldValue } from "firebase-admin/firestore";
 import { normalizeWorkspaceRole } from "@/app/_lib/rbac";
 import { canAssignItem } from "@/app/_lib/workflow/permissions";
@@ -101,7 +101,7 @@ export async function POST(request: NextRequest, context: RouteParams) {
       /* audit failure must not block assignment */
     }
 
-    // Notify the assignee — fire-and-forget; never blocks assignment response.
+    // Notify the assignee — via after(); never blocks or fails the assignment response.
     // Always derive caseRef from the doc ID via referenceFromId — the mobile app never
     // writes a referenceCode field, so the Firestore field can contain the raw doc ID
     // (set by earlier pipeline versions). referenceFromId is the dashboard's canonical
@@ -109,10 +109,17 @@ export async function POST(request: NextRequest, context: RouteParams) {
     const caseRef = referenceFromId(id);
     const workspaceCase = normalizeSubmissionToCase(id, subSnap.data() ?? {});
     const caseTitle = workspaceCase.title.trim() || undefined;
-    console.log(`[assign-owner] notifyAssignment uid=${uid} path=notifications/${uid}/items`);
-    void notifyAssignment({ caseId: id, caseRef, caseTitle, assigneeUid: uid, actorUid: admin.uid, actorEmail: admin.adminEmail }).catch((e) =>
-      console.error("[notifications] notifyAssignment failed", e),
-    );
+    // after(): runs once the response is sent, but Vercel keeps the function alive until it
+    // finishes (waitUntil), so the bell write and email can no longer be cut off by a freeze.
+    after(async () => {
+      console.log("[assign-owner] notifyAssignment start path=notifications/{uid}/items");
+      try {
+        await notifyAssignment({ caseId: id, caseRef, caseTitle, assigneeUid: uid, actorUid: admin.uid, actorEmail: admin.adminEmail });
+      } catch (e) {
+        const msg = e instanceof Error ? e.message : String(e);
+        console.error(`[notifications] notifyAssignment failed message=${msg.replace(/[^\s@]+@[^\s@]+/g, "<redacted>")}`);
+      }
+    });
 
     // Refresh OneDrive DOCX with assignment changelog entry — fire-and-forget.
     void refreshSubmissionDocxInOneDrive(id, {
diff --git a/app/api/admin/submissions/[id]/workflow-status/route.ts b/app/api/admin/submissions/[id]/workflow-status/route.ts
index 3221f8f..e6fdaac 100644
--- a/app/api/admin/submissions/[id]/workflow-status/route.ts
+++ b/app/api/admin/submissions/[id]/workflow-status/route.ts
@@ -1,4 +1,4 @@
-import { NextRequest, NextResponse } from "next/server";
+import { NextRequest, NextResponse, after } from "next/server";
 import { FieldValue } from "firebase-admin/firestore";
 import type { CaseStatus } from "@/app/_lib/caseWorkspaceModel";
 import { normalizeCaseStatus } from "@/app/_lib/caseWorkspaceModel";
@@ -119,7 +119,7 @@ export async function POST(request: NextRequest, context: RouteParams) {
       /* audit failure must not block */
     }
 
-    // Notify all eligible users when a case reaches the designed stage — fire-and-forget.
+    // Notify all eligible users when a case reaches the designed stage — via after(), never blocks the response.
     if (target === "designed") {
       const caseRef =
         typeof workspaceCase.referenceCode === "string" && workspaceCase.referenceCode.trim()
@@ -129,9 +129,15 @@ export async function POST(request: NextRequest, context: RouteParams) {
         typeof workspaceCase.title === "string" && workspaceCase.title.trim()
           ? workspaceCase.title.trim()
           : undefined;
-      void notifyStageDesigned({ caseId: id, caseRef, caseTitle, actorUid: admin.uid, actorEmail: admin.adminEmail }).catch((e) =>
-        console.error("[notifications] notifyStageDesigned failed", e),
-      );
+      after(async () => {
+        console.log("[workflow-status] notifyStageDesigned start");
+        try {
+          await notifyStageDesigned({ caseId: id, caseRef, caseTitle, actorUid: admin.uid, actorEmail: admin.adminEmail });
+        } catch (e) {
+          const msg = e instanceof Error ? e.message : String(e);
+          console.error(`[notifications] notifyStageDesigned failed message=${msg.replace(/[^\s@]+@[^\s@]+/g, "<redacted>")}`);
+        }
+      });
     }
 
     // Mirror the stage change in OneDrive (move existing file, or upload fresh).
```
