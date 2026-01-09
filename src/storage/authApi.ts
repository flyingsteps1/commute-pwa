import { AuthApiError } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { clearAppSession, setAppSession } from "./appSession";
import { upsertMyStaffProfile } from "./staffRepo";

export type ProfileRow = {
  role: "admin" | "staff";
  workplace_id: string;
  staff_id: string | null;
  display_name: string;
};

async function setSessionFromProfile(profile: ProfileRow) {
  setAppSession({
    role: profile.role,
    workplaceId: profile.workplace_id,
    staffId: profile.staff_id ?? "",
    displayName: profile.display_name,
  });
}

export async function fetchMyProfile(): Promise<ProfileRow> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData.user;
  if (!user) throw new Error("No authenticated user.");

  const { data, error } = await supabase
    .from("profiles")
    .select("role, workplace_id, staff_id, display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    await ensureProfile();
    const { data: retry, error: retryErr } = await supabase
      .from("profiles")
      .select("role, workplace_id, staff_id, display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (retryErr) throw retryErr;
    if (!retry) throw new Error("Profile not found.");
    return retry as ProfileRow;
  }

  return data as ProfileRow;
}

async function ensureProfile() {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("AUTH_REQUIRED");
  const userEmail = sessionData.session?.user?.email ?? "";
  const staffId = userEmail.includes("@") ? userEmail.split("@")[0] : "";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("SUPABASE_ENV_MISSING");
  const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-staff`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ action: "ensure_profile", staffId: staffId || undefined }),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text || null;
  }
  if (!res.ok) {
    const err: any = new Error(`HTTP_${res.status}`);
    err.__status = res.status;
    err.__body = body;
    err.__rawText = text || null;
    throw err;
  }
}

export async function signInAdmin(password: string): Promise<ProfileRow> {
  const email = "admin@oracletour.local";
  if (import.meta.env.DEV) console.log("[signInAdmin] email", email);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error instanceof AuthApiError && error.status === 422 && error.message?.toLowerCase().includes("email logins are disabled")) {
      throw new Error("Supabase Email/Password provider가 비활성화되어 로그인할 수 없습니다. Dashboard > Authentication > Sign In / Providers > Email을 Enable 하세요.");
    }
    throw error;
  }
  const profile = await fetchMyProfile();
  await setSessionFromProfile(profile);
  return profile;
}

export async function signInStaff(staffId: string, password: string, displayName?: string | null): Promise<ProfileRow> {
  const email = `${staffId}@oracletour.local`;
  if (import.meta.env.DEV) console.log("[signInStaff] email", email);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error instanceof AuthApiError && error.status === 422 && error.message?.toLowerCase().includes("email logins are disabled")) {
      throw new Error("Supabase Email/Password provider가 비활성화되어 로그인할 수 없습니다. Dashboard > Authentication > Sign In / Providers > Email을 Enable 하세요.");
    }
    throw error;
  }
  const profile = await fetchMyProfile();
  await setSessionFromProfile(profile);
  try {
    await upsertMyStaffProfile(staffId, displayName || staffId);
  } catch (e) {
    console.error("[signInStaff] upsert staff_public failed", e);
  }
  return profile;
}

export async function signOutAll() {
  await supabase.auth.signOut();
  clearAppSession();
}
