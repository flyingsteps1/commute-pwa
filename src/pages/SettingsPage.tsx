import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ensureAdminSeed, setAdminPassword, verifyAdminPassword } from "../auth/store";
import { useI18n } from "../i18n/I18nProvider";
import { clearSession } from "../auth/session";
import { listStaffPublic, type StaffPublic } from "../storage/staffRepo";
import { getAppSession, clearAppSession } from "../storage/appSession";
import { requireSession, supabase } from "../storage/supabaseClient";
import "./SettingsPage.css";

const MAX_STAFF = 5;

type StaffRow = StaffPublic;

type CreateStaffPayload = {
  staffId: string;
  displayName: string;
  password?: string;
  action?: "upsert" | "debug" | "soft_delete" | "hard_delete" | "ping";
};

export default function SettingsPage() {
  const nav = useNavigate();
  const { t } = useI18n();
  const enableHardDelete = import.meta.env.VITE_ENABLE_HARD_DELETE === "true";

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStaffId, setNewStaffId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPw, setNewPw] = useState("");
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPw, setEditPw] = useState("");
  const [editMsg, setEditMsg] = useState("");
  const [editErr, setEditErr] = useState("");

  const [adminCurrentPw, setAdminCurrentPw] = useState("");
  const [adminNewPw, setAdminNewPw] = useState("");
  const [adminMsg, setAdminMsg] = useState("");
  const [adminErr, setAdminErr] = useState("");

  const [accessRole, setAccessRole] = useState<"admin" | "staff" | null>(null);
  const [accessWorkplaceId, setAccessWorkplaceId] = useState<string | null>(null);

  useEffect(() => {
    ensureAdminSeed();
    initAccess();
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initAccess() {
    try {
      const session = await requireSession();
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, workplace_id")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error || !profile) {
        setAccessRole(null);
        setAccessWorkplaceId(null);
        return;
      }

      setAccessRole(profile.role as "admin" | "staff");
      setAccessWorkplaceId(profile.workplace_id ?? null);

      if (import.meta.env.DEV) {
        console.log("[SettingsPage] session", {
          email: session.user.email ?? null,
          userId: session.user.id ?? null,
          role: profile.role,
          workplaceId: profile.workplace_id ?? null,
        });
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error("[SettingsPage] session init failed", e);
      setAccessRole(null);
      setAccessWorkplaceId(null);
    }
  }

  async function reload() {
    setLoading(true);
    try {
      const rows = await listStaffPublic();
      setStaff(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const FUNCTION_NAME = "admin-create-staff";

  async function invokeCreateStaff(payload: CreateStaffPayload) {
    if (payload.action !== "ping" && accessRole !== "admin") {
      const err: any = new Error("NOT_ADMIN");
      err.__status = 403;
      err.__body = { step: "NOT_ADMIN", detail: "role is not admin" };
      throw err;
    }

    const session = await requireSession();
    const appSession = getAppSession();

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("SUPABASE_ENV_MISSING");

    const effectiveWorkplaceId =
      accessWorkplaceId ?? appSession?.workplaceId ?? staff[0]?.workplaceId ?? null;

    if (import.meta.env.DEV) {
      console.log("[invokeCreateStaff] req", {
        action: payload.action ?? "upsert",
        staffId: payload.staffId,
        workplaceId: effectiveWorkplaceId,
      });
    }

    if (!effectiveWorkplaceId) throw new Error("WORKPLACE_ID_MISSING");

    const res = await fetch(`${supabaseUrl}/functions/v1/${FUNCTION_NAME}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        workplaceId: effectiveWorkplaceId,
        ...payload,
      }),
    });

    const rawText = await res.text();
    let body: any = null;
    try {
      body = rawText ? JSON.parse(rawText) : null;
    } catch {
      body = rawText || null;
    }

    if (import.meta.env.DEV) {
      const status = res.status;
      console.log("[invokeCreateStaff] res", {
        status,
        action: payload.action ?? "upsert",
        staffId: payload.staffId,
        version: body?.version ?? null,
        step: body?.step ?? null,
        detail: body?.detail ?? null,
      });
    }

    if (!body?.version) {
      const err: any = new Error("DEPLOY_MISMATCH");
      err.__status = res.status;
      err.__body = { step: "DEPLOY_MISMATCH", detail: "version missing" };
      err.__rawText = rawText;
      throw err;
    }

    if (!res.ok) {
      const status = res.status;
      if (import.meta.env.DEV) console.error("[invokeCreateStaff] error", { status, body, rawText });

      if (status === 401 && String(rawText).includes("Invalid JWT")) {
        await handleInvalidJwt();
      }

      const err: any = new Error(`HTTP_${status}`);
      err.__status = status;
      err.__body = body;
      err.__rawText = rawText;
      throw err;
    }

    return body;
  }

  function handleAuthRequired() {
    const msg = t("settings_error_auth_required");
    setAddError(msg);
    setEditErr(msg);
    setAdminErr(msg);
    nav("/login", { replace: true, state: { from: "/admin/settings" } });
  }

  async function handleInvalidJwt() {
    const msg = t("settings_error_session_expired");
    setAddError(msg);
    setEditErr(msg);
    setAdminErr(msg);
    await supabase.auth.signOut();
    clearAppSession();
    clearSession();
    nav("/login", { replace: true, state: { from: "/admin/settings" } });
  }

  async function onAddStaff(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddSuccess("");

    if (accessRole !== "admin") {
      setAddError(t("settings_admin_only"));
      return;
    }
    if (staff.length >= MAX_STAFF) {
      setAddError(t("settings_staff_limit_reached"));
      return;
    }
    if (!newStaffId.trim()) {
      setAddError(t("settings_error_id_required"));
      return;
    }
    if (!newName.trim()) {
      setAddError(t("settings_error_name_required"));
      return;
    }
    if (!newPw.trim()) {
      setAddError(t("settings_error_pw_required"));
      return;
    }
    if (newPw.trim().length < 6) {
      setAddError(t("auth_password_min_6"));
      return;
    }

    try {
      await invokeCreateStaff({
        staffId: newStaffId.trim(),
        displayName: newName.trim(),
        password: newPw.trim(),
        action: "upsert",
      });

      setNewStaffId("");
      setNewName("");
      setNewPw("");
      setAddSuccess(t("settings_staff_added"));
      setShowAddForm(false);
      await reload();
    } catch (e: any) {
      console.error(e);
      if (e?.message === "AUTH_REQUIRED") return handleAuthRequired();
      if (e?.message === "WORKPLACE_ID_MISSING") {
        setAddError("WORKPLACE_ID_MISSING");
        return;
      }
      if (isShortPasswordError(e)) {
        setAddError(t("auth_password_min_6"));
        return;
      }
      const detail = buildErrorMessage(e);
      const debug = await tryDebug(newStaffId.trim());
      const msg = [detail ?? e?.message ?? t("settings_staff_create_failed"), debug]
        .filter(Boolean)
        .join(" | ");
      setAddError(msg);
    }
  }

  async function onSaveStaffPw(id: string, name: string) {
    setEditErr("");
    setEditMsg("");

    if (accessRole !== "admin") {
      setEditErr(t("settings_admin_only"));
      return;
    }
    if (!editPw.trim()) {
      setEditErr(t("settings_error_pw_required"));
      return;
    }
    if (editPw.trim().length < 6) {
      setEditErr(t("auth_password_min_6"));
      return;
    }

    try {
      await invokeCreateStaff({
        staffId: id,
        displayName: name,
        password: editPw.trim(),
        action: "upsert",
      });

      setEditPw("");
      setEditingId(null);
      setEditMsg(t("settings_staff_pw_changed"));
      await reload();
    } catch (e: any) {
      console.error(e);
      if (e?.message === "AUTH_REQUIRED") return handleAuthRequired();
      if (e?.message === "WORKPLACE_ID_MISSING") {
        setEditErr("WORKPLACE_ID_MISSING");
        return;
      }
      if (isShortPasswordError(e)) {
        setEditErr(t("auth_password_min_6"));
        return;
      }
      const detail = buildErrorMessage(e);
      const debug = await tryDebug(id);
      const msg = [detail ?? e?.message ?? t("settings_staff_update_failed"), debug]
        .filter(Boolean)
        .join(" | ");
      setEditErr(msg);
    }
  }

  async function onDeleteStaff(id: string, name: string, hard = false) {
    if (accessRole !== "admin") {
      setEditErr(t("settings_admin_only"));
      return;
    }

    try {
      const res = await invokeCreateStaff({
        staffId: id,
        displayName: name,
        action: hard ? "hard_delete" : "soft_delete",
      });

      if (import.meta.env.DEV) {
        console.log("[settings delete] res", {
          status: "ok",
          version: res?.version ?? null,
          step: res?.step ?? null,
          action: res?.action ?? null,
        });
      }

      await reload();

      if (res && res.authDeleted === false) {
        setEditMsg(t("settings_staff_deleted_banned"));
      }
    } catch (e: any) {
      console.error(e);
      if (e?.message === "AUTH_REQUIRED") return handleAuthRequired();
      if (e?.message === "WORKPLACE_ID_MISSING") {
        setEditErr("WORKPLACE_ID_MISSING");
        return;
      }
      const detail = buildErrorMessage(e);
      const debug = await tryDebug(id);
      const msg = [detail ?? e?.message ?? t("settings_staff_update_failed"), debug]
        .filter(Boolean)
        .join(" | ");
      setEditErr(msg);
    }
  }

  async function onChangeAdminPw(e: FormEvent) {
    e.preventDefault();
    setAdminErr("");
    setAdminMsg("");

    if (!adminNewPw.trim() || !adminCurrentPw.trim()) {
      setAdminErr(t("settings_error_admin_pw_required"));
      return;
    }

    const ok = await verifyAdminPassword(adminCurrentPw.trim());
    if (!ok) {
      setAdminErr(t("settings_error_admin_pw_wrong"));
      return;
    }

    await setAdminPassword(adminNewPw.trim());
    setAdminMsg(t("settings_alert_password_changed"));
    setAdminCurrentPw("");
    setAdminNewPw("");
  }

  const staffCountLabel = useMemo(() => `${staff.length}/${MAX_STAFF}`, [staff.length]);
  const atLimit = staff.length >= MAX_STAFF;

  async function tryDebug(staffId: string) {
    if (!staffId) return null;
    try {
      const data = await invokeCreateStaff({ staffId, displayName: staffId, action: "debug" });
      if (import.meta.env.DEV) console.log("[settings debug]", data);
      if (!data) return null;

      const nullable = data?.staffUserIdNullable?.is_nullable ?? null;
      const fkDef = Array.isArray(data?.constraints?.rows)
        ? data.constraints.rows.find((r: any) => String(r.table_name).includes("work_records"))?.definition ?? null
        : null;
      const count = data?.workRecords?.count ?? null;

      const parts: string[] = [];
      if (nullable !== null) parts.push(`nullable=${nullable}`);
      if (fkDef) parts.push(`fk=${String(fkDef).slice(0, 120)}`);
      if (count !== null) parts.push(`records=${count}`);
      return parts.length ? `DEBUG: ${parts.join(", ")}` : "DEBUG: (empty)";
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[settings debug] failed", e);
      return null;
    }
  }

  return (
    <div className="settingsRoot">
      <div className="settingsShell">
        <header className="settingsHeader">
          <div className="settingsHeaderLeft">
            <button
              type="button"
              className="settingsBackBtn"
              onClick={() => nav(-1)}
              aria-label={t("settings_back")}
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
          </div>
          <div className="settingsHeaderCenter">
            <h1 className="settingsTitle">{t("settings_title")}</h1>
            <p className="settingsSubtitle">{t("settings_desc")}</p>
          </div>
          <div className="settingsHeaderRight">
            <span className="settingsAdminLabel">{t("settings_admin_only")}</span>
          </div>
        </header>

        <main className="settingsMain">
          {import.meta.env.DEV && (
            <div className="settingsDevRow">
              <button
                type="button"
                className="settingsDevBtn"
                onClick={async () => {
                  try {
                    const res = await invokeCreateStaff({ staffId: "ping", displayName: "ping", action: "ping" });
                    console.log("[settings ping]", res);
                  } catch (e) {
                    console.warn("[settings ping] failed", e);
                  }
                }}
              >
                PING
              </button>
            </div>
          )}

          {accessRole !== "admin" && (
            <div className="settingsWarning">
              <div className="settingsWarningText">{t("settings_admin_only")}</div>
              <button
                type="button"
                className="settingsOutlineBtn warningBtn"
                onClick={async () => {
                  await supabase.auth.signOut();
                  clearAppSession();
                  clearSession();
                  nav("/login", { replace: true });
                }}
              >
                {t("common_logout")}
              </button>
            </div>
          )}

          <section className="settingsCard">
            <div className="settingsCardHeader">
              <h2 className="settingsCardTitle">{t("settings_staff_list")}</h2>
              <span className="settingsBadge">{staffCountLabel}</span>
            </div>

            <div className="settingsCardBody">
              {loading ? (
                <div className="settingsEmpty">{t("common_loading")}</div>
              ) : staff.length === 0 ? (
                <div className="settingsEmpty">{t("common_no_record")}</div>
              ) : (
                staff.map((s) => {
                  const label = s.name ?? s.displayName ?? s.staffId;
                  const isEditing = editingId === s.staffId;

                  return (
                    <div key={s.staffId} className="staffRowWrap">
                      <div className="staffRow">
                        <div className="staffAvatar">{label.charAt(0)}</div>
                        <div className="staffInfo">
                          <span className="staffName">{label}</span>
                          <span className="staffId">ID: {s.staffId}</span>
                        </div>

                        <div className="staffActions">
                          {!isEditing && (
                            <>
                              <button
                                className="settingsOutlineBtn"
                                type="button"
                                onClick={() => {
                                  setEditingId(s.staffId);
                                  setEditPw("");
                                  setEditErr("");
                                  setEditMsg("");
                                }}
                                disabled={accessRole !== "admin"}
                              >
                                {t("settings_change_staff_password")}
                              </button>

                              <button
                                className="settingsOutlineBtn dangerBtn"
                                type="button"
                                onClick={() => {
                                  if (!confirm(t("settings_confirm_delete_staff"))) return;
                                  onDeleteStaff(s.staffId, label, false);
                                }}
                                disabled={accessRole !== "admin"}
                              >
                                {t("settings_delete")}
                              </button>

                              {import.meta.env.DEV && enableHardDelete && (
                                <button
                                  className="settingsOutlineBtn dangerBtn"
                                  type="button"
                                  onClick={() => {
                                    if (!confirm("HARD DELETE (DEV). Continue?")) return;
                                    onDeleteStaff(s.staffId, label, true);
                                  }}
                                  disabled={accessRole !== "admin"}
                                >
                                  HARD
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {isEditing && (
                        <div className="staffPwEdit">
                          <div className="staffPwEditInputRow">
                            <input
                              type="password"
                              value={editPw}
                              onChange={(e) => setEditPw(e.target.value)}
                              placeholder={t("settings_change_staff_password")}
                              className="staffInput staffPwEditInput"
                            />
                          </div>

                          <div className="staffPwEditActions">
                            <button
                              className="staffPwEditBtn staffPwEditBtnGhost"
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setEditPw("");
                              }}
                            >
                              {t("common_cancel")}
                            </button>

                            <button
                              className="staffPwEditBtn staffPwEditBtnPrimary"
                              type="button"
                              onClick={() => onSaveStaffPw(s.staffId, label)}
                            >
                              {t("common_save")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="settingsCardFooter">
              <button
                className="settingsPrimaryBtn"
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                disabled={atLimit || accessRole !== "admin"}
              >
                {t("settings_add_staff")}
              </button>
              {atLimit && <p className="settingsHint">{t("settings_staff_limit")}</p>}
            </div>
          </section>

          {showAddForm && (
            <section className="settingsCard">
              <div className="settingsAdminHeader">
                <span className="material-symbols-outlined">shield</span>
                <span className="settingsAdminCaption">NEW</span>
              </div>

              <h2 className="settingsCardTitle">{t("settings_add_staff")}</h2>

              <form className="settingsForm" onSubmit={onAddStaff}>
                <div className="settingsField">
                  <label className="settingsLabel" htmlFor="new-employee-id">
                    {t("settings_staff_id")}
                  </label>
                  <div className="settingsInputWrap">
                    <span className="material-symbols-outlined">badge</span>
                    <input
                      className="settingsInput"
                      id="new-employee-id"
                      placeholder={t("settings_staff_id")}
                      type="text"
                      value={newStaffId}
                      onChange={(e) => setNewStaffId(e.target.value)}
                    />
                  </div>
                </div>

                <div className="settingsField">
                  <label className="settingsLabel" htmlFor="new-employee-name">
                    {t("settings_staff_name")}
                  </label>
                  <div className="settingsInputWrap">
                    <span className="material-symbols-outlined">person</span>
                    <input
                      className="settingsInput"
                      id="new-employee-name"
                      placeholder={t("settings_staff_name")}
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="settingsField">
                  <label className="settingsLabel" htmlFor="new-employee-password">
                    {t("settings_staff_password_init")}
                  </label>
                  <div className="settingsInputWrap">
                    <span className="material-symbols-outlined">lock</span>
                    <input
                      className="settingsInput"
                      id="new-employee-password"
                      placeholder={t("settings_staff_password_init")}
                      type="password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                    />
                  </div>
                </div>

                {addError && <div className="settingsError">{addError}</div>}
                {addSuccess && <div className="settingsSuccess">{addSuccess}</div>}

                <button
                  className="settingsPrimaryBtn"
                  type="submit"
                  disabled={atLimit || accessRole !== "admin"}
                >
                  {t("common_save")}
                </button>
              </form>
            </section>
          )}

          <section className="settingsCard">
            <div className="settingsAdminHeader">
              <span className="material-symbols-outlined">shield</span>
              <span className="settingsAdminCaption">ADMIN</span>
            </div>

            <h2 className="settingsCardTitle">{t("settings_admin_password_change")}</h2>

            <form className="settingsForm" onSubmit={onChangeAdminPw}>
              <div className="settingsField">
                <label className="settingsLabel" htmlFor="current-admin-password">
                  {t("settings_admin_password_current")}
                </label>
                <div className="settingsInputWrap">
                  <span className="material-symbols-outlined">lock</span>
                  <input
                    className="settingsInput"
                    id="current-admin-password"
                    placeholder={t("settings_admin_password_current")}
                    type="password"
                    value={adminCurrentPw}
                    onChange={(e) => setAdminCurrentPw(e.target.value)}
                  />
                </div>
              </div>

              <div className="settingsField">
                <label className="settingsLabel" htmlFor="new-admin-password">
                  {t("settings_admin_password_new")}
                </label>
                <div className="settingsInputWrap">
                  <span className="material-symbols-outlined">key</span>
                  <input
                    className="settingsInput"
                    id="new-admin-password"
                    placeholder={t("settings_admin_password_new")}
                    type="password"
                    value={adminNewPw}
                    onChange={(e) => setAdminNewPw(e.target.value)}
                  />
                </div>
              </div>

              {adminErr && <div className="settingsError">{adminErr}</div>}
              {adminMsg && <div className="settingsSuccess">{adminMsg}</div>}

              <button className="settingsPrimaryBtn" type="submit">
                {t("settings_admin_password_submit")}
              </button>
            </form>
          </section>

          {editErr && <div className="settingsError">{editErr}</div>}
          {editMsg && <div className="settingsSuccess">{editMsg}</div>}
        </main>
      </div>
    </div>
  );
}

function pickStepMessage(body: any, rawText?: string | null) {
  if (body && typeof body === "object") {
    const keys = Object.keys(body);
    if (keys.length === 0) return "RAW: (empty body)";
    const step = String(body.step ?? "");
    const detail = String(body.detail ?? body.error ?? "");
    if (!step) return "RAW: (empty step)";
    return `${step}: ${detail}`.trim();
  }
  if (typeof body === "string") return `RAW: ${body.slice(0, 300)}`;
  if (rawText !== undefined && rawText !== null) {
    if (String(rawText).trim() === "") return "RAW: (empty body)";
    return `RAW: ${String(rawText).slice(0, 300)}`;
  }
  return null;
}

function buildErrorMessage(err: any) {
  const status = err?.__status ? `HTTP_${err.__status}` : null;
  const body = err?.__body ?? null;
  const rawText = err?.__rawText ?? null;
  const step = pickStepMessage(body, rawText);
  const code = body?.code ? `code:${String(body.code)}` : null;
  const hint = body?.hint ? `hint:${String(body.hint)}` : null;
  return [status, step, code, hint].filter(Boolean).join(" | ");
}

function isShortPasswordError(err: any) {
  const body = err?.__body ?? {};
  const texts = [err?.message, body?.message, body?.detail, body?.error, err?.__rawText]
    .filter(Boolean)
    .map((x: any) => String(x).toLowerCase());

  return texts.some(
    (msg) =>
      msg.includes("password") &&
      (msg.includes("6") || msg.includes("six")) &&
      (msg.includes("least") || msg.includes("length") || msg.includes("characters"))
  );
}
