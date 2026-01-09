import { getSession } from "./session";
import type { AuthSession } from "./session";

export function activeEmployeeId(session?: AuthSession | null): string {
  const s = session ?? getSession();
  if (s?.role === "staff" && s.staffId) return s.staffId;
  return "admin";
}

export function activeEmployeeName(session?: AuthSession | null): string {
  const s = session ?? getSession();
  if (s?.role === "staff") return s.staffName || s.staffId || "직원";
  return "관리자";
}
