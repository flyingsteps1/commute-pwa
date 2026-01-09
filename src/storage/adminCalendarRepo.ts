import { supabase } from "./supabaseClient";
import { listStaffPublic } from "./staffRepo";
import { normalizeWorkRecord } from "./todayRepo";
import { calcDailyWorkMin } from "../domain/timeCalc";

type DaySummary = { work: number; incomplete: number; off: number; none: number; holiday: number };
export type MonthSummary = Record<string, DaySummary>;

export type DayDetail = {
  staffId: string;
  name: string;
  checkIn?: string | null;
  checkOut?: string | null;
  breakMin?: number | null;
  workMin?: number | null;
  status: "off" | "working" | "incomplete" | "no_record" | "holiday";
  note?: string | null;
};

function nextMonthStart(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m, 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function retentionStartDate() {
  const d = new Date();
  d.setDate(d.getDate() - 365);
  return d.toISOString().slice(0, 10);
}

export async function getMonthSummary(yyyyMm: string): Promise<{ days: MonthSummary; staffCount: number }> {
  const staff = await listStaffPublic();
  const userIds = staff.map((s) => s.userId).filter(Boolean) as string[];
  let start = `${yyyyMm}-01`;
  const end = nextMonthStart(yyyyMm);
  const retention = retentionStartDate();
  if (retention > start) start = retention;
  if (start >= end) return { days: {}, staffCount: userIds.length };
  if (userIds.length === 0) return { days: {}, staffCount: 0 };

  const { data, error } = await supabase
    .from("work_records")
    .select("date, staff_user_id, check_in, check_out, break_minutes, note")
    .in("staff_user_id", userIds)
    .gte("date", start)
    .lt("date", end);
  if (error) throw error;

  const summary: MonthSummary = {};
  const normalized = (data ?? []).map(normalizeWorkRecord);
  for (const r of normalized) {
    const date = r.date as string;
    if (!summary[date]) summary[date] = { work: 0, incomplete: 0, off: 0, none: 0, holiday: 0 };
    if (r.note === "OFF") summary[date].holiday += 1;
    else if (r.checkIn && r.checkOut) summary[date].off += 1;
    else if (r.checkIn && !r.checkOut) summary[date].incomplete += 1;
    else summary[date].none += 1;
  }

  // none count for staff without records that day
  for (let d = 1; d <= 31; d++) {
    const date = `${yyyyMm}-${String(d).padStart(2, "0")}`;
    const entry = summary[date];
    if (entry) {
      const counted = entry.off + entry.incomplete + entry.none + entry.holiday;
      if (counted < userIds.length) entry.none += userIds.length - counted;
    }
  }

  return { days: summary, staffCount: userIds.length };
}

export async function getDayDetails(dateISO: string): Promise<DayDetail[]> {
  const retention = retentionStartDate();
  if (dateISO < retention) return [];
  const staff = await listStaffPublic();
  const userIds = staff.map((s) => s.userId).filter(Boolean) as string[];
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from("work_records")
    .select("date, staff_user_id, check_in, check_out, break_minutes, note")
    .eq("date", dateISO)
    .in("staff_user_id", userIds);
  if (error) throw error;

  const rows = (data ?? []).map(normalizeWorkRecord);
  return staff.map((s) => {
    const rec = rows.find((r) => r.employeeId === s.userId);
    if (!rec) {
      return {
        staffId: s.staffId,
        name: s.name ?? s.displayName ?? s.staffId,
        status: "no_record",
      };
    }
    const work = calcDailyWorkMin({
      date: dateISO,
      checkIn: rec.checkIn ?? undefined,
      checkOut: rec.checkOut ?? undefined,
      breakMin: rec.breakMin ?? 0,
    });
    let status: DayDetail["status"] = "working";
    if (rec.note === "OFF") status = "holiday";
    else if (rec.checkIn && rec.checkOut) status = "off";
    else if (rec.checkIn && !rec.checkOut) status = "incomplete";
    else status = "no_record";
    return {
      staffId: s.staffId,
      name: s.name ?? s.displayName ?? s.staffId,
      checkIn: rec.checkIn ?? null,
      checkOut: rec.checkOut ?? null,
      breakMin: rec.breakMin ?? 0,
      workMin: work.workMin,
      status,
      note: rec.note ?? null,
    };
  });
}
