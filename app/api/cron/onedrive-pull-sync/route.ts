import { NextRequest, NextResponse } from "next/server";
import { pullSyncFromOneDrive } from "@/app/_lib/server/submissionOneDriveSyncServer";

export const runtime = "nodejs";

/**
 * GET /api/cron/onedrive-pull-sync
 *
 * Vercel Cron job — runs on the schedule defined in vercel.json.
 * Protected by CRON_SECRET (set in Vercel env vars; Vercel injects it
 * automatically as the Authorization header for cron invocations).
 *
 * Pulls stage changes from OneDrive → Firestore:
 * reads all stage folders, finds mismatches with stored caseStatus, updates.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Allow unauthenticated calls only in local dev (no secret configured).
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pullSyncFromOneDrive();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Pull sync failed.";
    console.error("[onedrive-pull-sync cron]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
