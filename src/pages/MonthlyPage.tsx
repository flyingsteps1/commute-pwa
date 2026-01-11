import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { calcDailyWorkMin, calcMonthlySummary, minToHhmm } from "../domain/timeCalc";
import { useI18n } from "../i18n/I18nProvider";
import { getAppSession } from "../storage/appSession";
import { listByMonth } from "../storage/todayRepo";
import "./staffMonthly.css";

function currentMonthKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export default function MonthlyPage() {
  const nav = useNavigate();
  const [yyyyMm, setYyyyMm] = useState(currentMonthKey());
  const { t, lang } = useI18n();
  const [summary, setSummary] = useState(() => calcMonthlySummary([], yyyyMm));
  const [holidayDays, setHolidayDays] = useState(0);
  const [rows, setRows] = useState<Array<{ date: string; checkIn?: string | null; checkOut?: string | null; breakMin?: number | null; note?: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthModalOpen, setMonthModalOpen] = useState(false);
  const [draftYear, setDraftYear] = useState(Number(currentMonthKey().split("-")[0]));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await listByMonth(yyyyMm);
        if (cancelled) return;
        setRows(rows);
        setSummary(calcMonthlySummary(rows, yyyyMm));
        setHolidayDays(rows.filter((r) => r.note === "OFF").length);
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

  function onPrint() {
    const dash = t("common_dash");
    const totalWork = minToHhmm(summary.totalWork ?? 0);
    const totalBreak = minToHhmm(summary.totalBreak ?? 0);
    const recordMap = new Map(rows.map((r) => [r.date, r]));
    const [yearNum, monthNum] = yyyyMm.split("-").map(Number);
    const totalDays = Number.isNaN(yearNum) || Number.isNaN(monthNum) ? 31 : new Date(yearNum, monthNum, 0).getDate();
    const allDates = Array.from({ length: totalDays }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return `${yyyyMm}-${day}`;
    });
    const rowHtml = allDates
      .map((date) => {
        const r = recordMap.get(date);
        const isHoliday = r?.note === "OFF";
        const hasCheckIn = !!r?.checkIn;
        const hasCheckOut = !!r?.checkOut;
        const daily = r && !isHoliday ? calcDailyWorkMin(r as any) : { workMin: null, breakMin: 0 };
        const statusText = isHoliday
          ? t("common_holiday")
          : hasCheckIn && hasCheckOut
            ? t("print_status_complete")
            : hasCheckIn && !hasCheckOut
              ? t("print_status_working")
              : hasCheckIn || hasCheckOut
                ? t("common_incomplete")
                : t("common_no_record");
        const statusClass = isHoliday
          ? "stHoliday"
          : hasCheckIn && hasCheckOut
            ? "stComplete"
            : hasCheckIn && !hasCheckOut
              ? "stWorking"
              : hasCheckIn || hasCheckOut
                ? "stIncomplete"
                : "stNone";
        const checkIn = isHoliday ? dash : r?.checkIn ?? dash;
        const checkOut = isHoliday ? dash : r?.checkOut ?? dash;
        const breakMin = isHoliday ? dash : String(r?.breakMin ?? 0);
        const workText = isHoliday ? dash : daily.workMin === null ? dash : minToHhmm(daily.workMin);
        return `
          <tr>
            <td>${date}</td>
            <td class="tCenter">${checkIn}</td>
            <td class="tCenter">${checkOut}</td>
            <td class="tRight">${breakMin}</td>
            <td class="tRight">${workText}</td>
            <td class="tCenter ${statusClass}">${statusText}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <style>
        @page { size: A4; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: "Noto Sans KR", "Noto Sans", system-ui, -apple-system, sans-serif; color: #0e121b; }
        .printWrap { color: #0e121b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .printH1 { font-size: 16px; font-weight: 800; margin: 0 0 4px; }
        .printMeta { margin: 0 0 8px; color: #5b6775; font-size: 11px; }
        .summaryGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin: 6px 0 10px; }
        .summaryCard { border: 1px solid #e6ebef; border-radius: 6px; padding: 6px; }
        .summaryLabel { display: block; font-size: 10px; color: #5b6775; margin-bottom: 2px; }
        .summaryVal { font-size: 12px; font-weight: 700; }
        .tableWrap { border: 1px solid #e6ebef; border-radius: 6px; overflow: hidden; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
        th, td { border: 1px solid #e6ebef; padding: 4px 5px; line-height: 1.2; }
        th { background: #f5f7fb; font-weight: 600; color: #0e121b; }
        thead { display: table-header-group; }
        tbody tr:nth-child(even) { background: #fafbfc; }
        tr { page-break-inside: avoid; }
        .tRight { text-align: right; font-variant-numeric: tabular-nums; }
        .tCenter { text-align: center; }
        .stHoliday { background: #ffecef; color: #ef4444; font-weight: 600; }
        .stWorking { background: #fff7e6; color: #b45309; font-weight: 600; }
        .stComplete { background: #eef2f6; color: #5b6775; font-weight: 600; }
        .stIncomplete { background: #ffecec; color: #ef4444; font-weight: 600; }
        .stNone { color: #8b97a3; }
        @media print { .printWrap { zoom: 0.92; } }
      </style>
      <div class="printWrap">
        <h1 class="printH1">${t("staff_monthly_title")}</h1>
        <p class="printMeta">${profileName} · ${yyyyMm}</p>
        <div class="summaryGrid">
          <div class="summaryCard"><span class="summaryLabel">${t("print_summary_total_work")}</span><strong class="summaryVal">${totalWork}</strong></div>
          <div class="summaryCard"><span class="summaryLabel">${t("print_summary_total_break")}</span><strong class="summaryVal">${totalBreak}</strong></div>
          <div class="summaryCard"><span class="summaryLabel">${t("print_summary_work_days")}</span><strong class="summaryVal">${summary.workDays}</strong></div>
          <div class="summaryCard"><span class="summaryLabel">${t("print_summary_incomplete")}</span><strong class="summaryVal">${summary.incompleteDays}</strong></div>
          <div class="summaryCard"><span class="summaryLabel">${t("print_summary_off_days")}</span><strong class="summaryVal">${holidayDays}</strong></div>
        </div>
        <div class="tableWrap">
          <table>
            <thead>
              <tr>
                <th>${t("print_col_date")}</th>
                <th>${t("today_label_check_in")}</th>
                <th>${t("today_label_check_out")}</th>
                <th>${t("print_col_break_min")}</th>
                <th>${t("print_col_work")}</th>
                <th>${t("print_col_status")}</th>
              </tr>
            </thead>
            <tbody>
              ${rowHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
    nav("/print", { state: { title: `${t("staff_monthly_title")} ${yyyyMm}`, html } });
  }

  const dash = t("common_dash");
  const [selectedYear, selectedMonth] = useMemo(() => {
    const [y, m] = yyyyMm.split("-").map(Number);
    return [y, m];
  }, [yyyyMm]);
  const profileName = getAppSession()?.displayName ?? t("common_staff");

  function openMonthModal() {
    setDraftYear(selectedYear);
    setMonthModalOpen(true);
  }

  useEffect(() => {
    if (!monthModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMonthModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [monthModalOpen]);

  return (
    <div className="staffMonthlyRoot" key={lang}>
      <main className="staffMonthlyShell">
        <header className="staffHeader">
          <div className="staffHeaderLeft" aria-hidden="true" />
          <div className="staffHeaderCenter">
            <h1 className="staffHeaderTitle">{t("staff_monthly_title")}</h1>
            <p className="staffHeaderSub">{`${profileName} · ${selectedYear}.${selectedMonth}`}</p>
          </div>
          <div className="staffHeaderRight" />
        </header>

        <header className="profileHeader">
          <div className="profileCard">
            <div className="profileLeft">
              <div className="profileAvatar">{profileName.charAt(0)}</div>
              <div className="profileText">
                <h1 className="profileName">{profileName}</h1>
              </div>
            </div>
            <button className="profilePdfBtn" type="button" onClick={onPrint}>
              {t("staff_monthly_pdf")}
            </button>
          </div>
        </header>

        <section className="monthSelector">
          <div className="monthSelectorCard" role="button" tabIndex={0} onClick={openMonthModal}>
            <div className="monthSelectorSpacer" />
            <span className="monthSelectorText">{yyyyMm}</span>
            <span className="material-symbols-outlined monthSelectorIcon">expand_more</span>
          </div>
        </section>

        <section className="kpiSection" aria-label={t("staff_monthly_title")}>
          <div className="kpiRow">
            <div className="kpiCard">
              <span className="kpiLabel">{t("staff_monthly_total_work")}</span>
              <span className="kpiValue">{summary.totalWork ? minToHhmm(summary.totalWork) : dash}</span>
            </div>
            <div className="kpiCard">
              <span className="kpiLabel">{t("staff_monthly_total_break")}</span>
              <span className="kpiValue">{summary.totalBreak ? minToHhmm(summary.totalBreak) : dash}</span>
            </div>
          </div>
          <div className="kpiRow">
            <div className="kpiCard kpiIncomplete">
              <span className="kpiLabel kpiAccentLabel">{t("staff_monthly_incomplete")}</span>
              <span className="kpiValue kpiAccentValue">{summary.incompleteDays}</span>
            </div>
            <div className="kpiCard">
              <span className="kpiLabel">{t("staff_monthly_days")}</span>
              <span className="kpiValue kpiWorkdays">{summary.workDays}</span>
            </div>
          </div>
          <div className="kpiStrip">
            <span className="kpiStripLabel">{t("staff_monthly_holiday")}</span>
            <span className="kpiStripValue">{holidayDays}</span>
          </div>
        </section>

        {!loading && error && (
          <div className="errorState">{error}</div>
        )}

        <div className="monthlySpacer" />
      </main>

      {monthModalOpen && (
        <div className="monthModalOverlay" onMouseDown={() => setMonthModalOpen(false)}>
          <div className="monthModal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="monthModalHeader">
              <div className="monthModalTitle">월 선택</div>
              <button
                type="button"
                className="monthModalClose"
                onClick={() => setMonthModalOpen(false)}
                aria-label="close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="monthModalYear">
              <button type="button" className="yearNavBtn" onClick={() => setDraftYear((v) => v - 1)} aria-label="prev-year">
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <div className="yearLabel">{draftYear}년</div>
              <button type="button" className="yearNavBtn" onClick={() => setDraftYear((v) => v + 1)} aria-label="next-year">
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>

            <div className="monthGrid">
              {Array.from({ length: 12 }, (_, i) => {
                const month = i + 1;
                const isSelected = draftYear === selectedYear && month === selectedMonth;
                return (
                  <button
                    key={`month-${month}`}
                    type="button"
                    className={`monthChip ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      const mm = String(month).padStart(2, "0");
                      setYyyyMm(`${draftYear}-${mm}`);
                      setMonthModalOpen(false);
                    }}
                  >
                    {month}월
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
