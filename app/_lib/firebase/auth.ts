import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, type Auth } from "firebase/auth";
import { getFirebaseApp } from "@/app/_lib/firebase/client";

let cachedAuth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  const app = getFirebaseApp();
  cachedAuth = getAuth(app);
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
    connectAuthEmulator(cachedAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return cachedAuth;
}

export { signInWithEmailAndPassword, signOut };
