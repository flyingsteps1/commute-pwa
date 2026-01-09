import { sha256Hex } from "./crypto";
import type { AuthRole } from "./session";

export type Staff = {
  id: string;
  name: string;
  passwordHash: string;
  createdAt: number;
};

export type AdminSecret = {
  passwordHash: string;
};

const ADMIN_KEY = "auth_admin_v1";
const STAFF_KEY = "staff_list_v1";
const DEFAULT_ADMIN_PASSWORD = "0000"; // 초기 진입용 간단 기본값

function loadAdmin(): AdminSecret | null {
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as AdminSecret;
  } catch {
    return null;
  }
}

function saveAdmin(secret: AdminSecret) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify(secret));
}

function loadStaffList(): Staff[] {
  try {
    const raw = localStorage.getItem(STAFF_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Staff[];
  } catch {
    return [];
  }
}

function saveStaffList(list: Staff[]) {
  localStorage.setItem(STAFF_KEY, JSON.stringify(list));
}

export async function ensureAdminSeed(): Promise<AdminSecret> {
  const existing = loadAdmin();
  if (existing?.passwordHash) return existing;

  const hash = await sha256Hex(DEFAULT_ADMIN_PASSWORD);
  const secret: AdminSecret = { passwordHash: hash };
  saveAdmin(secret);
  return secret;
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const admin = await ensureAdminSeed();
  const hashed = await sha256Hex(password);
  return hashed === admin.passwordHash;
}

export function listStaff(): Staff[] {
  return loadStaffList();
}

export function getStaffById(id: string): Staff | undefined {
  return loadStaffList().find((s) => s.id === id);
}

export async function verifyStaffPassword(staffId: string, password: string): Promise<boolean> {
  const staff = getStaffById(staffId);
  if (!staff) return false;
  const hashed = await sha256Hex(password);
  return hashed === staff.passwordHash;
}

// Helpers for future steps
export async function setAdminPassword(newPassword: string) {
  const hashed = await sha256Hex(newPassword);
  saveAdmin({ passwordHash: hashed });
}

export async function upsertStaffPassword(staffId: string, name: string, password: string) {
  const list = loadStaffList();
  const hashed = await sha256Hex(password);
  const idx = list.findIndex((s) => s.id === staffId);
  if (idx >= 0) {
    list[idx] = { ...list[idx], name, passwordHash: hashed };
  } else {
    list.push({ id: staffId, name, passwordHash: hashed, createdAt: Date.now() });
  }
  saveStaffList(list);
}

export function addStaff(name: string, passwordHash: string, idGenerator: () => string): Staff {
  const list = loadStaffList();
  const id = idGenerator();
  const staff: Staff = {
    id,
    name,
    passwordHash,
    createdAt: Date.now(),
  };
  list.push(staff);
  saveStaffList(list);
  return staff;
}

export function removeStaff(id: string) {
  const list = loadStaffList().filter((s) => s.id !== id);
  saveStaffList(list);
}

export function clearAuthData() {
  localStorage.removeItem(ADMIN_KEY);
  localStorage.removeItem(STAFF_KEY);
}

export function roleLabel(role: AuthRole, name?: string) {
  if (role === "admin") return "관리자";
  return name ? `${name}` : "직원";
}
