import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";
import { listStaffPublic, type StaffPublic } from "../storage/staffRepo";
import { supabase } from "../storage/supabaseClient";
import { normalizeWorkRecord } from "../storage/todayRepo";
import AdminCalendarModal from "../components/admin/AdminCalendarModal";
import AdminDayDetailModal from "../components/admin/AdminDayDetailModal";
import PageHeader from "../components/PageHeader";
import "./AdminDashboardPage.css";

type TodayStatusCode = "working" | "break" | "off" | "no_record" | "incomplete" | "holiday";

type TodayStatus = {
  code: TodayStatusCode;
  detailTime?: string;
  detailKind?: "check_in" | "check_out";
};

function hhmmFromTimestamp(ts?: string | null) {
  if (!ts) return undefined;
  try {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d.toISOString().substring(11, 16);
  } catch {
    /* ignore */
  }
  return ts.slice(11, 16);
}

function statusFromRecord(r?: any): TodayStatus {
  if (!r) return { code: "no_record" };
  if (r.note === "OFF") return { code: "holiday" };
  const checkIn = r.checkIn;
  const checkOut = r.checkOut;
  if (checkIn && checkOut) return { code: "off", detailTime: hhmmFromTimestamp(checkOut), detailKind: "check_out" };
  if (checkIn && !checkOut) return { code: "working", detailTime: hhmmFromTimestamp(checkIn), detailKind: "check_in" };
  return { code: "no_record" };
}

