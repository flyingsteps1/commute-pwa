export type AppRole = "admin" | "staff";

export type AppSession = {
  role: AppRole;
  workplaceId: string;
  staffId: string;
  displayName: string;
};

const KEY = "app_session_v1";

export function getAppSession(): AppSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as AppSession;
  } catch {
    return null;
  }
}

export function setAppSession(session: AppSession) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearAppSession() {
  localStorage.removeItem(KEY);
}
