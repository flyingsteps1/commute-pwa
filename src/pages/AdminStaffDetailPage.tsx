import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { calcDailyWorkMin, calcMonthlySummary, minToHhmm } from "../domain/timeCalc";
import type { WorkRecord } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { listStaffPublic } from "../storage/staffRepo";
import { listByMonth } from "../storage/todayRepo";
import "./AdminStaffDetailPage.css";

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

function daysInMonth(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (Number.isNaN(y) || Number.isNaN(m)) return 31;
  return new Date(y, m, 0).getDate();
}

export default function AdminStaffDetailPage() {
  const nav = useNavigate();
  const { staffId } = useParams<{ staffId: string }>();
  const [sp] = useSearchParams();
  const initialMonth = sp.get("month");
  const initialUserId = sp.get("userId");
  const [yyyyMm, setYyyyMm] = useState(initialMonth && /^\d{4}-\d{2}$/.test(initialMonth) ? initialMonth : currentMonthKey());
  const { t, lang } = useI18n();

  const [userId, setUserId] = useState<string | null>(initialUserId);
  const [staffName, setStaffName] = useState<string>(staffId ?? t("common_staff"));
  const [rows, setRows] = useState<WorkRecord[]>([]);
  const [todayStatus, setTodayStatus] = useState<{ code: string; detailTime?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadStaff() {
      if (!staffId) return;
      const list = await listStaffPublic();
      if (cancelled) return;
      const found = list.find((s) => s.staffId === staffId);
      if (found) {
        setStaffName(found.name ?? found.displayName ?? staffId);
        setUserId((prev) => prev ?? found.userId ?? null);
      }
    }
    loadStaff();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!userId || !staffId) return;
      const recs = await listByMonth(yyyyMm, userId);
      if (cancelled) return;
      const sorted = [...recs].sort((a, b) => a.date.localeCompare(b.date));
      setRows(sorted);
      const todayISO = new Date().toISOString().slice(0, 10);
      const today = sorted.find((r) => r.date === todayISO);
      if (today) {
        if (today.note === "OFF") setTodayStatus({ code: "holiday" });
        else if (today.checkIn && today.checkOut) setTodayStatus({ code: "off", detailTime: today.checkOut });
        else if (today.checkIn) setTodayStatus({ code: "working", detailTime: today.checkIn });
        else setTodayStatus({ code: "incomplete" });
      } else {
        setTodayStatus(null);
      }
      if (import.meta.env.DEV) console.log("[AdminStaffDetail] loaded", { yyyyMm, count: sorted.length, sample: sorted[0] });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [yyyyMm, userId, staffId]);

  const summary = useMemo(() => calcMonthlySummary(rows, yyyyMm), [rows, yyyyMm]);
  const holidayDays = useMemo(() => rows.filter((r) => r.note === "OFF").length, [rows]);

  if (!staffId) {
    return null;
  }

  function handlePrint() {
    const dash = t("common_dash");
    const totalWork = minToHhmm(summary.totalWork ?? 0);
    const totalBreak = minToHhmm(summary.totalBreak ?? 0);
    const recordMap = new Map(rows.map((r) => [r.date, r]));
    const totalDays = daysInMonth(yyyyMm);
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
        const daily = r && !isHoliday ? calcDailyWorkMin(r) : { workMin: null, breakMin: 0 };
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
        // Checklist: A) normal day -> "00:30"/"01:00", B) incomplete -> matches records, C) holiday -> unchanged dash.
        const breakMin = isHoliday ? dash : minToHhmm(r?.breakMin ?? 0);
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
        <h1 class="printH1">${t("admin_staff_detail_title")}</h1>
        <p class="printMeta">${staffName} · ${yyyyMm}</p>
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

    const query = `month=${encodeURIComponent(yyyyMm)}&employeeId=${encodeURIComponent(userId ?? "")}`;
    nav(`/print?${query}`, { state: { title: `${t("admin_staff_detail_title")} ${yyyyMm}`, html } });
  }

  return (
    <div key={lang} className="staffDetailRoot">
      <div className="staffDetailShell">
        <header className="staffDetailHeader">
          <button
            type="button"
            className="staffDetailBackBtn"
            onClick={() => nav(-1)}
            aria-label={t("back") ?? "back"}
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <div className="staffDetailHeaderText">
            <h1 className="staffDetailTitle">{t("admin_staff_detail_title")}</h1>
            <p className="staffDetailSubtitle">{staffName}</p>
          </div>
          <div className="staffDetailHeaderSpacer" />
        </header>

        <main className="staffDetailMain">
          <section className="todayCard">
            <span className="todayLabel">{t("today_title")}</span>
            <span className="todayValue">
              {todayStatus ? t(`common_${todayStatus.code}` as any) ?? todayStatus.code : t("common_no_record")}
            </span>
            {todayStatus?.detailTime && <span className="todayMeta">{todayStatus.detailTime}</span>}
          </section>

          <section className="monthActions">
            <div className="monthNav">
              <button
                className="monthNavBtn"
                type="button"
                onClick={() => setYyyyMm(shiftMonth(yyyyMm, -1))}
                aria-label={t("admin_staff_detail_prev_month")}
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <span className="monthLabel">{yyyyMm}</span>
              <button
                className="monthNavBtn"
                type="button"
                onClick={() => setYyyyMm(shiftMonth(yyyyMm, 1))}
                aria-label={t("admin_staff_detail_next_month")}
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
            <button
              className="pdfBtn"
              type="button"
              onClick={handlePrint}
            >
              PDF
            </button>
          </section>

          <section className="summaryCard">
            <div className="summaryGrid">
              <div className="summaryCell">
                <span className="summaryLabel">{t("admin_staff_detail_summary_total_work")}</span>
                <span className="summaryValue">{minToHhmm(summary.totalWork)}</span>
              </div>
              <div className="summaryCell">
                <span className="summaryLabel">{t("today_sum_break")}</span>
                <span className="summaryValue">{minToHhmm(summary.totalBreak)}</span>
              </div>
              <div className="summaryCell">
                <span className="summaryLabel">{t("admin_staff_detail_summary_days")}</span>
                <span className="summaryValue">{summary.workDays}</span>
              </div>
              <div className="summaryCell summaryCellIncomplete">
                <span className="summaryLabel">{t("admin_staff_detail_summary_incomplete")}</span>
                <span className="summaryValue">{summary.incompleteDays}</span>
              </div>
              <div className="summaryCell summaryCellHoliday">
                <span className="summaryLabel">{t("common_holiday")}</span>
                <span className="summaryValue">{holidayDays}</span>
              </div>
            </div>
          </section>

          <section className="recordsCard">
            <div className="recordsHead recordsGrid">
              <span className="recordsCell recordsCellDate">{t("admin_staff_detail_th_date")}</span>
              <span className="recordsCell">{t("admin_staff_detail_th_check_in")}</span>
              <span className="recordsCell">{t("admin_staff_detail_th_check_out")}</span>
              <span className="recordsCell">{t("admin_staff_detail_th_break")}</span>
              <span className="recordsCell">{t("admin_staff_detail_th_work")}</span>
            </div>
            {rows.length === 0 && <div className="recordsEmpty">{t("admin_staff_detail_empty")}</div>}
            {rows.map((r) => {
              const isHoliday = r.note === "OFF";
              const daily = isHoliday ? { workMin: null, breakMin: 0 } : calcDailyWorkMin(r);
              const workText = isHoliday ? t("print_holiday") : daily.workMin === null ? t("common_incomplete") : minToHhmm(daily.workMin);
              return (
                <button
                  key={`${r.date}-${r.checkIn ?? ""}-${r.checkOut ?? ""}`}
                  type="button"
                  className="recordsRow recordsGrid"
                >
                  <span className="recordsCell recordsCellDate">{r.date}</span>
                  <span className="recordsCell recordsMono">{isHoliday ? t("common_dash") : r.checkIn ?? t("common_dash")}</span>
                  <span className="recordsCell recordsMono">{isHoliday ? t("common_dash") : r.checkOut ?? t("common_dash")}</span>
                  <span className="recordsCell">{isHoliday ? t("common_dash") : r.breakMin ?? 0}</span>
                  <span className="recordsCell recordsStrong">{workText}</span>
                </button>
              );
            })}
          </section>
        </main>
      </div>
    </div>
  );
}
