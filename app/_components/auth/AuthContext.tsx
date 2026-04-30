"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/_lib/firebase/firestore";
import { getFirebaseAuth, signOut as firebaseSignOut } from "@/app/_lib/firebase/auth";
import type { WorkspaceRole } from "@/app/_lib/rbac";
import { normalizeWorkspaceRole } from "@/app/_lib/rbac";
import { isWorkspaceUserActive, type WorkspaceUserProfile } from "@/app/_lib/workspace/userProfile";

function isTrueish(value: unknown): boolean {
  return value === true || value === "true";
}

type AuthState =
  | { status: "loading"; user: null }
  | { status: "signedOut"; user: null }
  | { status: "signedInButUnauthorized"; user: User }
  | { status: "signedInNoRole"; user: User }
  | { status: "signedInWorkspace"; user: User; role: WorkspaceRole };

type AuthContextValue = {
  state: AuthState;
  signOut: () => Promise<void>;
};

const defaultAuthValue: AuthContextValue = {
  state: { status: "loading", user: null },
  signOut: async () => {},
};

const AuthContext = createContext<AuthContextValue>(defaultAuthValue);

async function loadWorkspaceRole(user: User): Promise<WorkspaceRole | null> {
  const token = await user.getIdToken();
  const res = await fetch("/api/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body: unknown = await res.json();
  if (typeof body !== "object" || body === null || !("role" in body)) return null;
  const raw = (body as { role: unknown }).role;
  return normalizeWorkspaceRole(raw);
}

async function loadWorkspaceRoleFromClientFirestore(uid: string): Promise<WorkspaceRole | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data() as WorkspaceUserProfile;
  if (!isWorkspaceUserActive(data)) return null;
  return normalizeWorkspaceRole(data.role);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
  });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    try {
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, (user) => {
        void (async () => {
          try {
            if (!user) {
              setState({ status: "signedOut", user: null });
              return;
            }

            setState({ status: "loading", user: null });

            const ref = doc(db, "adminUsers", user.uid);
            const snap = await getDoc(ref);
            const data = snap.exists() ? (snap.data() as { active?: unknown }) : null;
            const isAdmin = isTrueish(data?.active);

            if (!isAdmin) {
              setState({ status: "signedInButUnauthorized", user });
              return;
            }

            const [serverRole, clientRole] = await Promise.all([
              loadWorkspaceRole(user),
              loadWorkspaceRoleFromClientFirestore(user.uid),
            ]);

            const role = serverRole ?? clientRole;
            if (!role) {
              setState({ status: "signedInNoRole", user });
              return;
            }

            if (serverRole !== role && clientRole === role) {
              // Non-sensitive: just indicate disagreement, no tokens or doc data.
              console.warn("[auth] Server role check returned null; using client users/{uid} role fallback.", {
                uid: user.uid,
              });
            } else if (serverRole && clientRole && serverRole !== clientRole) {
              console.warn("[auth] Server/client role mismatch; using server role.", { uid: user.uid });
            }

            setState({ status: "signedInWorkspace", user, role });
          } catch {
            setState({ status: "signedOut", user: null });
          }
        })();
      });
    } catch {
      queueMicrotask(() => setState({ status: "signedOut", user: null }));
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signOut: async () => {
        try {
          const auth = getFirebaseAuth();
          await firebaseSignOut(auth);
          setState({ status: "signedOut", user: null });
        } catch {
          setState({ status: "signedOut", user: null });
        }
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
