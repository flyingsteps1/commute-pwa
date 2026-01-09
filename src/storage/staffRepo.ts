import { supabase } from "./supabaseClient";
import { getAppSession } from "./appSession";

export type StaffPublic = {
  workplaceId: string | null;
  staffId: string;
  displayName: string | null;
  sortOrder: number | null;
  name: string | null;
  userId: string | null;
  isActive?: boolean | null;
};

const WORKPLACE_ID = import.meta.env.VITE_WORKPLACE_ID ?? null;

const DEV = import.meta.env.DEV;
let hasIsActiveColumn: boolean | null = null;

async function detectIsActiveColumn() {
  if (hasIsActiveColumn !== null) return hasIsActiveColumn;
  const { error } = await supabase.from("staff_public").select("is_active").limit(1);
  if (error) {
    const missing =
      String((error as any)?.code ?? "") === "42703" ||
      String((error as any)?.message ?? "").includes("is_active") ||
      String((error as any)?.details ?? "").includes("is_active");
    if (missing) {
      hasIsActiveColumn = false;
      if (DEV) console.warn("[staffRepo] is_active missing, caching false");
      return hasIsActiveColumn;
    }
    if (DEV) console.error("[staffRepo] detect is_active failed", error);
    throw error;
  }
  hasIsActiveColumn = true;
  return hasIsActiveColumn;
}

export async function listStaffPublic(): Promise<StaffPublic[]> {
  const session = getAppSession();
  const workplaceId = session?.workplaceId ?? WORKPLACE_ID;

  const buildQuery = (withActive: boolean) => {
    let q = supabase
      .from("staff_public")
      .select(withActive
        ? "workplace_id, staff_id, display_name, sort_order, name, user_id, is_active"
        : "workplace_id, staff_id, display_name, sort_order, name, user_id")
      .order("sort_order", { ascending: true, nullsFirst: true })
      .order("staff_id", { ascending: true });
    if (workplaceId) q = q.eq("workplace_id", workplaceId);
    if (withActive) q = q.eq("is_active", true);
    return q;
  };

  let data: any[] | null = null;
  let error: any = null;
  let status: number | null = null;

  const canUseActive = await detectIsActiveColumn();
  {
    const res = await buildQuery(canUseActive);
    data = res.data ?? null;
    error = res.error ?? null;
    status = res.status ?? null;
  }

  const isMissingActive =
    error &&
    (String((error as any)?.code ?? "") === "42703" ||
      String((error as any)?.message ?? "").includes("is_active") ||
      String((error as any)?.details ?? "").includes("is_active"));

  if (error && isMissingActive) {
    if (DEV) console.warn("[staffRepo.listStaffPublic] is_active missing, retry without filter");
    hasIsActiveColumn = false;
    const res = await buildQuery(false);
    data = res.data ?? null;
    error = res.error ?? null;
    status = res.status ?? null;
  }

  if (error) {
    if (DEV) console.error("[staffRepo.listStaffPublic] error", { status, error });
    throw error;
  }

  const rows =
    data?.map((r) => ({
      workplaceId: r.workplace_id ?? null,
      staffId: r.staff_id,
      displayName: r.display_name ?? null,
      sortOrder: r.sort_order ?? null,
      name: r.name ?? null,
      userId: r.user_id ?? null,
      isActive: typeof r.is_active === "undefined" ? null : r.is_active ?? null,
    })) ?? [];

  if (DEV) {
    console.log("[staffRepo.listStaffPublic] count", rows.length);
    if (rows[0]) console.log("[staffRepo.listStaffPublic] sample", rows[0]);
  }

  return rows;
}

type ActiveStaffCheck =
  | { ok: true }
  | { ok: false; reason: "inactive" }
  | { ok: false; reason: "not_staff" };

export async function requireActiveStaff(userId: string): Promise<ActiveStaffCheck> {
  try {
    const { data, error } = await supabase
      .from("staff_public")
      .select("is_active")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      const missing =
        String((error as any)?.code ?? "") === "42703" ||
        String((error as any)?.message ?? "").includes("is_active") ||
        String((error as any)?.details ?? "").includes("is_active");
      // If the schema doesn't have is_active, treat as active to avoid blocking logins.
      if (missing) return { ok: true };
      throw error;
    }
    // No staff row: likely admin (or non-staff), so do not block.
    if (!data) return { ok: false, reason: "not_staff" };
    // Explicitly inactive staff should be blocked by UI.
    if (data.is_active === false) return { ok: false, reason: "inactive" };
    // Active (or null/undefined) is treated as ok.
    return { ok: true };
  } catch (e) {
    if (DEV) console.error("[staffRepo] requireActiveStaff error", e);
    throw e;
  }
}

export async function upsertMyStaffProfile(staffId: string, name: string) {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    if (DEV) console.warn("[staffRepo.upsertMyStaffProfile] getUser failed", userErr);
    return;
  }
  const userId = userData.user?.id;
  if (!userId) {
    if (DEV) console.warn("[staffRepo.upsertMyStaffProfile] no auth user, skip upsert", { staffId });
    return;
  }

  const workplaceId = getAppSession()?.workplaceId ?? WORKPLACE_ID;

  const payload: any = {
    staff_id: staffId,
    name,
    display_name: name,
    user_id: userId ?? null,
  };
  if (workplaceId) payload.workplace_id = workplaceId;

  const { error, status } = await supabase
    .from("staff_public")
    .upsert(payload, { onConflict: "workplace_id,staff_id" });
  if (error) {
    if (DEV) console.error("[staffRepo.upsertMyStaffProfile] failed", { status, error, payload });
    return;
  }
  if (DEV) console.log("[staffRepo.upsertMyStaffProfile] ok", { status, staffId, userId });
}
