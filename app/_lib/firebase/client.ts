import { initializeApp, getApps, type FirebaseApp } from "firebase/app";

const requiredKeys = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

export type FirebaseEnvKey = (typeof requiredKeys)[number];

export function getMissingFirebaseEnvKeys(): FirebaseEnvKey[] {
  return requiredKeys.filter((k) => !process.env[k]);
}

export function getFirebaseAppOrNull(): FirebaseApp | null {
  const existing = getApps()[0];
  if (existing) return existing;

  if (getMissingFirebaseEnvKeys().length > 0) return null;

  return initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  });
}

export function getFirebaseApp(): FirebaseApp {
  const app = getFirebaseAppOrNull();
  if (app) return app;

  const missing = getMissingFirebaseEnvKeys();
  throw new Error(
    `Missing Firebase env vars: ${missing.join(
      ", ",
    )}. Add them to .env.local (see .env.example).`,
  );
}

