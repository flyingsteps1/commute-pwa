import type { WorkRecord } from "./types";

// "09:30" -> 570
export function hhmmToMin(hhmm?: string): number | null {
  if (!hhmm) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minToHhmm(totalMin: number): string {
  const sign = totalMin < 0 ? "-" : "";
  const m = Math.abs(totalMin);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

export function calcDailyWorkMin(r: WorkRecord): { workMin: number | null; breakMin: number } {
  const inMin = hhmmToMin(r.checkIn);
  const outMin = hhmmToMin(r.checkOut);
  const breakMin = Math.max(0, Number(r.breakMin ?? 0));

  if (inMin === null || outMin === null) return { workMin: null, breakMin };

  const raw = outMin >= inMin ? (outMin - inMin) : (outMin + 24 * 60 - inMin);
  const workMin = Math.max(0, raw - breakMin);
  return { workMin, breakMin };
}

export function calcMonthlySummary(records: WorkRecord[], yyyyMm: string) {
  const rows = records
    .filter(r => r.date.startsWith(yyyyMm))
    .sort((a, b) => a.date.localeCompare(b.date));

  let totalWork = 0;
  let totalBreak = 0;
  let workDays = 0;
  let incompleteDays = 0;

  for (const r of rows) {
    const { workMin, breakMin } = calcDailyWorkMin(r);
    totalBreak += breakMin;
    if (workMin === null) {
      if (r.checkIn || r.checkOut) incompleteDays += 1;
      continue;
    }
    totalWork += workMin;
    workDays += 1;
  }

  return { yyyyMm, rows, totalWork, totalBreak, workDays, incompleteDays };
}
