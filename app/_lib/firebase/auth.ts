import { getAuth, signInWithEmailAndPassword, signOut, type Auth } from "firebase/auth";
import { getFirebaseApp } from "@/app/_lib/firebase/client";

let cachedAuth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  const app = getFirebaseApp();
  cachedAuth = getAuth(app);
  return cachedAuth;
}

export { signInWithEmailAndPassword, signOut };
