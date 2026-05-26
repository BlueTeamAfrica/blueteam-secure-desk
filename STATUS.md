# Secure Reporter — Dashboard (Blue Team Secure Desk)
**Last updated:** 2026-05-20
**Repo:** BlueTeamAfrica/blueteam-secure-desk
**Working with:** Claude Code

---

## What this project is

The newsroom/editorial dashboard for the Secure Reporter system. Staff decrypt incoming submissions, manage case workflow, assign cases, add notes, export to DOCX, and download attachments via signed URLs. Default workspace is configured for Atar/Sudan Facts (`factsd` config). A `demoNgo` config also exists for demos.

Built by Blue Team Africa. This is the server-side counterpart to the mobile reporter app — the only place decrypted content should ever appear.

---

## Platform & Setup

- **Stack:** Next.js 16 (App Router), React 19, Firebase client + Admin, Supabase (service role, server-only), `docx`, ESLint 9
- **WARNING:** This is Next.js 16 — APIs differ from older versions. Read `node_modules/next/dist/docs/` before writing code (per AGENTS.md)
- **Hosting:** Vercel, GitHub `BlueTeamAfrica/blueteam-secure-desk`
- **RBAC:** 5 roles — owner, admin, reviewer, intake, readonly (all logic in `app/_lib/rbac.ts`)
- **Multi-tenant:** Workspace config selected via `NEXT_PUBLIC_WORKSPACE_CONFIG_ID` (`factsd` or `demoNgo`)

---

## What's built

- Full dashboard shell: sidebar, case queue, KPI cards, activity feed
- Auth: Firebase email/password, `adminUsers/{uid}.active` gate, role from `/api/me`
- Server-only decrypt: `app/api/admin/submissions/[id]/decrypt/route.ts`
- Case model centralized in `app/_lib/caseWorkspaceModel.ts` — all normalization goes here
- Export: DOCX, manual download
- Firebase Admin via `FIREBASE_SERVICE_ACCOUNT_BASE64` (Vercel-safe base64 encoding)
- Production hardening: decrypt diagnostics, 401 handling, base64 service account (May 2026)
- Branded routes: `/dashboard` and `/sudanfacts` (both use same shell, no duplicated logic)

---

## Active issues

### 401 debug code still in production
Temporary debug responses were added to `requireActiveAdmin` to diagnose auth failures. These need to be removed once confirmed stable.

### Firestore rules not in repo
`firestore.rules` for the Secure Reporter Firebase project was never committed to this repo. Production security cannot be verified from git alone. Should be added and documented.

### Branding source of truth unclear
Branding can come from static workspace config OR a Firestore `settings/branding` document. There was a bug where Firestore doc was missing causing fallback "Workspace" labels. Confirm which is the production source of truth and document it.

---

## Critical rules

- **Never decrypt on client side** — all decryption is server-only
- **`SUBMISSION_PAYLOAD_SECRET` must match** the reporter app's `EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET` exactly
- **Do not touch the reporter app** when working on dashboard-only tasks — they are separate repos and separate concerns
- **Do not commit unless Mohamed explicitly asks**
- **Encryption scheme:** AES-256-CBC, key = SHA256(secret), IV = MD5("iv:"+secret) — must mirror mobile app exactly

---

## Key files

| File | Purpose |
|---|---|
| `app/_lib/org/configs/factsd.ts` | Atar/Sudan Facts workspace config |
| `app/_lib/caseWorkspaceModel.ts` | All case normalization |
| `app/_lib/rbac.ts` | All permission logic |
| `app/_lib/server/decryptEncryptedPayload.ts` | Decryption (server only) |
| `app/_components/auth/AuthContext.tsx` | Auth lifecycle |
| `MASTER_HANDOVER.md` | Full project history from Cursor migration |

---

## What's next

1. Remove temporary 401 debug responses from `requireActiveAdmin`
2. Add `firestore.rules` to repo
3. Confirm branding source of truth (static config vs Firestore doc)
4. Decide on OneDrive export — currently configured but disabled in `factsd`
