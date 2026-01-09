import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getSession, clearSession } from "../auth/session";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { supabase } from "../storage/supabaseClient";
import { requireActiveStaff } from "../storage/staffRepo";
import { clearAppSession } from "../storage/appSession";
import { useI18n } from "../i18n/I18nProvider";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const session = getSession();
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    async function checkInactiveStaff() {
      const s = getSession();
      if (!s || s.role !== "staff") return;
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const active = await requireActiveStaff(userId);
      if (!active.ok && active.reason === "inactive") {
        await supabase.auth.signOut();
        clearSession();
        clearAppSession();
        if (!cancelled) {
          alert(t("auth_inactive_staff"));
          nav("/login", { replace: true, state: { from: loc.pathname + loc.search } });
        }
      }
    }

    checkInactiveStaff();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      checkInactiveStaff();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loc.pathname, loc.search, nav, t]);

  if (!session) {
    return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  }

  if (session.role === "admin" && loc.pathname === "/") {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
