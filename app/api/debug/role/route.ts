import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { getAdminFirestore, getAdminProjectId } from "@/app/_lib/server/firebaseAdmin";

type Redacted = unknown;

function redactSecrets(value: unknown, depth = 0): Redacted {
  if (depth > 8) return "[Truncated]";
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (typeof value !== "object") return String(value);

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/token|secret|private|key|password/i.test(k)) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redactSecrets(v, depth + 1);
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;

    const { uid, adminEmail } = auth.admin;
    const db = getAdminFirestore();

    const usersPath = `users/${uid}`;
    const adminUsersPath = `adminUsers/${uid}`;

    const [userSnap, adminSnap] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("adminUsers").doc(uid).get(),
    ]);

    return NextResponse.json({
      firebaseAdmin: {
        projectId: getAdminProjectId(),
      },
      auth: {
        uid,
        email: adminEmail,
      },
      checks: {
        users: {
          path: usersPath,
          exists: userSnap.exists,
          data: userSnap.exists ? redactSecrets(userSnap.data()) : null,
        },
        adminUsers: {
          path: adminUsersPath,
          exists: adminSnap.exists,
          data: adminSnap.exists ? redactSecrets(adminSnap.data()) : null,
        },
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

