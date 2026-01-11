import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { calcDailyWorkMin, minToHhmm } from "../domain/timeCalc";
import { useI18n } from "../i18n/I18nProvider";
import { listByMonth } from "../storage/todayRepo";
import "./staffRecords.css";

function currentMonthKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function shiftMonth(yyyyMm: string, delta: number) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function formatMonthLabel(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return `${y}년 ${m}월`;
}

function formatTime(value?: string | null) {
  if (!value) return "--:--";
  if (value.includes("T")) return value.slice(11, 16);
  return value.slice(0, 5);
}

function formatDateBlock(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00`);
  const dd = String(d.getDate()).padStart(2, "0");
  const dows = ["일", "월", "화", "수", "목", "금", "토"];
  return { dd, dow: dows[d.getDay()] };
}

export default function RecordsPage() {
  const nav = useNavigate();
  const { t } = useI18n();
  const [yyyyMm, setYyyyMm] = useState(currentMonthKey());
  const [isMonthOpen, setIsMonthOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(() => Number(currentMonthKey().split("-")[0]));
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listByMonth(yyyyMm);
        if (!cancelled) setRows(data.sort((a, b) => a.date.localeCompare(b.date)));
      } catch (e: any) {
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

  const stats = useMemo(() => {
    let days = 0;
    let totalWork = 0;
    let completed = 0;
    let holidayDays = 0;

    for (const r of rows) {
      if (r.note === "OFF") {
        holidayDays += 1;
        continue;
      }
      const d = calcDailyWorkMin(r);
      if (d.workMin !== null) {
        completed++;
        totalWork += d.workMin;
      }
      days++;
    }
    const avg = completed === 0 ? 0 : Math.round(totalWork / completed);
    return { days, totalWorkMin: totalWork, avgMin: avg, holidayDays };
  }, [rows]);

  function setMonthFromPicker(year: number, month1: number) {
    const mm = String(month1).padStart(2, "0");
    setYyyyMm(`${year}-${mm}`);
    setIsMonthOpen(false);
  }

  useEffect(() => {
    if (!isMonthOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMonthOpen(false);
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isMonthOpen]);

  const emptyState = !loading && rows.length === 0;

  return (
    <div className="staffRecordsRoot">
      <div className="staffRecordsShell">
        <header className="staffHeader">
          <div className="staffHeaderLeft" aria-hidden="true" />
          <div className="staffHeaderCenter">
            <h1 className="staffHeaderTitle">{t("records_title")}</h1>
            <p className="staffHeaderSub">{t("records_subtitle")}</p>
          </div>
          <div className="staffHeaderRight" />
        </header>

        <section className="monthCard" aria-label="month">
          <button
            className="monthNavBtn"
            type="button"
            onClick={() => setYyyyMm(shiftMonth(yyyyMm, -1))}
            aria-label={t("records_prev_month")}
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button
            type="button"
            className="monthCenter"
            aria-label="select-month"
            onClick={() => {
              setPickerYear(Number(yyyyMm.split("-")[0]));
              setIsMonthOpen(true);
            }}
          >
            <span className="monthLabel">{formatMonthLabel(yyyyMm)}</span>
            <span className="material-symbols-outlined monthChevron">expand_more</span>
          </button>
          <button
            className="monthNavBtn"
            type="button"
            onClick={() => setYyyyMm(shiftMonth(yyyyMm, 1))}
            aria-label={t("records_next_month")}
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </section>

        <section className="kpiCard" aria-label="summary">
          <div className="kpiGrid">
            <div className="kpiItem">
              <span className="kpiLabel">{t("records_stat_days")}</span>
              <span className="kpiValue">{stats.days}</span>
            </div>
            <div className="kpiItem">
              <span className="kpiLabel">{t("records_stat_total")}</span>
              <span className="kpiValue kpiValuePrimary">{minToHhmm(stats.totalWorkMin)}</span>
            </div>
            <div className="kpiItem">
              <span className="kpiLabel">{t("records_stat_avg")}</span>
              <span className="kpiValue">{stats.avgMin ? minToHhmm(stats.avgMin) : "0:00"}</span>
            </div>
            <div className="kpiItem">
              <span className="kpiLabel">{t("records_stat_holiday")}</span>
              <span className="kpiValue">{stats.holidayDays}</span>
            </div>
          </div>
        </section>

        <section className="recordsListSection" aria-label="records">
          <div className="recordsListHeader">
            <h2 className="recordsListTitle">{t("records_list")}</h2>
          </div>

          {loading && <div className="recordsHelper">{t("login_staff_select_placeholder")}</div>}
          {!loading && error && <div className="recordsError">{error}</div>}

          {emptyState ? (
            <div className="emptyCard">
              <span className="material-symbols-outlined emptyIcon">receipt_long</span>
              <div className="emptyTitle">{t("records_empty_title")}</div>
              <div className="emptyDesc">{t("records_empty_desc")}</div>
              <button type="button" className="emptyCta" onClick={() => nav("/")}>{t("records_empty_cta")}</button>
            </div>
          ) : (
            <div className="recordsList">
              {rows.map((r) => {
                const isHoliday = r.note === "OFF";
                const daily = isHoliday ? { workMin: null, breakMin: 0 } : calcDailyWorkMin(r);
                const isIncomplete = !isHoliday && daily.workMin === null && (!!r.checkIn || !!r.checkOut);
                const statusLabel = isHoliday
                  ? t("common_holiday")
                  : isIncomplete
                    ? t("common_incomplete")
                    : t("records_filter_work");
                const badgeClass = isHoliday
                  ? "recordBadge holiday"
                  : isIncomplete
                    ? "recordBadge incomplete"
                    : "recordBadge";
                const { dd, dow } = formatDateBlock(r.date);
                const inTime = formatTime(r.checkIn);
                const outTime = formatTime(r.checkOut);
                const timeLabel = isHoliday
                  ? t("common_holiday")
                  : `${inTime} • ${outTime}`;
                const breakLabel = isHoliday ? t("common_dash") : `${t("today_label_break")} ${minToHhmm(daily.breakMin ?? 0)}`;
                const workLabel = isHoliday ? "--:--" : daily.workMin === null ? "--:--" : minToHhmm(daily.workMin);

                return (
                  <div
                    key={r.date}
                    role="button"
                    tabIndex={0}
                    className="recordItem"
                  >
                    <div className="recordDate">
                      <div className="recordDateMain">{dd}</div>
                      <div className="recordDateSub">{dow}</div>
                    </div>
                    <div className="recordInfo">
                      <div className="recordLine">
                        {!isHoliday && (
                          <span
                            className={`recordDot ${isIncomplete ? "incomplete" : "normal"}`}
                            aria-hidden="true"
                          />
                        )}
                        <span>{timeLabel}</span>
                      </div>
                      <div className="recordLine recordSub">{breakLabel}</div>
                    </div>
                    <div className="recordRight">
                      <div className="recordWork">{workLabel}</div>
                      <span className={badgeClass}>{statusLabel}</span>
                    </div>
                    <span className="material-symbols-outlined recordChevron">chevron_right</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {isMonthOpen && (
        <div className="monthModalOverlay" onMouseDown={() => setIsMonthOpen(false)}>
          <div
            className="monthModalSheet"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="monthSheetHeader">
              <span className="monthSheetTitle">월 선택</span>
              <button type="button" className="monthSheetClose" onClick={() => setIsMonthOpen(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="yearRow">
              <button type="button" className="yearNavBtn" onClick={() => setPickerYear((prev) => prev - 1)}>
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <span className="yearLabel">{pickerYear}년</span>
              <button type="button" className="yearNavBtn" onClick={() => setPickerYear((prev) => prev + 1)}>
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
            <div className="monthGrid">
              {Array.from({ length: 12 }).map((_, idx) => {
                const month1 = idx + 1;
                const isSelected =
                  pickerYear === Number(yyyyMm.split("-")[0]) &&
                  month1 === Number(yyyyMm.split("-")[1]);
                return (
                  <button
                    key={`m-${month1}`}
                    type="button"
                    className={`monthBtn ${isSelected ? "monthBtnActive" : ""}`}
                    onClick={() => setMonthFromPicker(pickerYear, month1)}
                  >
                    {month1}월
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
