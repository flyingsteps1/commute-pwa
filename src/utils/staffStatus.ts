import type { WorkRecord } from "../domain/types";

export type StaffStateCode = "working" | "break" | "off" | "no_record" | "incomplete";
export type StaffDetailKind = "check_in" | "break_start" | "check_out";

export type TodayStatus = {
  code: StaffStateCode;
  detailKind?: StaffDetailKind;
  detailTime?: string;
  label?: string; // deprecated: keep for backward compatibility (not populated)
  detail?: string; // deprecated
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getTodayStatus(records: WorkRecord[], staffId: string): TodayStatus {
  const today = todayISO();
  const rec = records.find(
    (r) => r.date === today && (r.employeeId === staffId || (!r.employeeId && staffId === "admin"))
  );
  if (!rec) return { code: "no_record" };

  const startAt = (rec as any).checkIn;
  const endAt = (rec as any).checkOut;

  // 퇴근까지 완료
  if (startAt && endAt) {
    return { code: "off", detailKind: "check_out", detailTime: endAt };
  }

  // 출근만 찍힘 (휴식 구조 미구현 → 근무중으로 분류)
  if (startAt && !endAt) {
    return { code: "working", detailKind: "check_in", detailTime: startAt };
  }

  // 기록은 있으나 비정상/누락
  return { code: "incomplete", detailKind: startAt ? "check_in" : undefined, detailTime: startAt };
}
