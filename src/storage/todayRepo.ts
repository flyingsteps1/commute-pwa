import { supabase } from "./supabaseClient";
import { getAppSession } from "./appSession";
import type { WorkRecord } from "../domain/types";

export type WorkRecordUpsertInput = {
  date: string;
  checkIn?: string;
  checkOut?: string;
  breakMin?: number;
  note?: string | null;
};

type DbRow = {
  date: string;
  check_in: string | null;
  check_out: string | null;
  break_minutes: number | null;
  staff_user_id: string | null;
  note?: string | null;
};

function toHHMM(value?: string | null) {
  if (!value) return undefined;
  try {
    if (value.includes("T")) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toISOString().substring(11, 16);
    }
  } catch {
    // fall back to substring below
  }
  return value.slice(0, 5);
}

function toTimestamp(dateISO: string, hhmm?: string | null) {
  if (!hhmm) return null;
  return new Date(`${dateISO}T${hhmm}:00Z`).toISOString();
}

export function normalizeWorkRecord(r: any): WorkRecord {
  const checkIn = r?.checkIn ?? r?.check_in ?? null;
  const checkOut = r?.checkOut ?? r?.check_out ?? null;
  const breakMin = r?.breakMin ?? r?.break_min ?? r?.break_minutes ?? 0;
  return {
    ...r,
    date: r?.date ?? r?.work_date ?? r?.day ?? "",
    checkIn: toHHMM(checkIn),
    checkOut: toHHMM(checkOut),
    breakMin: Number(breakMin ?? 0) || 0,
    employeeId: r?.employeeId ?? r?.staff_user_id ?? undefined,
    note: r?.note ?? r?.status_note ?? null,
  };
}

function mapRow(row: DbRow): WorkRecord {
  return normalizeWorkRecord(row);
}

async function ensureAuthContext() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Not authenticated");
  const session = getAppSession();
  if (!session) throw new Error("No app session");
  return { userId: userData.user.id, session };
}

function nextMonthStart(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m, 1); // next month day 1
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function retentionStartDate() {
  const d = new Date();
  d.setDate(d.getDate() - 365);
  return d.toISOString().slice(0, 10);
}

export async function getByDate(dateISO: string, staffUserId?: string): Promise<WorkRecord | null> {
  const { userId } = await ensureAuthContext();
  const targetUserId = staffUserId || userId;
  const { data, error } = await supabase
    .from("work_records")
    .select("date, check_in, check_out, break_minutes, staff_user_id, note")
    .eq("staff_user_id", targetUserId)
    .eq("date", dateISO)
    .maybeSingle();

  if (error) {
    // if no row, maybeSingle returns null data without error
    if (error.code !== "PGRST116") throw error;
  }
  if (!data) return null;
  return mapRow(data as DbRow);
}

export async function upsertByDate(input: WorkRecordUpsertInput, staffUserId?: string): Promise<WorkRecord> {
  const { userId, session } = await ensureAuthContext();
  const targetUserId = staffUserId || userId;
  const payload = {
    workplace_id: session.workplaceId,
    staff_user_id: targetUserId,
    date: input.date,
    check_in: toTimestamp(input.date, input.checkIn),
    check_out: toTimestamp(input.date, input.checkOut),
    break_minutes: input.breakMin ?? 0,
    note: input.note ?? null,
  };

  const { data, error } = await supabase
    .from("work_records")
    .upsert(payload, { onConflict: "workplace_id,staff_user_id,date" })
    .select("date, check_in, check_out, break_minutes, staff_user_id, note")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Failed to save record");
  return mapRow(data as DbRow);
}

export async function upsertDayOff(dateISO: string, staffUserId?: string) {
  return upsertByDate(
    {
      date: dateISO,
      checkIn: undefined,
      checkOut: undefined,
      breakMin: 0,
      note: "OFF",
    },
    staffUserId
  );
}

export async function clearDayOff(dateISO: string, staffUserId?: string) {
  const { userId } = await ensureAuthContext();
  const targetUserId = staffUserId || userId;
  const { error } = await supabase
    .from("work_records")
    .delete()
    .eq("staff_user_id", targetUserId)
    .eq("date", dateISO);
  if (error) throw error;
}

export async function listByMonth(yyyyMm: string, staffUserId?: string): Promise<WorkRecord[]> {
  const { userId } = await ensureAuthContext();
  const targetUserId = staffUserId || userId;
  let start = `${yyyyMm}-01`;
  const end = nextMonthStart(yyyyMm);
  const retention = retentionStartDate();
  if (retention > start) start = retention;
  if (start >= end) return [];
  if (import.meta.env.DEV) {
    console.log("[todayRepo] listByMonth", { table: "work_records", column: "date", start, end, targetUserId, retention });
  }
  const { data, error } = await supabase
    .from("work_records")
    .select("date, check_in, check_out, break_minutes, staff_user_id, note")
    .eq("staff_user_id", targetUserId)
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data as DbRow[] | null | undefined)?.map(mapRow) ?? [];
}

// Backward-compatible helpers
export async function getMyTodayRecord(dateISO: string) {
  return getByDate(dateISO);
}

export async function upsertMyTodayRecord(input: WorkRecordUpsertInput) {
  return upsertByDate(input);
}
