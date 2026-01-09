import { useEffect, useMemo, useState } from "react";
import { calcDailyWorkMin, minToHhmm } from "../domain/timeCalc";
import type { WorkRecord } from "../domain/types";
import { getSession } from "../auth/session";
import { activeEmployeeId } from "../auth/identity";
import { listStaff } from "../auth/store";
import { supabase } from "../storage/supabaseClient";

function detectLang(): "ko" | "ja" {
  try {
    const params = new URLSearchParams(window.location.search);
    const q = (params.get("lang") || "").toLowerCase();
    if (q.startsWith("ja")) return "ja";
    if (q.startsWith("ko")) return "ko";

    const keys = [
      "lang",
      "locale",
      "i18n",
      "i18nextLng",
      "I18N_LANG",
      "APP_LANG",
      "app_lang",
      "language",
      "lng",
    ];

    for (const k of keys) {
      const v = (localStorage.getItem(k) || "").toLowerCase();
      if (!v) continue;
      if (v.includes("ja")) return "ja";
      if (v.includes("ko")) return "ko";
    }

    const htmlLang = (document.documentElement.lang || "").toLowerCase();
    if (htmlLang.includes("ja")) return "ja";
    if (htmlLang.includes("ko")) return "ko";

    const nav = (navigator.language || "").toLowerCase();
    if (nav.includes("ja")) return "ja";
    if (nav.includes("ko")) return "ko";
  } catch {
    /* ignore */
  }
  return "ko";
}

function currentMonthKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function parseQuery() {
  const params = new URLSearchParams(window.location.search);
  const m = params.get("month");
  const employeeId = params.get("employeeId");
  return {
    month: m && /^\d{4}-\d{2}$/.test(m) ? m : null,
    employeeId: employeeId || null,
  };
}

const JP_DOW = ["日", "月", "火", "水", "木", "金", "土"];

