import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { calcDailyWorkMin, minToHhmm } from "../domain/timeCalc";
import { useI18n } from "../i18n/I18nProvider";
import { listByMonth, getByDate } from "../storage/todayRepo";

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

function daysInMonth(yyyy: number, mm1: number) {
  return new Date(yyyy, mm1, 0).getDate();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toISO(yyyy: number, mm1: number, dd: number) {
  return `${yyyy}-${pad2(mm1)}-${pad2(dd)}`;
}

/**
 * IMPORTANT: Build was failing because lang includes "en" but DOW did not.
 * Make DOW cover ko/ja/en and type it so TS can safely index it.
 */
type LangKey = "ko" | "ja" | "en";

const DOW: Record<LangKey, readonly string[]> = {
  ko: ["일", "월", "화", "수", "목", "금", "토"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
} as const;

function formatMonthTitle(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return `${y}.${m}`;
}

type DayCell = {
  dateISO: string;
  dd: number;
  dow: number;
  checkIn?: string;
  checkOut?: string;
  breakMin: number;
  workMin: number | null;
  status: "empty" | "incomplete" | "complete" | "holiday";
};

export default function CalendarPage() {
  const nav = useNavigate();
  const { t, lang } = useI18n();
  if (import.meta.env.DEV) console.log("[UI] CalendarPage rendered");

  // If i18n ever returns something unexpected, keep UI safe.
  const safeLang: LangKey = (lang === "ko" || lang === "ja" || lang === "en") ? lang : "ko";

  const [yyyyMm, setYyyyMm] = useState(currentMonthKey());
  const [selected, setSelected] = useState<string | null>(null);
  const [monthRecords, setMonthRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await listByMonth(yyyyMm);
        if (!cancelled) setMonthRecords(rows);
      } catch (e: any) {
        console.error(e);
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

  const model = useMemo(() => {
    const [yyyy, mm1] = yyyyMm.split("-").map(Number);
    const last = daysInMonth(yyyy, mm1);

    const records = monthRecords.filter((r) => r.date.startsWith(yyyyMm));
    const byDate = new Map(records.map((r) => [r.date, r]));

    const firstDow = new Date(`${yyyyMm}-01T00:00:00`).getDay();
    const cells: (DayCell | null)[] = [];

    for (let i = 0; i < firstDow; i++) cells.push(null);

    for (let dd = 1; dd <= last; dd++) {
      const dateISO = toISO(yyyy, mm1, dd);
      const r = byDate.get(dateISO) as any | undefined;

      const isHoliday = r?.note === "OFF";
      const daily = r && !isHoliday ? calcDailyWorkMin(r) : { workMin: null, breakMin: 0 };
      const breakVal = r && !isHoliday ? Number(r.breakMin ?? 0) || 0 : 0;
      const hasAnyInput = !!r && !isHoliday && (!!r.checkIn || !!r.checkOut || breakVal > 0);

      const status: DayCell["status"] = isHoliday
        ? "holiday"
        : !hasAnyInput
          ? "empty"
          : daily.workMin === null
            ? "incomplete"
            : "complete";

      cells.push({
        dateISO,
        dd,
        dow: new Date(dateISO + "T00:00:00").getDay(),
        checkIn: r?.checkIn,
        checkOut: r?.checkOut,
        breakMin: daily.breakMin ?? 0,
        workMin: daily.workMin ?? null,
        status,
      });
    }

    return { yyyyMm, cells };
  }, [yyyyMm, monthRecords]);

  const detail = useMemo(() => {
    if (!selected) return null;
    const r = monthRecords.find((x) => x.date === selected);
    const isHoliday = r?.note === "OFF";
    const daily = r && !isHoliday ? calcDailyWorkMin(r) : { workMin: null, breakMin: 0 };
    const status: "empty" | "incomplete" | "complete" | "holiday" =
      isHoliday ? "holiday" : !r ? "empty" : daily.workMin === null ? "incomplete" : "complete";
    return { dateISO: selected, r, daily, status, isHoliday };
  }, [selected, monthRecords]);

  const monthLabel = formatMonthTitle(yyyyMm);

  const dowLabel = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return DOW[safeLang][d.getDay()];
  };

  const openDetail = async (dateISO: string) => {
    setSelected(dateISO);
    // Ensure latest detail fetch if not already in monthRecords
    if (!monthRecords.find((x) => x.date === dateISO)) {
      try {
        const rec = await getByDate(dateISO);
        if (rec) setMonthRecords((prev) => [...prev, rec]);
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="page calPage">
      <div className="topbar">
        <div className="topbarRow">
          <button className="iconBtn" type="button" aria-label={t("aria_back")} onClick={() => history.back()}>
            <span className="material-symbols-outlined">arrow_back_ios_new</span>
          </button>

          <div className="calTopTitle">{t("calendar_title")}</div>

          <div style={{ width: 40 }} />
        </div>
      </div>

      <div className="calMonthRow">
        <button
          className="calMonthNav"
          type="button"
          aria-label={t("calendar_prev_month")}
          onClick={() => setYyyyMm(shiftMonth(yyyyMm, -1))}
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>

        <button className="calMonthSelect" type="button" onClick={() => {}}>
          <span className="calMonthText">{monthLabel}</span>
          <span className="material-symbols-outlined calMonthChevron">expand_more</span>
        </button>

        <button
          className="calMonthNav"
          type="button"
          aria-label={t("calendar_next_month")}
          onClick={() => setYyyyMm(shiftMonth(yyyyMm, 1))}
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      {error && (
        <p className="sub" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <div className="calCard">
        <div className="calWeekHeader">
          {DOW[safeLang].map((label: string, i: number) => (
            <div key={`${label}-${i}`} className={`calWeekDay ${i === 0 ? "sun" : ""} ${i === 6 ? "sat" : ""}`}>
              {label}
            </div>
          ))}
        </div>

        <div className="calGrid2">
          {model.cells.map((c, idx) => {
            if (!c) return <div key={idx} className="calCell2 calCellInactive" />;

            const isSelected = c.dateISO === selected;
            const isSun = c.dow === 0;
            const isSat = c.dow === 6;
            const miniTime = c.status === "holiday" ? t("common_holiday") : c.checkIn ? c.checkIn : "--";

            return (
              <button
                key={c.dateISO}
                type="button"
                className={[
                  "calCell2",
                  isSelected ? "sel" : "",
                  isSun ? "sun" : "",
                  isSat ? "sat" : "",
                  c.status === "holiday" ? "bad" : c.status === "complete" ? "ok" : c.status === "incomplete" ? "bad" : "",
                ].join(" ")}
                onClick={() => openDetail(c.dateISO)}
              >
                <div className="calCellDate">{c.dd}</div>
                <div className="calCellMini">{miniTime}</div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && detail && (
        <div className="calBottomSheet">
          <div className="sheetTop">
            <div>
              <div className="sheetDate">{detail.dateISO}</div>
              <div className="sheetDow">{dowLabel(detail.dateISO)}</div>
            </div>
            <button className="iconBtn" type="button" onClick={() => setSelected(null)} aria-label={t("calendar_sheet_close")}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="sheetBody">
            {!detail.r && <div className="sheetRow">{t("calendar_status_none")}</div>}
            {detail.r && detail.isHoliday && (
              <div className="sheetRow">
                <div className="sheetLabel">{t("common_holiday")}</div>
                <div className="sheetVal">{t("common_holiday")}</div>
              </div>
            )}
            {detail.r && !detail.isHoliday && (
              <>
                <div className="sheetRow">
                  <div className="sheetLabel">{t("today_label_check_in")}</div>
                  <div className="sheetVal">{detail.r.checkIn ?? "--"}</div>
                </div>
                <div className="sheetRow">
                  <div className="sheetLabel">{t("today_label_check_out")}</div>
                  <div className="sheetVal">{detail.r.checkOut ?? "--"}</div>
                </div>
                <div className="sheetRow">
                  <div className="sheetLabel">{t("today_label_break")}</div>
                  <div className="sheetVal">{minToHhmm(detail.daily.breakMin)}</div>
                </div>
                <div className="sheetRow">
                  <div className="sheetLabel">{t("today_sum_work")}</div>
                  <div className="sheetVal">{detail.daily.workMin === null ? "--" : minToHhmm(detail.daily.workMin)}</div>
                </div>
              </>
            )}
          </div>

          <div className="sheetActions">
            <button className="primaryBtn" type="button" onClick={() => nav(`/?date=${selected}`)}>
              {t("calendar_sheet_edit")}
            </button>
            <button className="pillBtn" type="button" onClick={() => setSelected(null)}>
              {t("calendar_sheet_close")}
            </button>
          </div>
        </div>
      )}

      {loading && <p className="sub">{t("login_staff_select_placeholder")}</p>}
    </div>
  );
}
