export type AuthRole = "admin" | "staff";

export type AuthSession = {
  role: AuthRole;
  staffId?: string;
  staffName?: string;
  loggedInAt: number;
};

const KEY = "auth_session_v1";

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as AuthSession;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
