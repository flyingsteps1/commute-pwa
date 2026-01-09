import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase env missing: check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
}

if (import.meta.env.DEV) {
  const maskedUrl = supabaseUrl ? `${supabaseUrl.slice(0, 24)}...` : "missing";
  const keyPrefix = supabaseAnonKey ? `${supabaseAnonKey.slice(0, 10)}...` : "missing";
  console.log("[supabaseClient] url:", maskedUrl, "| anonKey:", keyPrefix);
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function requireSession(): Promise<Session> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (import.meta.env.DEV) {
    console.log("[requireSession] hasSession", !!session, "hasAccessToken", !!session?.access_token);
  }
  if (!session) throw new Error("AUTH_REQUIRED");
  return session;
}
