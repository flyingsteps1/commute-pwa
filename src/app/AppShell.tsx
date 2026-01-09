import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearSession } from "../auth/session";
import { useI18n } from "../i18n/I18nProvider";
import { fetchMyProfile, signOutAll } from "../storage/authApi";
import { clearAppSession, getAppSession, setAppSession } from "../storage/appSession";
import { supabase } from "../storage/supabaseClient";

function Tab({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: string;
}) {
  return (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => `tab ${isActive ? "tabActive" : ""}`} aria-label={label}>
      <span className="material-symbols-outlined tabIcon" aria-hidden="true">
        {icon}
      </span>
      <div className="tabLabel">{label}</div>
    </NavLink>
  );
}

export default function AppShell() {
  const loc = useLocation();
  const nav = useNavigate();
  const { t } = useI18n();

  const [hydrated, setHydrated] = useState(false);
  const [appSession, setAppSessionState] = useState(getAppSession());

  const userLabel = appSession?.displayName || "";
  const isAdmin = appSession?.role === "admin";
  const hideTab = loc.pathname.startsWith("/print");

  // Hydrate from Supabase auth first, then restore app_session if missing
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const { data } = await supabase.auth.getSession();
        const supaSession = data.session;
        let localSession = getAppSession();
        if (!localSession && supaSession) {
          const profile = await fetchMyProfile();
          setAppSession({
            role: profile.role,
            workplaceId: profile.workplace_id,
            staffId: profile.staff_id ?? "",
            displayName: profile.display_name,
          });
          localSession = getAppSession();
        }
        if (!cancelled) setAppSessionState(localSession);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // After hydration: route guard based on presence + role
  useEffect(() => {
    if (!hydrated) return;
    const path = loc.pathname;
    if (!appSession) {
      if (path !== "/login") {
        console.log("[AppShell] redirect", { from: path, to: "/login", role: null, reason: "no appSession" });
        nav("/login", { replace: true });
      }
      return;
    }
    if (path === "/login") {
      const to = appSession.role === "admin" ? "/admin" : "/";
      console.log("[AppShell] redirect", { from: path, to, role: appSession.role, reason: "has appSession on /login" });
      nav(to, { replace: true });
      return;
    }
    if (appSession.role === "staff" && path.startsWith("/admin")) {
      console.log("[AppShell] redirect", { from: path, to: "/", role: "staff", reason: "staff on admin route" });
      nav("/", { replace: true });
      return;
    }
    if (appSession.role === "admin" && !path.startsWith("/admin") && path !== "/print") {
      console.log("[AppShell] redirect", { from: path, to: "/admin", role: "admin", reason: "admin default" });
      nav("/admin", { replace: true });
    }
  }, [hydrated, appSession, loc.pathname, nav]);

  async function onLogout() {
    try {
      await signOutAll();
    } catch (e) {
      console.error("[AppShell] signOutAll failed", e);
    }
    clearSession();
    clearAppSession();
    setAppSessionState(null);
    if (loc.pathname !== "/login") {
      nav("/login", { replace: true });
    }
  }

  if (!hydrated) return <div style={{ padding: 20 }}>Hydrating...</div>;

  return (
    <div className="appRoot">
      <div className="appMain">
        {!hideTab && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "10px 14px 0" }}>
            <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 800 }}>{userLabel ? `${t("today")}: ${userLabel}` : ""}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={onLogout}
                style={{
                  border: "1px solid color-mix(in srgb, #000 12%, transparent)",
                  background: "white",
                  color: "#ef4444",
                  fontWeight: 800,
                  borderRadius: 12,
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                {t("logout")}
              </button>
            </div>
          </div>
        )}
        <Outlet />
      </div>

      {!hideTab && (
        <nav className="tabBar" aria-label="Bottom Tabs">
          <div className="tabBarInner">
            {!isAdmin ? (
              <>
                <Tab to="/" label={t("today")} icon="today" />
                <Tab to="/monthly" label={t("monthly")} icon="calendar_month" />
                <Tab to="/records" label={t("records")} icon="list_alt" />
              </>
            ) : (
              <>
                <Tab to="/admin" label={t("dashboard")} icon="dashboard" />
                <Tab to="/admin/monthly" label={t("monthly")} icon="calendar_month" />
                <Tab to="/admin/records" label={t("records")} icon="list_alt" />
                <Tab to="/admin/settings" label={t("settings")} icon="settings" />
              </>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
