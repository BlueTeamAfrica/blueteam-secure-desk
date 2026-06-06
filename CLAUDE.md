# Project: secure-reporter-dashboard
## Purpose
Next.js admin dashboard for managing secure reporter submissions. Admins review, decrypt, assign, and manage encrypted case submissions from the reporter mobile app. Multi-tenant workspace support (default: Sudan Facts / Atar `factsd`; also `demoNgo`).

## Stack
- Next.js (App Router)
- Auth: Firebase Auth (admin accounts only) via `requireActiveAdmin` middleware
- Database: Firestore
- Storage: Supabase (signed attachment download URLs, server-only)
- Encryption: AES-256-CBC decryption (server-only) — key must match reporter app
- Hosting: Vercel

## Commands
```bash
npm run dev          # generate editorial manifest, then start Next.js dev server
npm run build        # generate editorial manifest, then production build
npm run lint         # ESLint
npm run seed:workspace-owner  # seed Firestore users/{uid} with role=owner for a given email
```
No test runner — lint and build are primary verification steps.

## Environment Variables
Copy `.env.example` to `.env.local`. Required:
```
NEXT_PUBLIC_FIREBASE_*                  # Firebase web app config (client-safe)
FIREBASE_SERVICE_ACCOUNT_BASE64         # Preferred: base64 of full service-account JSON (avoids PEM newline issues on Vercel)
# If absent, fallback to legacy trio:
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

SUBMISSION_PAYLOAD_SECRET               # AES-256-CBC key — must match EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET in reporter app
SUPABASE_URL=                           # server-only
SUPABASE_SERVICE_ROLE_KEY=              # server-only
SUPABASE_BUCKET=                        # server-only
NEXT_PUBLIC_WORKSPACE_CONFIG_ID=        # "demoNgo" for demo tenant; omit/blank for default "factsd" (Sudan Facts / Atar)
```

## Multi-Tenant Workspace Config
- All copy, branding, workflow stages, and integration settings live in a `WorkspaceConfig` object
- Selected at boot via `NEXT_PUBLIC_WORKSPACE_CONFIG_ID`
- Two configs: `factsd` (default — Sudan Facts / Atar) and `demoNgo`
- Selector: `app/_lib/org/getWorkspaceConfig.ts`
- Adding a new tenant: create config in `app/_lib/org/configs/` and add branch to `getWorkspaceConfig`

## Auth Flow
`AuthContext` (`app/_components/auth/AuthContext.tsx`) manages full auth lifecycle:
1. Firebase client SDK detects sign-in state
2. Checks `adminUsers/{uid}.active === true` in Firestore — only active admins proceed
3. Loads workspace role from `/api/me` (server-verified) with fallback to `users/{uid}` client Firestore read
4. Resolves to: `loading` | `signedOut` | `signedInButUnauthorized` | `signedInNoRole` | `signedInWorkspace`

## API Route Authentication
- `app/api/admin/*` — calls `requireActiveAdmin` (`app/_lib/server/adminApiAuth.ts`): verifies Firebase ID token via Admin SDK + checks `adminUsers/{uid}.active`
- `app/api/workspace/*` — uses `userApiAuth`: token check only, no admin gate

## RBAC
`app/_lib/rbac.ts` defines five roles: `owner`, `admin`, `reviewer`, `intake`, `readonly`
Permission helpers: `mayAssignInUi`, `canAssignCasesInWorkspace`, `allowedCaseStatusTargets`, etc.
Both API routes and UI components import from here — keep permission logic centralized, never duplicate it.

## Data Model
`app/_lib/caseWorkspaceModel.ts` is the central domain model:
- Defines `WorkspaceCase` (normalized case shape), `CaseStatus`, `PriorityLevel`
- All normalization helpers: `normalizeSubmissionToCase`, `normalizeCaseStatus`, etc.
- Firestore `submissions` docs are raw and may carry legacy field names — all normalization goes here, not in components

## Firestore Collections
- `submissions` — encrypted case documents. Status in `caseStatus` (preferred) or `processingStatus` (legacy)
- `adminUsers/{uid}` — `{ active: true }` gates dashboard access
- `users/{uid}` — workspace role document `{ role: WorkspaceRole }`

