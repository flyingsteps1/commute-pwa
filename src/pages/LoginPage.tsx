import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { setSession } from "../auth/session";
import { useI18n } from "../i18n/I18nProvider";
import { listStaffPublic, requireActiveStaff } from "../storage/staffRepo";
import { signInAdmin, signInStaff } from "../storage/authApi";
import type { StaffPublic } from "../storage/staffRepo";
import { supabase } from "../storage/supabaseClient";
import "./LoginPage.css";

type Role = "admin" | "staff";

export default function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();

  const [role, setRole] = useState<Role>("admin");
  const [password, setPassword] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [staffError, setStaffError] = useState("");
  const [staffList, setStaffList] = useState<StaffPublic[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { lang, setLang, t } = useI18n();
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
  }, [lang]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    async function loadStaff() {
      setLoadingStaff(true);
      setStaffError("");
      try {
        const staff = await listStaffPublic();
        if (!cancelled) setStaffList(staff);
      } catch (err) {
        console.error(err);
        if (!cancelled) setStaffError((err as Error)?.message || "Failed to load staff list.");
      } finally {
        if (!cancelled) setLoadingStaff(false);
      }
    }
    loadStaff();
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const from = (loc.state as any)?.from as string | undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!password.trim()) {
      setError(t("login_password_placeholder"));
      return;
    }
    if (role === "staff" && !selectedStaffId) {
      setError(t("login_staff_select_placeholder"));
      return;
    }

    setSubmitting(true);
    try {
      if (role === "admin") {
        const profile = await signInAdmin(password);
        setSession({ role: "admin", staffName: profile.display_name, loggedInAt: Date.now() });
        nav("/admin", { replace: true });
        return;
      }

      const staff = staffList.find((s) => s.staffId === selectedStaffId);
      const displayName = staff?.name ?? staff?.displayName ?? staff?.staffId ?? selectedStaffId;
      const profile = await signInStaff(selectedStaffId, password, displayName);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (userId) {
        const active = await requireActiveStaff(userId);
        if (!active.ok && active.reason === "inactive") {
          await supabase.auth.signOut();
          setError(t("auth_inactive_staff"));
          return;
        }
      }
      setSession({
        role: "staff",
        staffId: profile.staff_id ?? selectedStaffId,
        staffName: profile.display_name,
        loggedInAt: Date.now(),
      });
      nav(from || "/", { replace: true });
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || "";
      if (import.meta.env.DEV && err?.message) {
        setError(err.message);
      } else {
        setError(msg || t("login_password_placeholder"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isStaff = role === "staff";
  const showInactiveBanner = error === t("auth_inactive_staff");

  return (
    <div className="loginRoot">
      <div className="loginShell">
        <header className="loginHeader ptSafe">
          <div className="loginIconCard">
            <span className="material-symbols-outlined loginIcon">schedule</span>
          </div>
          <div className="loginBrand">
            <div className="loginTitleWrap">
              <h1 className="loginTitle">{t("app_title")}</h1>
              <p className="loginSubtitle">{t("app_desc")}</p>
            </div>
            <div className="langToggle" role="group" aria-label="language">
              <button
                type="button"
                className={`langPill ${lang === "ko" ? "langActive" : ""}`}
                onClick={() => setLang("ko")}
              >
                한국어
              </button>
              <button
                type="button"
                className={`langPill ${lang === "ja" ? "langActive" : ""}`}
                onClick={() => setLang("ja")}
              >
                日本語
              </button>
            </div>
          </div>
        </header>

        <main className="loginMain">
          <div className="loginCard">
            <div className="segmented">
              <label className="segOption">
                <input
                  className="segInput"
                  name="login_type"
                  type="radio"
                  value="admin"
                  checked={role === "admin"}
                  onChange={() => setRole("admin")}
                />
                <span className="segButton">{t("login_admin")}</span>
              </label>
              <label className="segOption">
                <input
                  className="segInput"
                  name="login_type"
                  type="radio"
                  value="staff"
                  checked={role === "staff"}
                  onChange={() => setRole("staff")}
                />
                <span className="segButton">{t("login_staff")}</span>
              </label>
            </div>

            <form className="loginForm" onSubmit={handleSubmit}>
              {isStaff && (
                <div className="formField">
                  <label className="fieldLabel" htmlFor="staff-select">
                    {t("login_staff_select_label")}
                  </label>
                  <div className="selectWrap">
                    <select
                      id="staff-select"
                      className="selectInput"
                      value={selectedStaffId}
                      onChange={(e) => setSelectedStaffId(e.target.value)}
                      disabled={loadingStaff}
                    >
                      <option value="" disabled>
                        {loadingStaff ? "Loading staff..." : t("login_staff_select_placeholder")}
                      </option>
                      {staffList.map((s) => (
                        <option key={s.staffId} value={s.staffId}>
                          {s.name ?? s.displayName ?? s.staffId}
                        </option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined selectIcon">expand_more</span>
                  </div>
                  {!loadingStaff && staffList.length === 0 && !staffError && (
                    <p className="fieldHint">{t("login_staff_select_placeholder")}</p>
                  )}
                  {staffError && <p className="fieldError">{staffError}</p>}
                </div>
              )}

              <div className="formField">
                <label className="fieldLabel" htmlFor="password-input">
                  {t("login_password_label")}
                </label>
                <div className="inputWrap">
                  <input
                    id="password-input"
                    className="textInput"
                    placeholder={t("login_password_placeholder")}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                  />
                  <button
                    className="iconButton"
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label="toggle-password"
                  >
                    <span className="material-symbols-outlined">{showPassword ? "visibility" : "visibility_off"}</span>
                  </button>
                </div>
                {error && (
                  <div className="fieldError inlineError">
                    <span className="material-symbols-outlined">error</span>
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <button
                className="primaryButton"
                type="submit"
                disabled={submitting || (isStaff && staffList.length === 0)}
              >
                {submitting ? <span className="spinner" aria-hidden="true" /> : null}
                <span>{t("login_button")}</span>
                <span className="material-symbols-outlined arrowIcon">arrow_forward</span>
              </button>
            </form>

            <a className="helperLink" href="#">
              {t("login_forgot_password")}
            </a>
          </div>

          <div className={`inactiveBanner ${showInactiveBanner ? "inactiveVisible" : ""}`}>
            <p>{t("auth_inactive_staff")}</p>
          </div>
        </main>

        <footer className="loginFooter pbSafe">
          <p>{t("app_desc")} | {t("version")}</p>
        </footer>
      </div>
    </div>
  );
}
