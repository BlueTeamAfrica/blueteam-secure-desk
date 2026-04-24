import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseAdminEnv = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
};

function readSupabaseAdminEnv(): SupabaseAdminEnv {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET;

  if (!url?.trim()) throw new Error("Missing SUPABASE_URL");
  if (!serviceRoleKey?.trim()) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!bucket?.trim()) throw new Error("Missing SUPABASE_BUCKET");

  return { url: url.trim(), serviceRoleKey: serviceRoleKey.trim(), bucket: bucket.trim() };
}

let cached:
  | {
      client: SupabaseClient;
      bucket: string;
    }
  | undefined;

export function getSupabaseAdmin() {
  if (cached) return cached;
  const env = readSupabaseAdminEnv();
  const client = createClient(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  cached = { client, bucket: env.bucket };
  return cached;
}