## Payload Decryption
- Server-only: `app/_lib/server/decryptEncryptedPayload.ts`
- Key derived as `SHA256(secret)`, IV as `MD5("iv:" + secret)` — must match reporter app encryption scheme exactly
- API route: `app/api/admin/submissions/[id]/decrypt/route.ts`
- `SUBMISSION_PAYLOAD_SECRET` must match `EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET` in reporter app — never change independently

## Routing
Two parallel routing trees:
- `app/(dashboard)/` — main dashboard shell (sidebar + topbar + `CaseQueueProvider`)
- `app/dashboard/` and `app/sudanfacts/` — tenant-specific route segments that re-export the shared layout
- Root `app/page.tsx` redirects to `/dashboard`
- Auth redirects handled client-side inside `app/(dashboard)/layout.tsx`

## Integrations / Export
- Adapters: `app/_lib/integrations/`
- Active adapter resolved from workspace config `integrations.exportProvider` via `app/_lib/integrations/registry.ts`
- Supported providers: `oneDrive`, `manualDownload`, `googleDrive` (stub), `disabled`

## Editorial Image Manifest
- `public/editorial/` holds branding images
- `scripts/generate-editorial-manifest.mjs` generates manifest consumed by `app/_lib/editorialImageManifest.ts`
- Runs automatically before `dev` and `build`

## Relation to Other Projects
- **Paired with `secure-reporter-app`** — reporters submit via mobile app, admins manage here
- Shared Firebase project with app
- `SUBMISSION_PAYLOAD_SECRET` must match `EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET` in app — coordinate before any change
- Read `secure-reporter-shared/SHARED_CONTEXT.md` for auth contracts and Firestore rules status
- Note: this dashboard is also the Sudan Facts / Atar submission management tool (`factsd` config)

## Open Threads
- [x] Firestore rules committed — `firestore.rules` (+ `firebase.json`, `firestore.indexes.json`) added to repo (2026-06-04)
- [ ] Deploy rules to production: `firebase deploy --only firestore:rules` — need `.firebaserc` pointing to `sudanfcts-reporting`
- [ ] Verify Vercel env: use `/api/admin/debug/auth-check` (non-prod) to confirm `projectsMatch: true` before debugging 401s further
- [ ] After rules deployed + env confirmed: full auth flow test — login → dashboard access → submission decryption → attachment download
- [ ] Verify `adminUsers/{uid}.active` is correctly set for all admin accounts in production

## Key Conventions
- `requireActiveAdmin` must be enforced on every protected route — never relax without explicit review
- Firestore rules must be committed AND deployed before testing — never test against uncommitted rules
- All normalization of Firestore documents goes in `caseWorkspaceModel.ts` — never in components
- Permission logic stays in `rbac.ts` — never duplicate in components or API routes
- Decryption is server-only — never move decryption logic to client side
- Coordinate any encryption key or Firestore rules changes with `secure-reporter-app`
- Blueprints before coding — especially for auth middleware, RBAC, and decryption

## Do Not Touch
- `requireActiveAdmin` without reading `SHARED_CONTEXT.md` first
- `decryptEncryptedPayload.ts` without coordinating with reporter app encryption scheme
- `rbac.ts` permission logic without reviewing all callers first
- `SUBMISSION_PAYLOAD_SECRET` without simultaneous update on app side
- Firestore rules without committing and updating `SHARED_CONTEXT.md` open threads

## Session Start Checklist
1. Read this file
2. Read `secure-reporter-shared/SHARED_CONTEXT.md`
3. Read `MASTER_HANDOVER.md` — core sections only (stop at `## Extended project reference`).
   Load extended sections only if this session targets: secure-reporter-app contracts, blueteam-portal, blueteamafrica, or cross-project planning.
4. For cross-project context, decisions log, and working rules: read relevant files in `~/Documents/blueteam-brain/`
   - `INDEX.md` — project map and quick reference
   - `RULES.md` — non-negotiable working rules
   - `DECISIONS.md` — technical decisions log
   - `projects/secure-desk.md` — current state and open threads
   - `systems/onedrive.md` — OneDrive integration reference
5. Also check `@AGENTS.md` if it exists in the repo root
6. State which open thread you are targeting before writing any code

## Corrections
- [Date] — [mistake Claude made] → [correct approach]