function toHHMM(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") {
    if (/^\d{2}:\d{2}$/.test(v)) return v;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }
    return null;
  }
  if (v instanceof Date) {
    const hh = String(v.getHours()).padStart(2, "0");
    const mm = String(v.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  return null;
}

function daysInMonth(yyyy: number, mm1: number) {
  return new Date(yyyy, mm1, 0).getDate();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toISO(yyyy: number, mm1: number, dd: number) {
  return `${yyyy}-${pad2(mm1)}-${pad2(dd)}`;
}

function formatMDWithDow(yyyy: number, mm1: number, dd: number) {
  const d = new Date(yyyy, mm1 - 1, dd);
  const dow = JP_DOW[d.getDay()];
  return `${mm1}/${dd}(${dow})`;
}

// 회사 기준 근무시간(예: 8시간) 초과분 계산용
const STD_WORK_MIN = 8 * 60;

type Row = {
  dateISO: string;
  label: string;
  checkIn: string;
  checkOut: string;
  breakText: string;
  workText: string;
  overtimeText: string;
  earlyLeaveText: string;
  offText: string;
  status: "empty" | "incomplete" | "complete";
};

function isOffNote(note: any): boolean {
  if (!note) return false;
  const s = String(note).toLowerCase();
  return s.includes("off");
}

async function fetchRecordsByMonth(employeeId: string, yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const from = `${yyyyMm}-01`;
  const next = new Date(y, m, 1);
  const nextY = next.getFullYear();
  const nextM = String(next.getMonth() + 1).padStart(2, "0");
  const to = `${nextY}-${nextM}-01`;

  const baseCols = ["date", "check_in", "check_out", "staff_user_id", "note"];
  const breakColCandidates = [
    "break_minutes",
    "break_min",
    "break_mins",
    "break_time_min",
    "break",
  ];

  for (const breakCol of breakColCandidates) {
    const select = [...baseCols, breakCol].join(",");
    const { data, error } = await supabase
      .from("work_records")
      .select(select)
      .eq("staff_user_id", employeeId)
      .gte("date", from)
      .lt("date", to)
      .order("date", { ascending: true });
    if (!error) {
      return { rows: data ?? [], breakColUsed: breakCol };
    }
    const code = String((error as any)?.code ?? "");
    const message = String((error as any)?.message ?? "");
    if (code === "42703" && message.includes(breakCol)) {
      continue;
    }
    throw error;
  }

  const { data, error } = await supabase
    .from("work_records")
    .select(baseCols.join(","))
    .eq("staff_user_id", employeeId)
    .gte("date", from)
    .lt("date", to)
    .order("date", { ascending: true });
  if (error) throw error;
  return { rows: data ?? [], breakColUsed: null };
}

export default function PrintPage() {
  const lang = useMemo(() => detectLang(), []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    console.log("[PrintPage] lang=", lang, {
      query_lang: params.get("lang"),
      htmlLang: document.documentElement.lang,
      nav: navigator.language,
      ls: {
        lang: localStorage.getItem("lang"),
        locale: localStorage.getItem("locale"),
        i18n: localStorage.getItem("i18n"),
        i18nextLng: localStorage.getItem("i18nextLng"),
        app_lang: localStorage.getItem("app_lang"),
        APP_LANG: localStorage.getItem("APP_LANG"),
        lng: localStorage.getItem("lng"),
        language: localStorage.getItem("language"),
      },
    });
  }, [lang]);
  const t = useMemo(() => {
    const ko = {
      back: "← 뒤로",
      print: "인쇄 / PDF 저장",
      title: (m: string) => `출퇴근 기록표 (${m})`,
      employee: (name: string) => `직원: ${name}`,
      totalWork: "총 근무",
      totalBreak: "총 휴게",
      workDays: "근무 일수",
      incomplete: "미완료",
      off: "휴무",
      date: "날짜",
      checkIn: "출근",
      checkOut: "퇴근",
      break: "휴게",
      work: "근무",
      offCol: "휴무",
      incompleteText: "미완료",
      offText: "휴무",
      dayUnit: "일",
      noInfoTitle: "정보가 없습니다",
      noInfoHint: "?month=YYYY-MM 형식으로 접근해 주세요.",
    };

    const ja = {
      back: "← 戻る",
      print: "印刷 / PDF保存",
      title: (m: string) => `出退勤記録表（${m}）`,
      employee: (name: string) => `従業員: ${name}`,
      totalWork: "総勤務",
      totalBreak: "総休憩",
      workDays: "勤務日数",
      incomplete: "未完了",
      off: "休み",
      date: "日付",
      checkIn: "出勤",
      checkOut: "退勤",
      break: "休憩",
      work: "勤務",
      offCol: "休み",
      incompleteText: "未完了",
      offText: "休み",
      dayUnit: "日",
      noInfoTitle: "情報がありません",
      noInfoHint: "?month=YYYY-MM の形式でアクセスしてください。",
    };

    return lang === "ja" ? ja : ko;
  }, [lang]);
  const { month, employeeId: queryEmployee } = useMemo(() => parseQuery(), []);
  const yyyyMm = useMemo(() => month ?? currentMonthKey(), [month]);
  const session = getSession();
  const sessionEmployeeId = activeEmployeeId(session);
  const employeeId = queryEmployee || sessionEmployeeId;

  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!employeeId) return;
      setLoading(true);
      setError(null);
      try {
        const { rows, breakColUsed } = await fetchRecordsByMonth(employeeId, yyyyMm);
        const mapped = (rows ?? []).map((r: any) => ({
          date: r.date,
          checkIn: toHHMM(r.check_in),
          checkOut: toHHMM(r.check_out),
          breakMin: breakColUsed ? Number(r?.[breakColUsed] ?? 0) : Number(r?.break_minutes ?? 0),
          note: r.note ?? null,
        })) as any as WorkRecord[];

        if (!cancelled) setRecords(mapped);
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
  }, [employeeId, yyyyMm]);

  useEffect(() => {
    let cancelled = false;
    async function loadName() {
      if (!queryEmployee) return;
      try {
        const { data } = await supabase
          .from("staff_public")
          .select("name, display_name, staff_id")
          .eq("user_id", queryEmployee)
          .maybeSingle();
        if (cancelled) return;
        const fallback = listStaff().find((s) => s.id === queryEmployee)?.name ?? null;
        setStaffName(data?.name ?? data?.display_name ?? data?.staff_id ?? fallback);
      } catch {
        if (!cancelled) {
          const fallback = listStaff().find((s) => s.id === queryEmployee)?.name ?? null;
          setStaffName(fallback);
        }
      }
    }
    loadName();
    return () => {
      cancelled = true;
    };
  }, [queryEmployee]);

  const model = useMemo(() => {
    const [yyyy, mm1] = yyyyMm.split("-").map(Number);
    const lastDay = daysInMonth(yyyy, mm1);

    const byDate = new Map<string, WorkRecord>(records.map((r) => [r.date, r]));

    const rows: Row[] = [];

    let workDays = 0;
    let incompleteDays = 0;
    let totalWorkMin = 0;
    let totalBreakMin = 0;
    let totalOvertimeMin = 0;
    let totalEarlyLeaveMin = 0;
    let offDays = 0;

    for (let dd = 1; dd <= lastDay; dd++) {
      const dateISO = toISO(yyyy, mm1, dd);
      const label = formatMDWithDow(yyyy, mm1, dd);

      const r = byDate.get(dateISO);
      const daily = r ? calcDailyWorkMin(r) : { workMin: null, breakMin: 0 };
      const off = isOffNote((r as any)?.note);

      const workMin = daily.workMin;
      const breakMin = daily.breakMin ?? 0;

      const overtimeMin = workMin === null ? null : Math.max(0, workMin - STD_WORK_MIN);
      const earlyLeaveMin = workMin === null ? null : Math.max(0, STD_WORK_MIN - workMin);

      const hasCheckIn = !!r?.checkIn;
      const hasCheckOut = !!r?.checkOut;
      const hasAnyInput = hasCheckIn || hasCheckOut || (!!r && Number(r.breakMin ?? 0) > 0);

      const status: Row["status"] = !hasAnyInput ? "empty" : workMin === null ? "incomplete" : "complete";

      const checkIn = hasCheckIn ? r!.checkIn! : "—";
      const checkOut = hasCheckOut
        ? r!.checkOut!
        : status === "incomplete" && hasCheckIn
          ? t.incompleteText
          : "—";

      const breakText = hasAnyInput && breakMin > 0 ? minToHhmm(breakMin) : "—";
      const workText =
        status === "complete" ? minToHhmm(workMin!) : status === "incomplete" ? t.incompleteText : "—";

      const overtimeText = overtimeMin === null || overtimeMin === 0 ? "—" : minToHhmm(overtimeMin);
      const earlyLeaveText = earlyLeaveMin === null || earlyLeaveMin === 0 ? "—" : minToHhmm(earlyLeaveMin);

      if (workMin !== null) totalWorkMin += workMin;
      if (hasAnyInput) totalBreakMin += breakMin;
      if (overtimeMin !== null) totalOvertimeMin += overtimeMin;
      if (earlyLeaveMin !== null) totalEarlyLeaveMin += earlyLeaveMin;
      if (status === "complete") workDays += 1;
      if (status === "incomplete") incompleteDays += 1;
      if (off) offDays += 1;

      rows.push({
        dateISO,
        label,
        checkIn,
        checkOut,
        breakText,
        workText,
        overtimeText,
        earlyLeaveText,
        offText: off ? t.offText : "—",
        status,
      });
    }

    return {
      yyyy,
      mm1,
      yyyyMm,
      rows,
      summary: {
        workDays,
        incompleteDays,
        totalWorkMin,
        totalBreakMin,
        totalOvertimeMin,
        totalEarlyLeaveMin,
        offDays,
      },
    };
  }, [yyyyMm, records]);

  const monthTitle =
    lang === "ja"
      ? `${model.yyyy}年 ${String(model.mm1).padStart(2, "0")}月`
      : `${model.yyyy}년 ${String(model.mm1).padStart(2, "0")}월`;
  const employeeLine = queryEmployee ? t.employee(staffName ?? queryEmployee) : null;

  return (
    <div style={{ background: "#fff", color: "#111" }}>
      <style>{`
        /* ===== screen styles (keep as-is) ===== */
        .printRoot{
          background: #f3f4f6;
          min-height: 100vh;
          padding: 12px;
          color: #111827;
          font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
        }
        .sheet{
          max-width: 780px;
          margin: 0 auto;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 12px;
          padding: 14px 16px;
          box-shadow: 0 10px 30px rgba(0,0,0,.08);
        }
        .toolbar{
          display:flex;
          justify-content:flex-end;
          gap:8px;
          margin: 0 auto 10px;
          max-width: 780px;
        }
        .btn{
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          background: white;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
          font-size: 13px;
        }
        .head{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 10px;
          margin-bottom: 10px;
        }
        .title{
          margin: 0;
          font-size: 18px;
          font-weight: 900;
          letter-spacing: -0.01em;
        }
        .monthBadge{
          padding: 4px 10px;
          border-radius: 10px;
          background: #e5f2ff;
          border: 1px solid #bfdbfe;
          font-weight: 800;
        }
        .summary{
          display:grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px 10px;
          margin: 0 0 10px 0;
          border: 1px solid #d1d5db;
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 12px;
        }
        .sumItem{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 8px;
          white-space: nowrap;
        }
        .sumLabel{ color: #4b5563; font-weight: 700; }
        .sumVal{ font-weight: 900; color: #111827; }

        table{
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 11.5px;
        }
        th, td{
          border: 1px solid #d1d5db;
          padding: 4px 6px;
          height: 20px;
          line-height: 1.2;
          text-align: center;
        }
        thead th{
          background: #f3f4f6;
          font-weight: 800;
          color: #111827;
        }
        .left{ text-align:left; }
        .muted{ color: #9ca3af; }
        .warn{ color: #d97706; font-weight: 800; }

        @media print {
          @page { size: A4 portrait; margin: 0; }

          html, body {
            width: 210mm;
            height: 297mm;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            box-shadow: none !important;
            text-shadow: none !important;
          }

          .no-print { display: none !important; }

          .printRoot{
            background: #fff !important;
            min-height: auto !important;
            height: auto !important;
            margin: 0 !important;
            padding: 4mm !important;
            box-sizing: border-box !important;
          }

          .sheet{
            max-width: none !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }

          .head{ margin: 0 0 2mm 0 !important; }
          .title{ font-size: 12px !important; margin: 0 !important; }
          .monthBadge{
            border-radius: 0 !important;
            padding: 2px 6px !important;
            font-size: 10px !important;
          }

          .summary{
            grid-template-columns: 1fr 1fr !important;
            gap: 2mm !important;
            margin: 2mm 0 2mm 0 !important;
            padding: 2mm !important;
            border-radius: 0 !important;
            font-size: 10px !important;
          }
          .sumLabel{ font-size: 9px !important; }
          .sumVal{ font-size: 10px !important; }

          table{
            font-size: 9px !important;
            line-height: 1.1 !important;
          }
          th, td{
            padding: 2px 3px !important;
            height: auto !important;
            line-height: 1.1 !important;
            white-space: nowrap !important;
          }

          .head, .summary, table { page-break-inside: avoid !important; }
        }
      `}</style>

      <div className="no-print toolbar">
        <button className="btn" type="button" onClick={() => window.history.back()}>
          {t.back}
        </button>
        <button className="btn" type="button" onClick={() => window.print()}>
          {t.print}
        </button>
      </div>

      {loading && (
        <div className="no-print" style={{ maxWidth: 780, margin: "0 auto 10px", fontSize: 13 }}>
          로딩중...
        </div>
      )}
      {error && (
        <div
          className="no-print"
          style={{ maxWidth: 780, margin: "0 auto 10px", fontSize: 13, color: "#b91c1c" }}
        >
          {error}
        </div>
      )}

      <div className="printRoot">
        <div className="sheet">
          <div className="head">
            <div>
              <h1 className="title">{t.title(monthTitle)}</h1>
              {employeeLine && (
                <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{employeeLine}</div>
              )}
            </div>
            <div className="monthBadge">{monthTitle}</div>
          </div>

          <div className="summary">
            <div className="sumItem">
              <span className="sumLabel">{t.totalWork}</span>
              <span className="sumVal">{minToHhmm(model.summary.totalWorkMin)}</span>
            </div>
            <div className="sumItem">
              <span className="sumLabel">{t.totalBreak}</span>
              <span className="sumVal">{minToHhmm(model.summary.totalBreakMin)}</span>
            </div>
            <div className="sumItem">
              <span className="sumLabel">{t.workDays}</span>
              <span className="sumVal">
                {model.summary.workDays}
                {t.dayUnit}
              </span>
            </div>
            <div className="sumItem">
              <span className="sumLabel">{t.incomplete}</span>
              <span className="sumVal">
                {model.summary.incompleteDays}
                {t.dayUnit}
              </span>
            </div>
            <div className="sumItem">
              <span className="sumLabel">{t.off}</span>
              <span className="sumVal">
                {model.summary.offDays}
                {t.dayUnit}
              </span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: "18%" }}>{t.date}</th>
                <th style={{ width: "13%" }}>{t.checkIn}</th>
                <th style={{ width: "13%" }}>{t.checkOut}</th>
                <th style={{ width: "12%" }}>{t.break}</th>
                <th style={{ width: "24%" }}>{t.work}</th>
                <th style={{ width: "20%" }}>{t.offCol}</th>
              </tr>
            </thead>

            <tbody>
              {model.rows.map((r) => (
                <tr key={r.dateISO}>
                  <td className="left">{r.label}</td>
                  <td>{r.checkIn}</td>
                  <td className={r.checkOut === t.incompleteText ? "warn" : ""}>{r.checkOut}</td>
                  <td className={r.breakText === "—" ? "muted" : ""}>{r.breakText}</td>
                  <td className={r.status === "incomplete" ? "warn" : r.status === "empty" ? "muted" : ""}>
                    {r.workText}
                  </td>
                  <td className={r.offText === "—" ? "muted" : ""}>{r.offText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

