import { useEffect, useMemo, useState } from "react";
import { calcDailyWorkMin, minToHhmm } from "../domain/timeCalc";
import { getSession } from "../auth/session";
import { activeEmployeeId } from "../auth/identity";
import { listByMonth } from "../storage/todayRepo";
import { useI18n } from "../i18n/I18nProvider";

function getMonthFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const m = params.get("month") || params.get("yyyyMm") || params.get("ym");
  return m ?? "";
}

const STD_WORK_MIN = 8 * 60;

function daysInMonth(yyyy: number, mm1: number) {
  return new Date(yyyy, mm1, 0).getDate();
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toISO(yyyy: number, mm1: number, dd: number) {
  return `${yyyy}-${pad2(mm1)}-${pad2(dd)}`;
}
function formatMDWithDow(yyyy: number, mm1: number, dd: number, dows: string[]) {
  const d = new Date(yyyy, mm1 - 1, dd);
  const dow = dows[d.getDay()];
  return `${mm1}/${dd}(${dow})`;
}

export default function PrintMonthlyPage() {
  const { t, lang } = useI18n();
  const DOW = lang === "ja" ? ["日", "月", "火", "水", "木", "金", "土"] : ["일", "월", "화", "수", "목", "금", "토"];
  const yyyyMm = getMonthFromQuery();
  const sessionEmployeeId = activeEmployeeId(getSession());
  const [records, setRecords] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) return;
        const rows = await listByMonth(yyyyMm);
        if (!cancelled) setRecords(rows);
        if (import.meta.env.DEV) console.log("[PrintMonthly] loaded", { yyyyMm, count: rows.length, sample: rows[0] });
      } catch (e: any) {
        console.error(e);
        if (!cancelled) setError(e?.message ?? "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [yyyyMm]);

  const model = useMemo(() => {
    if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm) || error || loading) return null;

    const yyyy = Number(yyyyMm.slice(0, 4));
    const mm1 = Number(yyyyMm.slice(5, 7));
    const lastDay = daysInMonth(yyyy, mm1);

    const byDate = new Map(records.map((r) => [r.date, r]));

    const rows = Array.from({ length: lastDay }, (_, i) => {
      const dd = i + 1;
      const dateISO = toISO(yyyy, mm1, dd);
      const label = formatMDWithDow(yyyy, mm1, dd, DOW);

      const r = byDate.get(dateISO);
      const isHoliday = r?.note === "OFF";
      const daily = r && !isHoliday ? calcDailyWorkMin(r) : { workMin: null, breakMin: 0 };

      const workMin = daily.workMin;
      const breakMin = isHoliday ? 0 : daily.breakMin ?? 0;

      const overtimeMin = workMin === null ? null : Math.max(0, workMin - STD_WORK_MIN);
      const earlyLeaveMin = workMin === null ? null : Math.max(0, STD_WORK_MIN - workMin);

      return {
        dateISO,
        label,
        checkIn: isHoliday ? "" : r?.checkIn ?? "",
        checkOut: isHoliday ? "" : r?.checkOut ?? "",
        breakMin,
        workMin,
        overtimeMin,
        earlyLeaveMin,
        isHoliday,
      };
    });

    let workDays = 0;
    let incompleteDays = 0;
    let holidayDays = 0;
    let totalWorkMin = 0;
    let totalBreakMin = 0;
    let totalOvertimeMin = 0;
    let totalEarlyLeaveMin = 0;

    for (const r of rows) {
      if (r.isHoliday) {
        holidayDays += 1;
        continue;
      }
      const hasAny = !!(r.checkIn || r.checkOut);
      const isComplete = !!(r.checkIn && r.checkOut);

      if (hasAny) workDays += 1;
      if (hasAny && !isComplete) incompleteDays += 1;

      if (r.workMin !== null) totalWorkMin += r.workMin;
      totalBreakMin += r.breakMin ?? 0;

      if (r.overtimeMin !== null) totalOvertimeMin += r.overtimeMin;
      if (r.earlyLeaveMin !== null) totalEarlyLeaveMin += r.earlyLeaveMin;
    }

    return {
      yyyy,
      mm1,
      yyyyMm,
      rows,
      summary: {
        workDays,
        incompleteDays,
        holidayDays,
        totalWorkMin,
        totalBreakMin,
        totalOvertimeMin,
        totalEarlyLeaveMin,
      },
    };
  }, [yyyyMm, records, error, loading, DOW]);

  if (loading) {
    return <div style={{ padding: 16 }}>{t("print_loading")}</div>;
  }

  if (!model || error) {
    return (
      <div style={{ padding: 16 }}>
        <h2>{t("print_no_info")}</h2>
        <div>{error ?? t("print_invalid_month")}</div>
      </div>
    );
  }

  const employeeLine = sessionEmployeeId ? `${t("common_staff")}: ${sessionEmployeeId}` : null;

  return (
    <div style={{ background: "#fff", color: "#111" }}>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          .printRoot { padding: 0; }
          .sheet { box-shadow: none; }
        }
        .holidayText{ color: #b45309; font-weight: 800; }
      `}</style>

      <div
        className="printRoot"
        style={{
          background: "#f3f4f6",
          minHeight: "100vh",
          padding: 12,
          color: "#111827",
          fontFamily: '"Noto Sans KR", "Noto Sans", system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          className="sheet"
          style={{
            maxWidth: 780,
            margin: "0 auto",
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: 12,
            padding: "14px 16px",
            boxShadow: "0 10px 30px rgba(0,0,0,.08)",
          }}
        >
          <div className="toolbar no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
            <button
              className="btn"
              onClick={() => window.print()}
              style={{ padding: "8px 12px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}
            >
              {t("print_button")}
            </button>
          </div>

          <div className="head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <h1 className="title" style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.01em" }}>
                {t("print_monthly_title")} ({yyyyMm})
              </h1>
              {employeeLine && <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{employeeLine}</div>}
            </div>
          </div>

          <div
            className="summary"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: "6px 10px",
              margin: "0 0 10px 0",
              border: "1px solid #d1d5db",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, whiteSpace: "nowrap" }}>
              <span style={{ color: "#4b5563", fontWeight: 700 }}>{t("print_total_work")}</span>
              <span style={{ fontWeight: 900, color: "#111827" }}>{minToHhmm(model.summary.totalWorkMin)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, whiteSpace: "nowrap" }}>
              <span style={{ color: "#4b5563", fontWeight: 700 }}>{t("print_total_break")}</span>
              <span style={{ fontWeight: 900, color: "#111827" }}>{minToHhmm(model.summary.totalBreakMin)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, whiteSpace: "nowrap" }}>
              <span style={{ color: "#4b5563", fontWeight: 700 }}>{t("print_workdays")}</span>
              <span style={{ fontWeight: 900, color: "#111827" }}>{model.summary.workDays}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, whiteSpace: "nowrap" }}>
              <span style={{ color: "#4b5563", fontWeight: 700 }}>{t("print_incomplete")}</span>
              <span style={{ fontWeight: 900, color: "#111827" }}>{model.summary.incompleteDays}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, whiteSpace: "nowrap" }}>
              <span style={{ color: "#4b5563", fontWeight: 700 }}>{t("print_holiday_days")}</span>
              <span style={{ fontWeight: 900, color: "#111827" }}>{model.summary.holidayDays}</span>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: "11.5px" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #d1d5db", padding: "4px 6px", background: "#f3f4f6" }}>{t("print_date")}</th>
                <th style={{ border: "1px solid #d1d5db", padding: "4px 6px", background: "#f3f4f6" }}>{t("print_check_in")}</th>
                <th style={{ border: "1px solid #d1d5db", padding: "4px 6px", background: "#f3f4f6" }}>{t("print_check_out")}</th>
                <th style={{ border: "1px solid #d1d5db", padding: "4px 6px", background: "#f3f4f6" }}>{t("print_break")}</th>
                <th style={{ border: "1px solid #d1d5db", padding: "4px 6px", background: "#f3f4f6" }}>{t("print_work")}</th>
                <th style={{ border: "1px solid #d1d5db", padding: "4px 6px", background: "#f3f4f6" }}>{t("print_overtime")}</th>
                <th style={{ border: "1px solid #d1d5db", padding: "4px 6px", background: "#f3f4f6" }}>{t("print_early_leave")}</th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((r) => {
                const workMin = r.workMin;
                const isHoliday = r.isHoliday;
                const breakText = isHoliday ? "--" : r.breakMin > 0 ? minToHhmm(r.breakMin) : "--";
                const workText = isHoliday ? t("print_holiday") : workMin === null ? t("print_incomplete") : minToHhmm(workMin);
                const overtimeText = isHoliday || r.overtimeMin === null || r.overtimeMin === 0 ? "--" : minToHhmm(r.overtimeMin);
                const earlyLeaveText = isHoliday || r.earlyLeaveMin === null || r.earlyLeaveMin === 0 ? "--" : minToHhmm(r.earlyLeaveMin);
                const hasAny = !!(r.checkIn || r.checkOut);
                const status = isHoliday ? "holiday" : !hasAny ? "empty" : workMin === null ? "incomplete" : "complete";
                return (
                  <tr key={r.dateISO}>
                    <td style={{ border: "1px solid #d1d5db", padding: "4px 6px", textAlign: "left" }}>{r.label}</td>
                    <td style={{ border: "1px solid #d1d5db", padding: "4px 6px" }}>{isHoliday ? "--" : r.checkIn || "--"}</td>
                    <td style={{ border: "1px solid #d1d5db", padding: "4px 6px", color: status === "incomplete" ? "#d97706" : undefined }}>
                      {isHoliday ? "--" : r.checkOut || (status === "incomplete" && r.checkIn ? t("print_incomplete") : "--")}
                    </td>
                    <td style={{ border: "1px solid #d1d5db", padding: "4px 6px", color: breakText === "--" ? "#9ca3af" : undefined }}>{breakText}</td>
                    <td
                      style={{
                        border: "1px solid #d1d5db",
                        padding: "4px 6px",
                        color: status === "holiday" ? "#b45309" : status === "incomplete" ? "#d97706" : status === "empty" ? "#9ca3af" : undefined,
                        fontWeight: status === "holiday" ? 800 : undefined,
                      }}
                    >
                      {workText}
                    </td>
                    <td style={{ border: "1px solid #d1d5db", padding: "4px 6px", color: overtimeText === "--" ? "#9ca3af" : undefined }}>{overtimeText}</td>
                    <td style={{ border: "1px solid #d1d5db", padding: "4px 6px", color: earlyLeaveText === "--" ? "#9ca3af" : undefined }}>{earlyLeaveText}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
