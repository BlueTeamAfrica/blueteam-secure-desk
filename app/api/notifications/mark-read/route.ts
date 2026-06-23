import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";

/**
 * POST /api/notifications/mark-read
 * Body: { notificationIds: string[] }
 *
 * Marks the authenticated user's notifications as read.
 * Uses Admin SDK — no client writes to the notifications collection.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const ids = (body as { notificationIds?: unknown }).notificationIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "notificationIds must be a non-empty array" }, { status: 400 });
    }
    const validIds = ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    if (validIds.length === 0) {
      return NextResponse.json({ error: "No valid notification IDs" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const itemsRef = db.collection("notifications").doc(admin.uid).collection("items");

    // Batch write — Firestore limit is 500 per batch; notifications volume is low
    const batch = db.batch();
    for (const id of validIds.slice(0, 500)) {
      batch.update(itemsRef.doc(id), { read: true });
    }
    await batch.commit();

    return NextResponse.json({ ok: true, marked: validIds.length });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
