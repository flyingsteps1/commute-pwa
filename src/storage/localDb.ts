import type { WorkRecord } from "../domain/types";

const KEY = "commute_records_v1";
const MIG_FLAG = "records_migrated_v1";
const DEFAULT_EMPLOYEE_ID = "admin";

function normEmployeeId(id?: string) {
  return id || DEFAULT_EMPLOYEE_ID;
}

// 레코드 변경 이벤트
const EVENT_NAME = "records-changed";

function emitRecordsChanged() {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeRecordsChanged(handler: () => void) {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

// raw load (마이그레이션 적용 전용)
function readRecordsRaw(): WorkRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as WorkRecord[];
  } catch {
    return [];
  }
}

export function ensureRecordsMigrated() {
  if (localStorage.getItem(MIG_FLAG)) return;
  const list = readRecordsRaw();
  let changed = false;
  const migrated = list.map((r) => {
    if (r.employeeId) return r;
    changed = true;
    return { ...r, employeeId: DEFAULT_EMPLOYEE_ID };
  });
  if (changed) {
    localStorage.setItem(KEY, JSON.stringify(migrated));
  }
  localStorage.setItem(MIG_FLAG, "1");
}

export function loadRecords(): WorkRecord[] {
  ensureRecordsMigrated();
  return readRecordsRaw();
}

export function loadRecordsByEmployee(employeeId?: string): WorkRecord[] {
  const target = normEmployeeId(employeeId);
  return loadRecords().filter((r) => normEmployeeId(r.employeeId) === target);
}

// 모든 변경은 saveRecords를 통해 진행하고 이벤트 발행
export function saveRecords(records: WorkRecord[]) {
  localStorage.setItem(KEY, JSON.stringify(records));
  emitRecordsChanged();
}

export function upsertRecord(record: WorkRecord) {
  const list = loadRecords();
  const employeeId = normEmployeeId(record.employeeId);
  const idx = list.findIndex((r) => r.date === record.date && normEmployeeId(r.employeeId) === employeeId);
  const next = { ...list[idx], ...record, employeeId };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  saveRecords(list);
}

export function getRecordByDate(dateISO: string, employeeId?: string): WorkRecord | undefined {
  const target = normEmployeeId(employeeId);
  return loadRecords().find((r) => r.date === dateISO && normEmployeeId(r.employeeId) === target);
}

export function deleteRecord(dateISO: string, employeeId?: string) {
  const target = normEmployeeId(employeeId);
  const list = loadRecords().filter((r) => !(r.date === dateISO && normEmployeeId(r.employeeId) === target));
  saveRecords(list);
}

export function exportRecordsJson(): string {
  return JSON.stringify(loadRecords(), null, 2);
}

export function importRecordsJson(json: string) {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("Invalid JSON: expected array");
  saveRecords(parsed as WorkRecord[]);
}

export function clearAllRecords() {
  localStorage.removeItem(KEY);
  emitRecordsChanged(); // saveRecords를 쓰지 않으므로 직접 emit
}
