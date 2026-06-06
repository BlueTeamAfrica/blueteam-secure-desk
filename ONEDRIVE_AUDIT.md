# ONEDRIVE_AUDIT.md — Submission Flow Reference

> Last updated 2026-06-06. Pull-sync removed in Thread 7+.

---

## 1. CaseStatus Values (canonical definition)

File: `app/_lib/caseWorkspaceModel.ts`

```ts
type CaseStatus = "incoming" | "raw" | "first_edit" | "second_edit" | "in_review" | "reviewed" | "designed"
```

`normalizeCaseStatus()` reads `data.caseStatus` first, falls back to `data.processingStatus`.

---

## 2. stageFolderMap — factsd (Sudan Facts / Atar)

File: `app/_lib/org/configs/factsd.ts`

| CaseStatus key | OneDrive folder name |
|---|---|
| `incoming` | `"incoming"` |
| `raw` | `"raw"` |
| `first_edit` | `"first edit"` |
| `second_edit` | `"second edit"` |
| `in_review` | `"in_review"` |
| `reviewed` | `"reviewed"` |
| `designed` | `"designed"` |

Root folder: `"SecureDesk-Test"` (personal test OneDrive — not production)
Production value (pending): `"Atar Editorial/Editorial - Arabic"`

---

## 3. OneDrive Function Triggers

### `pushSubmissionToOneDrive(submissionId, { force? })`
| Trigger | File |
|---|---|
| POST `/api/admin/onedrive/push-submission` (manual) | `app/api/admin/onedrive/push-submission/route.ts` |
| `onSnapshot` docChange `"added"` in SubmissionsList (owner/admin only, fire-and-forget) | `app/(dashboard)/dashboard/SubmissionsList.tsx` |
| Fallback inside `refreshSubmissionDocxInOneDrive` when no `onedriveItemId` | `submissionOneDriveSyncServer.ts` |

---

### `moveSubmissionToStageInOneDrive(submissionId, toStatus, actor)`
| Trigger | File |
|---|---|
| POST `/api/admin/submissions/[id]/workflow-status` — stage change | `app/api/admin/submissions/[id]/workflow-status/route.ts` |

Creates a fresh subfolder in the destination stage via `createStageFolder`. Uploads metadata DOCX (status-correct) and DOCX attachments only. Original `incoming/` folder is never modified after initial upload.

---

### `refreshSubmissionDocxInOneDrive(submissionId, lastChangedBy?)`
| Trigger | File | lastChangedBy? |
|---|---|---|
| POST `/api/admin/submissions/[id]/assign-owner` | `assign-owner/route.ts` | Yes (fire-and-forget) |
| POST `/api/admin/submissions/[id]/priority` | `priority/route.ts` | Yes (fire-and-forget) |
| POST `/api/admin/submissions/[id]/refresh-onedrive-docx` (manual) | `refresh-onedrive-docx/route.ts` | No |

---

### `pullSyncFromOneDrive`

**Removed.** Pull-sync eliminated as of Thread 7. All stage changes originate from the dashboard via `workflow-status`. The bidirectional OneDrive→dashboard direction is no longer supported.

---

## 4. Firestore OneDrive Tracking Fields

| Field | Set by | Cleared by | Notes |
|---|---|---|---|
| `onedriveItemId` | `pushSubmissionToOneDrive`, `moveSubmissionToStageInOneDrive` | — | Graph item ID of current stage subfolder |
| `onedriveFilename` | Same | — | Subfolder name (report title or case ref) |
| `onedriveWebUrl` | Same | — | Browser link to OneDrive folder |
| `onedriveDocxFilename` | `pushSubmissionToOneDrive`, `moveSubmissionToStageInOneDrive` | — | Exact DOCX filename for overwrite targeting |
| `onedriveChangeLog` | `moveSubmissionToStageInOneDrive`, `refreshSubmissionDocxInOneDrive` | — | `arrayUnion` append only |
| `onedriveLastSyncedAt` | Every sync/refresh | — | Server timestamp |

---

## 5. caseStatus / processingStatus Write Locations

### Written together (consistent)
| File | Context |
|---|---|
| `workflow-status/route.ts` lines 96–97 | Main stage change: `caseStatus: target`, `processingStatus: PROCESSING_FOR_CASE_STATUS[target]` |
| `reviewer-action/route.ts` lines 82–88 | `mark_in_review` → both `"in_review"`; `mark_verified` → both `"reviewed"` |

### Never written separately
Pull-sync (which previously wrote both fields) has been removed.

---

## 6. Attachment Rule

`pushSubmissionToOneDrive` (initial upload): all attachments uploaded to `incoming/CASE-XYZ/`.

`createStageFolder` (every stage move): **DOCX attachments only** — files matching mimeType `application/vnd.openxmlformats-officedocument.wordprocessingml.document` or `.docx` extension. PDFs and all other files stay in `incoming/`.
