# Phase: desk-download

Date: 2026-11-08 · Branch: `fix/attachment-download-name` · Nothing pushed, nothing deployed.

## 1. Update and check

- `git fetch`: origin/main has **no commits** this copy lacks (local main == origin/main == `dde0837`, 2026-10-10).
- `fix/attachment-download-name` (`22e0b08`) is pushed to origin but **not merged** into origin/main.
  Branch diff vs main: `app/_lib/attachments/downloadFileName.ts` (+21), download route (+10/-1).
- `npm ci`: succeeded. npm warned that install scripts for protobufjs, sharp, unrs-resolver were not run
  (npm install-scripts policy). tsc/lint unaffected.
- `tsc --noEmit`: 0 errors. `npm run lint`: 0 errors, 3 warnings, all pre-existing, none from this branch:
  - `app/(dashboard)/dashboard/SubmissionsList.tsx:213` unused `totalActive`
  - `app/_lib/server/submissionOneDriveSyncServer.ts:214` unused `buildFileDrivePath`
  - `app/_lib/server/submissionOneDriveSyncServer.ts:484` unused `onedriveFilename`
- Nothing needed fixing.

## 2. Diagnosis: "Could not generate download URL"

### Where the string comes from
Only one place: the download route, when `createSignedUrl` returns an `error` or no `signedUrl`.
Missing env vars do NOT produce this string: `getSupabaseAdmin()` throws, the outer catch returns
"Internal server error". So the deployed function *has* all three Supabase vars set (non-empty), and Supabase
(or the network) rejected the sign request.

### The branch is not the cause
- The branch only adds `{ download: name }`. In storage-js 2.104.0 the `download` option is appended to the
  returned URL client-side **after** the POST `/object/sign/<path>`; it is never sent to Supabase, so it cannot
  make signing fail.
- The branch is not merged; unless Vercel is serving a preview of it, production runs main's code anyway.

### Local .env.local
| Item | Found | Expected | Match |
|---|---|---|---|
| SUPABASE_URL project ref | `example` | `vajbmxdqetwpdnyiqfux` | no |
| SUPABASE_BUCKET | `reports` | `report-attachments` | no |
| SUPABASE_SERVICE_ROLE_KEY | present, 5 chars, not a JWT/`sb_secret_` | real service-role key | no (placeholder) |

All three are placeholders (but differ from `.env.example`). Local copy cannot reach the real project.

### Probe
Script: `/tmp/claude-1000/-home-eldaby-Documents-secure-reporter-shared-blueteam-secure-desk/e73c155c-7ac6-49eb-b2fa-b98badca836c/scratchpad/probe-supabase.cjs`
(outside repo; same `createClient` options as `supabaseAdmin.ts`; walks folders newest-first, signs one object
with and without an Arabic download name; prints only OK/FAIL + message/status).
Result with local env: `LIST FAIL depth=0 message="fetch failed" status=?` — expected with a placeholder URL.
**The real-project test was not performed.** Run it with real values:

    node <scratchpad>/probe-supabase.cjs /home/eldaby/Documents/secure-reporter-shared/blueteam-secure-desk <env-file-with-real-values>

### What it means / what to check in Vercel (Production env, and Preview if editors use a preview URL)
Signing fails for every attachment, including fresh ones (2026-11-07 15:29) ⇒ systematic config issue, not data.
Check, in order:
1. `SUPABASE_URL` — must be `https://vajbmxdqetwpdnyiqfux.supabase.co` (no trailing path, not another project).
2. `SUPABASE_BUCKET` — must be exactly `report-attachments` (wrong bucket ⇒ "Bucket not found"/"Object not found").
3. `SUPABASE_SERVICE_ROLE_KEY` — must be the **service_role / sb_secret_** key of that same project, not the
   anon/publishable key (anon ⇒ RLS denies signing) and not a key from another project ("Invalid JWT"/signature error).
   If the project's legacy JWT keys were rotated/disabled, a stored legacy key would now fail.
4. After any change, **redeploy** — Vercel env changes only apply to new deployments.
Also confirm the reporter app (`secure-reporter-app`) uploads to that same project/bucket.

Once the new log line is deployed, Vercel function logs show `[attachment-download] createSignedUrl failed`
with message/status, which disambiguates: 400 "Object not found"/404 ⇒ bucket or path mismatch;
400/403 "Invalid JWT"/"signature verification failed" ⇒ wrong key; 403 RLS ⇒ anon key; "fetch failed" ⇒ bad URL.

## 3. Logging change

Commit `c478801` on `fix/attachment-download-name` (not pushed). tsc 0 errors, lint 0 errors / same 3 warnings.
Logs `message` (string only), `status`, `statusCode`, and `noSignedUrl` flag. No path, name or key.

```diff
diff --git a/app/api/admin/submissions/[id]/attachments/[attachmentId]/download/route.ts b/app/api/admin/submissions/[id]/attachments/[attachmentId]/download/route.ts
index bda701b..65c656c 100644
--- a/app/api/admin/submissions/[id]/attachments/[attachmentId]/download/route.ts
+++ b/app/api/admin/submissions/[id]/attachments/[attachmentId]/download/route.ts
@@ -70,6 +70,14 @@ export async function GET(request: NextRequest, context: RouteParams) {
       );
 
     if (error || !data?.signedUrl) {
+      // Message + status only: never the storage path, file name or key.
+      const e = error as { message?: unknown; status?: unknown; statusCode?: unknown } | null;
+      console.error("[attachment-download] createSignedUrl failed", {
+        message: typeof e?.message === "string" ? e.message : null,
+        status: e?.status ?? null,
+        statusCode: e?.statusCode ?? null,
+        noSignedUrl: !error,
+      });
       return NextResponse.json({ error: "Could not generate download URL" }, { status: 500 });
     }
 
```

## Decisions / risks / not verified
- Push not done: a push to this branch may trigger a Vercel preview deployment, and the brief said do not deploy.
- Supabase error messages for storage are generic ("Object not found", "Invalid JWT"); not observed to include
  paths, but not guaranteed by the library.
- The outer `catch` (returns "Internal server error") still logs nothing; out of scope.
- Not verified: real-project listing/signing; Vercel env values; which commit Vercel production runs.
