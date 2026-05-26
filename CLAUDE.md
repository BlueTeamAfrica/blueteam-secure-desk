# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # generate editorial manifest, then start Next.js dev server
npm run build        # generate editorial manifest, then production build
npm run lint         # ESLint
npm run seed:workspace-owner  # seed Firestore users/{uid} with role=owner for a given email
```

No test runner is configured. Lint and build serve as the primary verification steps.

## Environment

Copy `.env.example` to `.env.local` and fill in all values before running locally. Required variables:

- `NEXT_PUBLIC_FIREBASE_*` — Firebase web app config (client-safe).
- `FIREBASE_SERVICE_ACCOUNT_BASE64` — preferred credential for Firebase Admin SDK (base64 of full service-account JSON; avoids PEM newline issues on Vercel). If absent, the legacy trio `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` is used instead.
- `SUBMISSION_PAYLOAD_SECRET` — AES-256-CBC key shared with the reporter mobile app; must match `SUBMISSION_PAYLOAD_SECRET` on the intake side.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` — server-only; used for signed attachment download URLs.
- `NEXT_PUBLIC_WORKSPACE_CONFIG_ID` — set to `demoNgo` to activate the demo tenant config; omit or leave blank for the default `factsd` (Sudan Facts / Atar) config.

## Architecture

### Multi-tenant workspace config

All copy, branding, workflow stages, and integration settings live in a single `WorkspaceConfig` object selected at boot time via `NEXT_PUBLIC_WORKSPACE_CONFIG_ID`. Two configs exist: `factsd` (default) and `demoNgo`. The selector is `app/_lib/org/getWorkspaceConfig.ts`. Adding a new tenant means creating a config file in `app/_lib/org/configs/` and adding a branch to `getWorkspaceConfig`.

### Data model

`app/_lib/caseWorkspaceModel.ts` is the central domain model. It defines `WorkspaceCase` (the normalized case shape), `CaseStatus`, `PriorityLevel`, and all normalization helpers (`normalizeSubmissionToCase`, `normalizeCaseStatus`, etc.). Firestore documents from the `submissions` collection are raw and may carry legacy field names — all normalization goes here, not in components.

### Auth flow

`AuthContext` (`app/_components/auth/AuthContext.tsx`) manages the full auth lifecycle:
1. Firebase client SDK detects sign-in state.
2. Checks `adminUsers/{uid}.active === true` in Firestore — only active admin users proceed.
3. Loads the user's workspace role from `/api/me` (server-verified) with a fallback to `users/{uid}` client Firestore read.
4. Resolves to one of: `loading` | `signedOut` | `signedInButUnauthorized` | `signedInNoRole` | `signedInWorkspace`.

### API route authentication

Every route under `app/api/admin/` calls `requireActiveAdmin` (`app/_lib/server/adminApiAuth.ts`), which verifies the Firebase ID token via the Admin SDK and then checks `adminUsers/{uid}.active`. Routes under `app/api/workspace/` use `userApiAuth` which only checks the token (no admin gate).

### Firestore collections (accessed by this dashboard)

- `submissions` — encrypted case documents. Status lives in `caseStatus` (preferred) or `processingStatus` (legacy).
- `adminUsers/{uid}` — `{ active: true }` gates dashboard access.
- `users/{uid}` — workspace role document `{ role: WorkspaceRole }`.

### Payload decryption

Submission bodies are AES-256-CBC encrypted. Decryption is server-only (`app/_lib/server/decryptEncryptedPayload.ts`). The key is derived as `SHA256(secret)` and the IV as `MD5("iv:" + secret)` — this must match the reporter app's encryption scheme. The relevant API route is `app/api/admin/submissions/[id]/decrypt/route.ts`.

### RBAC

`app/_lib/rbac.ts` defines five roles: `owner`, `admin`, `reviewer`, `intake`, `readonly`. Permission helpers (`mayAssignInUi`, `canAssignCasesInWorkspace`, `allowedCaseStatusTargets`, etc.) are all in this file. Both API routes and UI components import from here — keep permission logic centralized.

### Routing

Two parallel routing trees exist:
- `app/(dashboard)/` — the main dashboard shell (sidebar + topbar + `CaseQueueProvider`).
- `app/dashboard/` and `app/sudanfacts/` — tenant-specific route segments that re-export the shared layout.

The root `app/page.tsx` redirects to `/dashboard`. Auth redirects are handled client-side inside `app/(dashboard)/layout.tsx`.

### Integrations / export

Export adapters live under `app/_lib/integrations/`. The active adapter is resolved from the workspace config's `integrations.exportProvider` via `app/_lib/integrations/registry.ts`. Supported providers: `oneDrive`, `manualDownload`, `googleDrive` (stub), `disabled`.

### Editorial image manifest

`public/editorial/` holds branding images. `scripts/generate-editorial-manifest.mjs` generates a manifest consumed by `app/_lib/editorialImageManifest.ts`. This script runs automatically before `dev` and `build`.