export default function AdminDashboardPage() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const [staff, setStaff] = useState<StaffPublic[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState(() => todayKey.slice(0, 7));

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const staffList = await listStaffPublic();
      setStaff(staffList);
      const userIds = staffList.map((s) => s.userId).filter(Boolean) as string[];
      if (userIds.length === 0) {
        setRecords([]);
      } else {
        const { data, error: recErr, status } = await supabase
          .from("work_records")
          .select("date, staff_user_id, check_in, check_out, break_minutes, note")
          .eq("date", todayKey)
          .in("staff_user_id", userIds);
        if (recErr) {
          if (import.meta.env.DEV) console.error("[AdminDashboard] records error", { status, recErr });
          throw recErr;
        }
        setRecords((data ?? []).map(normalizeWorkRecord));
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const statuses = staff.map((s) => {
    const rec = records.find((r) => r.staff_user_id && s.userId && r.staff_user_id === s.userId);
    return { ...s, status: statusFromRecord(rec) };
  });

  const summary = useMemo(() => {
    let working = 0;
    let breaking = 0;
    let checkout = 0;
    let holiday = 0;
    for (const s of statuses) {
      if (s.status.code === "working") working++;
      else if (s.status.code === "break") breaking++;
      else if (s.status.code === "off") checkout++;
      else if (s.status.code === "holiday") holiday++;
    }
    return { working, breaking, checkout, holiday };
  }, [statuses]);

  const skeletonStats = Array.from({ length: 4 });
  const skeletonRows = Array.from({ length: 5 });

  return (
    <div key={lang} className="adminRoot">
      <div className="adminShell">
        <PageHeader
          title={t("admin_dashboard_title")}
          subtitle={t("admin_dashboard_subtitle_today")}
          backAriaLabel={t("back") ?? "back"}
          rightSlot={(
            <button
              type="button"
              className="pageHeaderBtn pageHeaderBtnAccent"
              onClick={() => setCalendarOpen(true)}
              aria-label={t("calendar") ?? "calendar"}
            >
              <span className="material-symbols-outlined">calendar_today</span>
            </button>
          )}
        />

        <main className="adminMain noScrollbar">
          <section aria-label="Summary Statistics" className="statsSection">
            <div className="statsGrid">
              {loading
                ? skeletonStats.map((_, idx) => (
                    <div key={`stat-skeleton-${idx}`} className="statCard skeletonCard" aria-hidden="true">
                      <span className="skeletonBlock skeletonNumber" />
                      <span className="skeletonBlock skeletonLabel" />
                    </div>
                  ))
                : (
                  <>
                    <div className="statCard">
                      <span className="statValue">{summary.working}</span>
                      <span className="statLabel">{t("common_working")}</span>
                    </div>
                    <div className="statCard">
                      <span className="statValue">{summary.breaking}</span>
                      <span className="statLabel">{t("common_break")}</span>
                    </div>
                    <div className="statCard">
                      <span className="statValue">{summary.checkout}</span>
                      <span className="statLabel">{t("common_off")}</span>
                    </div>
                    <div className="statCard">
                      <span className="statValue">{summary.holiday}</span>
                      <span className="statLabel">{t("common_holiday")}</span>
                    </div>
                  </>
                )}
            </div>
          </section>

          <section aria-label="Staff List" className="listSection">
            <h2 className="listTitle">{t("admin_dashboard_staff_list")}</h2>
            <div className="listCard">
              {loading
                ? skeletonRows.map((_, idx) => (
                    <div key={`row-skeleton-${idx}`} className="staffRow skeletonRow" aria-hidden="true">
                      <div className="avatar skeletonAvatar" />
                      <div className="staffInfo">
                        <span className="skeletonBlock skeletonName" />
                        <span className="skeletonBlock skeletonMeta" />
                      </div>
                      <span className="skeletonBlock skeletonPill" />
                    </div>
                  ))
                : statuses.map((s) => (
                    <button
                      key={s.staffId}
                      type="button"
                      className="staffRow"
                      onClick={() => nav(`/admin/staff/${s.staffId}`)}
                    >
                      <div className="avatar">
                        {(s.name || s.staffId || t("common_staff")).charAt(0)}
                      </div>
                      <div className="staffInfo">
                        <p className="staffName">{s.name || s.staffId || t("common_staff")}</p>
                        <p className="staffMeta">{s.staffId}</p>
                      </div>
                      <div className="rightCol">
                        <StatusPill status={s.status} />
                        {formatDetail(s.status, t)}
                      </div>
                    </button>
                  ))}

              {!loading && statuses.length === 0 && (
                <div className="emptyState">{t("common_no_record")}</div>
              )}

              {error && !loading && (
                <div className="errorText">
                  {error}
                </div>
              )}
            </div>
          </section>
        </main>

        <AdminCalendarModal
          open={calendarOpen}
          yyyyMm={monthKey}
          onClose={() => setCalendarOpen(false)}
          onShiftMonth={(d) => {
            const [y, m] = monthKey.split("-").map(Number);
            const dt = new Date(y, m - 1 + d, 1);
            const next = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
            setMonthKey(next);
          }}
          onSelectDate={(d) => setDetailDate(d)}
        />

        <AdminDayDetailModal
          open={!!detailDate}
          dateISO={detailDate ?? ""}
          onClose={() => setDetailDate(null)}
        />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: TodayStatus }) {
  const { t } = useI18n();
  const map: Record<
    TodayStatus["code"],
    { className: string; label: string }
  > = {
    working: { className: "statusWorking", label: t("common_working") },
    break: { className: "statusBreak", label: t("common_break") },
    off: { className: "statusOff", label: t("common_off") },
    holiday: { className: "statusHoliday", label: t("common_holiday") },
    no_record: { className: "statusNoRecord", label: t("common_no_record") },
    incomplete: { className: "statusIncomplete", label: t("common_incomplete") },
  };
  const m = map[status.code];
  return (
    <span className={`statusPill ${m.className}`}>
      {m.label}
    </span>
  );
}

function formatDetail(status: TodayStatus, t: (k: string) => string) {
  if (!status.detailTime || !status.detailKind) return null;
  const map: Record<"check_in" | "check_out", string> = {
    check_in: "common_check_in",
    check_out: "common_check_out",
  };
  const key = map[status.detailKind];
  return (
    <span className="rowDetail">
      {status.detailTime} {t(key)}
    </span>
  );
}
