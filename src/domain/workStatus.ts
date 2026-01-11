import type { WorkRecord } from "./types";

export type WorkStatus = "holiday" | "off" | "working" | "incomplete" | "no_record";

function isHolidayNote(note: unknown) {
  if (!note) return false;
  return String(note).trim().toUpperCase() === "OFF";
}

export function getWorkStatus(record: WorkRecord | null | undefined, todayISO: string): WorkStatus {
  if (!record) return "no_record";
  if (isHolidayNote((record as any).note)) return "holiday";

  const hasCheckIn = !!record.checkIn;
  const hasCheckOut = !!record.checkOut;

  if (hasCheckIn && hasCheckOut) return "off";
  if (hasCheckIn && !hasCheckOut) return record.date === todayISO ? "working" : "incomplete";
  if (!hasCheckIn && hasCheckOut) return "incomplete";

  return "no_record";
}
