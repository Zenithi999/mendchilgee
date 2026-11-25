// ═══════════════════════════════════════════════════════════════
// Supabase client (replaces firebase.js)
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
}

export const supabase = createClient(SUPABASE_URL || "http://localhost", SUPABASE_KEY || "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Base URL of the `api` Edge Function (payments). Overridable for local dev. */
export const FUNCTIONS_BASE =
  import.meta.env.VITE_FUNCTIONS_BASE_URL || `${SUPABASE_URL}/functions/v1/api`;

/**
 * fetch() against the payments Edge Function, sending the user's session
 * so the server knows who is calling (it no longer trusts a userId in the body).
 */
export async function apiFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    apikey: SUPABASE_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  return fetch(`${FUNCTIONS_BASE}${path}`, { ...options, headers });
}

export default supabase;
