"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/_lib/firebase/firestore";
import { getFirebaseAppOrNull } from "@/app/_lib/firebase/client";

type DebugFetchState =
  | { status: "idle" | "loading" }
  | { status: "loaded"; data: unknown }
  | { status: "error"; error: string };

function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[Truncated]";
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (typeof value !== "object") return String(value);

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/token|secret|private|key|password/i.test(k)) out[k] = "[REDACTED]";
    else out[k] = redactSecrets(v, depth + 1);
  }
  return out;
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unknown error";
}

function DebugStateView({ state }: { state: DebugFetchState }) {
  switch (state.status) {
    case "idle":
    case "loading":
      return <div className="subtext">Loading…</div>;
    case "error":
      return (
        <div className="subtext">
          Error: <code className="inline-code">{state.error}</code>
        </div>
      );
    case "loaded":
      return <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>{JSON.stringify(state.data, null, 2)}</pre>;
  }
}

export function RoleNotAssignedDebug({ user }: { user: User }) {
  const [serverState, setServerState] = useState<DebugFetchState>({ status: "idle" });
  const [clientState, setClientState] = useState<DebugFetchState>({ status: "idle" });

  const firebaseClientProjectId = useMemo(() => {
    try {
      return getFirebaseAppOrNull()?.options?.projectId ?? null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setServerState({ status: "loading" });
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/debug/role", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            typeof json === "object" && json !== null && "error" in json && typeof (json as { error?: unknown }).error === "string"
              ? (json as { error: string }).error
              : `Request failed (${res.status})`;
          throw new Error(msg);
        }
        if (!cancelled) setServerState({ status: "loaded", data: redactSecrets(json) });
      } catch (e) {
        if (!cancelled) setServerState({ status: "error", error: safeErrorMessage(e) });
      }
    })();

    void (async () => {
      setClientState({ status: "loading" });
      try {
        const usersRef = doc(db, "users", user.uid);
        const adminUsersRef = doc(db, "adminUsers", user.uid);
        const [usersSnap, adminSnap] = await Promise.all([getDoc(usersRef), getDoc(adminUsersRef)]);

        const clientPayload = {
          users: {
            path: `users/${user.uid}`,
            exists: usersSnap.exists(),
            data: usersSnap.exists() ? redactSecrets(usersSnap.data()) : null,
          },
          adminUsers: {
            path: `adminUsers/${user.uid}`,
            exists: adminSnap.exists(),
            data: adminSnap.exists() ? redactSecrets(adminSnap.data()) : null,
          },
        };
        if (!cancelled) setClientState({ status: "loaded", data: clientPayload });
      } catch (e) {
        if (!cancelled) setClientState({ status: "error", error: safeErrorMessage(e) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const signedInEmail = user.email ?? null;
  const uid = user.uid;

  return (
    <details style={{ marginTop: 16 }}>
      <summary className="subtext" style={{ cursor: "pointer" }}>
        Temporary role debug (production-safe)
      </summary>
      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        <div className="subtext">
          <div>
            <strong>Firebase client projectId:</strong> <code className="inline-code">{firebaseClientProjectId ?? "unknown"}</code>
          </div>
          <div>
            <strong>Signed-in auth UID:</strong> <code className="inline-code">{uid}</code>
          </div>
          <div>
            <strong>Signed-in email:</strong> <code className="inline-code">{signedInEmail ?? "unknown"}</code>
          </div>
        </div>

        <div>
          <div className="subtext" style={{ marginBottom: 6 }}>
            <strong>Client Firestore reads</strong>
          </div>
          <DebugStateView state={clientState} />
        </div>

        <div>
          <div className="subtext" style={{ marginBottom: 6 }}>
            <strong>Server role check (/api/debug/role)</strong>
          </div>
          <DebugStateView state={serverState} />
        </div>
      </div>
    </details>
  );
}

