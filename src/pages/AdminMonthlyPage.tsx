import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { calcDailyWorkMin, minToHhmm } from "../domain/timeCalc";
import type { WorkRecord } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { listStaffPublic } from "../storage/staffRepo";
import { listByMonth } from "../storage/todayRepo";
import AdminCalendarModal from "../components/admin/AdminCalendarModal";
import AdminMonthPickerModal from "../components/admin/AdminMonthPickerModal";
import PageHeader from "../components/PageHeader";
import "./AdminMonthlyPage.css";

function currentMonthKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

type StaffRow = {
  id: string;
  name: string;
  userId: string | null;
  days: number;
  totalWorkMin: number;
  totalBreakMin: number;
  incompleteDays: number;
  completedDays: number;
  holidayDays: number;
  avgMin: number;
};

export default function AdminMonthlyPage() {
  const nav = useNavigate();
  const [yyyyMm, setYyyyMm] = useState(currentMonthKey());
  const { t, lang } = useI18n();
  if (import.meta.env.DEV) console.log("[UI] AdminMonthlyPage rendered");
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const monthNavRef = useRef<HTMLDivElement | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarStaff, setCalendarStaff] = useState<{ staffId: string; name: string; userId: string } | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(yyyyMm);
  const [calendarRecords, setCalendarRecords] = useState<WorkRecord[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [devInfo, setDevInfo] = useState<{
    beforeContent: string;
    afterContent: string;
    candidates: Array<{ tag: string; className: string; ariaLabel: string; text: string }>;
  } | null>(null);

  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const staffList = await listStaffPublic();
        if (cancelled) return;
        const mapped: StaffRow[] = [];
        for (const s of staffList) {
          if (!s.userId) {
            mapped.push({
              id: s.staffId,
              name: s.name ?? s.displayName ?? s.staffId,
              userId: null,
              days: 0,
              totalWorkMin: 0,
              totalBreakMin: 0,
              incompleteDays: 0,
              completedDays: 0,
              holidayDays: 0,
              avgMin: 0,
            });
            continue;
          }
          const records = await listByMonth(yyyyMm, s.userId);
          let days = 0;
          let totalWorkMin = 0;
          let totalBreakMin = 0;
          let incompleteDays = 0;
          let completedDays = 0;
          let holidayDays = 0;

          for (const r of records) {
            if (r.note === "OFF") {
              holidayDays += 1;
              continue;
            }
            const daily = calcDailyWorkMin(r);
            days += 1;
            totalBreakMin += daily.breakMin ?? 0;
            if (daily.workMin === null) {
              if (r.checkIn || r.checkOut) incompleteDays += 1;
            } else {
              totalWorkMin += daily.workMin;
              completedDays += 1;
            }
          }
          const avgMin = completedDays === 0 ? 0 : Math.round(totalWorkMin / completedDays);
          mapped.push({
            id: s.staffId,
            name: s.name ?? s.displayName ?? s.staffId,
            userId: s.userId,
            days,
            totalWorkMin,
            totalBreakMin,
            incompleteDays,
            completedDays,
            holidayDays,
            avgMin,
          });
        }
        if (cancelled) return;
        setRows(mapped);
        if (import.meta.env.DEV) {
          console.log("[AdminMonthly] loaded", { yyyyMm, staffCount: staffList.length, rows: mapped.length });
          if (mapped[0]) console.log("[AdminMonthly] sample row", mapped[0]);
        }
      } catch (e: any) {
        if (import.meta.env.DEV) console.error("[AdminMonthly] load failed", e);
        if (!cancelled) setError(e?.message ?? "failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [yyyyMm]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      const count = document.querySelectorAll('input[type="month"]').length;
      console.log("[AdminMonthlyPage] month input count", count);
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const root = monthNavRef.current;
    if (!root) return;
    const raf = requestAnimationFrame(() => {
      const beforeContent = getComputedStyle(root, "::before").content;
      const afterContent = getComputedStyle(root, "::after").content;
      const nodes = Array.from(root.querySelectorAll("*"));
      const candidates = nodes
        .filter((node) => {
          const text = node.textContent ?? "";
          const className = typeof node.className === "string" ? node.className : "";
          const isSymbol =
            node.classList.contains("material-symbols-outlined") &&
            ["close", "cancel", "clear"].includes(text.trim());
          return (
            text.includes("×") ||
            className.includes("close") ||
            className.includes("clear") ||
            className.includes("cancel") ||
            isSymbol
          );
        })
        .map((node) => {
          const el = node as HTMLElement;
          return {
            tag: el.tagName.toLowerCase(),
            className: typeof el.className === "string" ? el.className : "",
            ariaLabel: el.getAttribute("aria-label") ?? "",
            text: (el.textContent ?? "").trim(),
          };
        });
      setDevInfo({ beforeContent, afterContent, candidates });
    });
    return () => cancelAnimationFrame(raf);
  }, [yyyyMm]);

  useEffect(() => {
    let cancelled = false;
    async function loadCalendar() {
      if (!calendarOpen || !calendarStaff?.userId) return;
      setCalendarLoading(true);
      setCalendarError(null);
      try {
        const rows = await listByMonth(calendarMonth, calendarStaff.userId);
        if (!cancelled) setCalendarRecords(rows);
      } catch (e: any) {
        if (!cancelled) setCalendarError(e?.message ?? "failed");
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    }
    loadCalendar();
    return () => {
      cancelled = true;
    };
  }, [calendarOpen, calendarStaff?.userId, calendarMonth]);

  const openCalendarForStaff = (row: StaffRow) => {
    if (!row.userId) return;
    setCalendarStaff({ staffId: row.id, name: row.name, userId: row.userId });
    setCalendarMonth(yyyyMm);
    setSelectedDate(null);
    setCalendarOpen(true);
  };

  const totalSummary = useMemo(() => {
    let totalWorkMin = 0;
    let totalBreakMin = 0;
    let totalIncomplete = 0;
    let totalHoliday = 0;
    for (const r of rows) {
      totalWorkMin += r.totalWorkMin;
      totalBreakMin += r.totalBreakMin;
      totalIncomplete += r.incompleteDays;
      totalHoliday += r.holidayDays;
    }
    return { totalWorkMin, totalBreakMin, totalIncomplete, totalHoliday, staffCount: rows.length };
  }, [rows]);

  const skeletonTiles = Array.from({ length: 5 });
  const skeletonRows = Array.from({ length: 4 });

  return (
    <div key={lang} className="monthlyRoot adminMonthly">
      <div className="monthlyShell">
        <div className="monthlyHeader">
          <PageHeader
            title={t("admin_monthly_title")}
            subtitle={t("admin_monthly_desc")}
            backAriaLabel={t("back") ?? "back"}
          />
          <div className="monthNav" ref={monthNavRef}>
            <button
              type="button"
              className="monthCenterBtn"
              onClick={() => setMonthPickerOpen(true)}
              aria-label={t("admin_monthly_select_month") ?? "select month"}
            >
              <span className="monthCenterText">{yyyyMm}</span>
              <span className="material-symbols-outlined monthCenterIcon">expand_more</span>
            </button>
          </div>
        </div>

        <main className="monthlyMain">
          {import.meta.env.DEV && devInfo && (
            <div className="devPanel monthNavDevDebug" aria-live="polite">
              <div className="devRow">
                <span className="devLabel">monthNav ::before</span>
                <span className="devValue">{devInfo.beforeContent}</span>
              </div>
              <div className="devRow">
                <span className="devLabel">monthNav ::after</span>
                <span className="devValue">{devInfo.afterContent}</span>
              </div>
              <div className="devRow devBlock">
                <span className="devLabel">candidates</span>
                <div className="devList">
                  {devInfo.candidates.length === 0 && <span className="devValue">none</span>}
                  {devInfo.candidates.map((item, idx) => (
                    <span key={`cand-${idx}`} className="devValue">
                      {item.tag} {item.className} {item.ariaLabel} {item.text}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <section className="summarySection" aria-label={t("admin_monthly_title")}>
            <div className="summaryCard">
              <div className="summaryGrid">
                {loading
                  ? skeletonTiles.map((_, idx) => (
                      <div key={`summary-skel-${idx}`} className="summaryTile summarySkeleton" aria-hidden="true">
                        <span className="skeletonBlock skeletonValue" />
                        <span className="skeletonBlock skeletonLabel" />
                      </div>
                    ))
                  : (
                    <>
                      <div className="summaryTile">
                        <span className="summaryValue">{minToHhmm(totalSummary.totalWorkMin)}</span>
                        <span className="summaryLabel">{t("admin_monthly_th_total")}</span>
                      </div>
                      <div className="summaryTile">
                        <span className="summaryValue">{minToHhmm(totalSummary.totalBreakMin)}</span>
                        <span className="summaryLabel">{t("today_sum_break")}</span>
                      </div>
                      <div className="summaryTile summaryTintIncomplete">
                        <span className="summaryValue">{totalSummary.totalIncomplete}</span>
                        <span className="summaryLabel">{t("admin_monthly_th_incomplete")}</span>
                      </div>
                      <div className="summaryTile">
                        <span className="summaryValue">{totalSummary.staffCount}</span>
                        <span className="summaryLabel">{t("admin_monthly_th_staff")}</span>
                      </div>
                      <div className="summaryTile summaryTintHoliday summaryWide">
                        <span className="summaryLabel">{t("common_holiday")}</span>
                        <span className="summaryValue">{totalSummary.totalHoliday}</span>
                      </div>
                    </>
                  )}
              </div>
            </div>
          </section>

          <section className="staffSection" aria-label={t("admin_monthly_staff_list")}>
            <div className="staffHeader">
              <h2 className="staffTitle">{t("admin_monthly_staff_list")}</h2>
              <span className="staffCount">
                {rows.length} {t("admin_monthly_th_staff")}
              </span>
            </div>
            <div className="staffCard">
              {loading &&
                skeletonRows.map((_, idx) => (
                  <div key={`row-skel-${idx}`} className="staffRow skeletonRow" aria-hidden="true">
                    <div className="staffLeft">
                      <div className="staffAvatar skeletonCircle" />
                      <div className="staffInfo">
                        <span className="skeletonBlock skeletonName" />
                        <span className="skeletonBlock skeletonMeta" />
                      </div>
                    </div>
                    <div className="staffChips">
                      <span className="skeletonBlock skeletonChip" />
                      <span className="skeletonBlock skeletonChip" />
                      <span className="skeletonBlock skeletonChip" />
                    </div>
                  </div>
                ))}

              {!loading &&
                rows.map((r) => {
                  const incompleteMuted = r.incompleteDays === 0;
                  const holidayMuted = r.holidayDays === 0;
                  const detailHref = `/admin/staff/${r.id}?month=${encodeURIComponent(yyyyMm)}&userId=${encodeURIComponent(r.userId ?? "")}`;
                  const onRowNavigate = () => nav(detailHref);
                  return (
                    <div
                      key={r.id}
                      role="button"
                      tabIndex={0}
                      onClick={onRowNavigate}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowNavigate();
                        }
                      }}
                      className="staffRow"
                    >
                      <div className="staffLeft">
                        <div className="staffAvatar">{r.name.charAt(0)}</div>
                        <div className="staffInfo">
                          <span className="staffName">{r.name}</span>
                          <span className="staffId">{r.id}</span>
                        </div>
                      </div>
                      <div className="staffCenter">
                        <div className="staffChips">
                          <div className="chip chipInline chipWork">
                            <span className="chipLabel chipInlineLabel">{t("admin_monthly_th_total")}</span>
                            <span className="chipValue chipInlineValue">{minToHhmm(r.totalWorkMin)}</span>
                          </div>
                          <div className={`chip chipInline chipIncomplete ${incompleteMuted ? "chipMuted" : ""}`}>
                            <span className="chipLabel chipInlineLabel">{t("admin_monthly_th_incomplete")}</span>
                            <span className="chipValue chipInlineValue">{r.incompleteDays}</span>
                          </div>
                          <div className={`chip chipInline chipHoliday ${holidayMuted ? "chipMuted" : ""}`}>
                            <span className="chipLabel chipInlineLabel">{t("common_holiday")}</span>
                            <span className="chipValue chipInlineValue">{r.holidayDays}</span>
                          </div>
                        </div>
                      </div>
                      <div className="staffRight">
                        <button
                          type="button"
                          className="staffCalBtn"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCalendarForStaff(r);
                          }}
                          aria-label={t("calendar") ?? "calendar"}
                          disabled={!r.userId}
                        >
                          <span className="material-symbols-outlined">calendar_month</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

              {!loading && rows.length === 0 && !error && (
                <div className="emptyState">{t("admin_monthly_empty_staff")}</div>
              )}

              {!loading && error && (
                <div className="errorState">{error}</div>
              )}
            </div>
          </section>
        </main>
      </div>
      <AdminMonthPickerModal
        open={monthPickerOpen}
        yyyyMm={yyyyMm}
        onClose={() => setMonthPickerOpen(false)}
        onSelect={(val) => setYyyyMm(val)}
      />
      <AdminCalendarModal
        open={calendarOpen}
        yyyyMm={calendarMonth}
        staffName={calendarStaff?.name ?? ""}
        records={calendarRecords}
        loading={calendarLoading}
        error={calendarError}
        selectedDate={selectedDate}
        onClose={() => setCalendarOpen(false)}
        onPrevMonth={() => {
          const [y, m] = calendarMonth.split("-").map(Number);
          const dt = new Date(y, m - 2, 1);
          setCalendarMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
        }}
        onNextMonth={() => {
          const [y, m] = calendarMonth.split("-").map(Number);
          const dt = new Date(y, m, 1);
          setCalendarMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
        }}
        onSelectDate={(date) => setSelectedDate(date)}
      />
    </div>
  );
}
