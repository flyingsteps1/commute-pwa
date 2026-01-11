import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getMyTodayRecord, upsertDayOff, upsertMyTodayRecord } from "../storage/todayRepo";
import { useI18n } from "../i18n/I18nProvider";
import "../styles/staffToday.css";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function formatTodayTitle(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00`);
  return d.toLocaleDateString("ko-KR", { month: "long", day: "2-digit", weekday: "short" });
}

function toMinutes(hhmm?: string | null) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToHHMM(min: number) {
  const total = Math.max(0, Math.floor(min));
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function nowHHMM() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseHHMM(value?: string | null) {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h, m };
}

export default function TodayPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { t } = useI18n();
  const debug = new URLSearchParams(window.location.search).get("debug") === "1";

  const dateISO = useMemo(() => {
    const q = sp.get("date");
    if (q && isISODate(q)) return q;
    return todayISO();
  }, [sp]);

  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [isHoliday, setIsHoliday] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [accordionOpen, setAccordionOpen] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerField, setPickerField] = useState<"in" | "out" | null>(null);
  const [draftHour, setDraftHour] = useState(0);
  const [draftMin, setDraftMin] = useState(0);
  const hourColRef = useRef<HTMLDivElement | null>(null);
  const minColRef = useRef<HTMLDivElement | null>(null);

  const minuteSteps = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), []);
  const hourSteps = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const itemHeight = 40;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rec = await getMyTodayRecord(dateISO);
        if (cancelled) return;
        if (rec?.note === "OFF") {
          setIsHoliday(true);
          setCheckIn(null);
          setCheckOut(null);
          setBreakMinutes(0);
          return;
        }
        setIsHoliday(false);
        setCheckIn(rec?.checkIn ?? null);
        setCheckOut(rec?.checkOut ?? null);
        setBreakMinutes(rec?.breakMin ?? 0);
      } catch (e: any) {
        if (cancelled) return;
        setErrorMsg(e?.message ?? "failed");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [dateISO]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const checkInMin = toMinutes(checkIn);
  const checkOutMin = toMinutes(checkOut);
  const diffMinutes =
    checkInMin !== null && checkOutMin !== null ? checkOutMin - checkInMin : null;
  const totalMinutes =
    diffMinutes !== null ? diffMinutes - breakMinutes : null;

  const totalDisplay =
    isHoliday || totalMinutes === null || totalMinutes < 0
      ? "--:--"
      : minutesToHHMM(totalMinutes);

  const breakDisplay = isHoliday ? "00:00" : minutesToHHMM(breakMinutes);

  const canSave = isHoliday || (checkInMin !== null && checkOutMin !== null && totalMinutes !== null && totalMinutes >= 0);

  async function handleSave() {
    setErrorMsg(null);
    if (!canSave) {
      setErrorMsg("출근 및 퇴근 시간을 올바르게 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      if (isHoliday) {
        await upsertDayOff(dateISO);
      } else {
        await upsertMyTodayRecord({
          date: dateISO,
          checkIn: checkIn ?? undefined,
          checkOut: checkOut ?? undefined,
          breakMin: breakMinutes,
          note: null,
        });
      }
      setToastVisible(true);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setToastVisible(false), 3000);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "출근 및 퇴근 시간을 올바르게 입력해주세요.");
    } finally {
      setSaving(false);
    }
  }

  function onToggleHoliday() {
    setErrorMsg(null);
    setIsHoliday((v) => !v);
    if (!isHoliday) {
      setCheckIn(null);
      setCheckOut(null);
      setBreakMinutes(0);
    }
  }

  async function onNowCheckIn() {
    const now = nowHHMM();
    setCheckIn(now);
    setErrorMsg(null);
    try {
      await upsertMyTodayRecord({
        date: dateISO,
        checkIn: now,
        checkOut: checkOut ?? undefined,
        breakMin: breakMinutes,
        note: null,
      });
    } catch (e: any) {
      setErrorMsg(e?.message ?? "출근 및 퇴근 시간을 올바르게 입력해주세요.");
    }
  }

  async function onNowCheckOut() {
    const now = nowHHMM();
    setCheckOut(now);
    setErrorMsg(null);
    try {
      await upsertMyTodayRecord({
        date: dateISO,
        checkIn: checkIn ?? undefined,
        checkOut: now,
        breakMin: breakMinutes,
        note: null,
      });
    } catch (e: any) {
      setErrorMsg(e?.message ?? "출근 및 퇴근 시간을 올바르게 입력해주세요.");
    }
  }

  function decBreak() {
    setBreakMinutes((v) => Math.max(0, v - 10));
  }

  function incBreak() {
    setBreakMinutes((v) => Math.max(0, v + 10));
  }

  function openPicker(field: "in" | "out") {
    if (isHoliday || saving) return;
    const source = field === "in" ? checkIn : checkOut;
    const parsed = parseHHMM(source);
    const fallback = parseHHMM(nowHHMM());
    const h = parsed?.h ?? fallback?.h ?? 0;
    const mRaw = parsed?.m ?? fallback?.m ?? 0;
    const m = Math.floor(mRaw / 5) * 5;
    setDraftHour(h);
    setDraftMin(m);
    setPickerField(field);
    setPickerOpen(true);
  }

  function applyPicker() {
    if (!pickerField) {
      setPickerOpen(false);
      return;
    }
    const hh = String(draftHour).padStart(2, "0");
    const mm = String(draftMin).padStart(2, "0");
    const value = `${hh}:${mm}`;
    if (pickerField === "in") setCheckIn(value);
    if (pickerField === "out") setCheckOut(value);
    setErrorMsg(null);
    setPickerOpen(false);
  }

  useEffect(() => {
    if (!pickerOpen) return;
    const hourIdx = Math.max(0, Math.min(23, draftHour));
    const minIdx = Math.max(0, Math.min(minuteSteps.length - 1, minuteSteps.indexOf(draftMin)));
    if (hourColRef.current) hourColRef.current.scrollTop = hourIdx * itemHeight;
    if (minColRef.current) minColRef.current.scrollTop = minIdx * itemHeight;
  }, [pickerOpen, draftHour, draftMin, minuteSteps]);

  function onBack() {
    const q = sp.get("date");
    if (q) {
      nav("/calendar");
      return;
    }
    history.back();
  }

  return (
    <div className="screen">
      <header className="app-bar">
        <div className="header-left">
          <button className="icon-button" type="button" aria-label={t("aria_back")} onClick={onBack}>
            <span className="material-symbols-outlined">arrow_back_ios_new</span>
          </button>
        </div>
        <div className="header-center">
          <h1 className="app-title">{t("today_title")}</h1>
        </div>
        <div className="header-right header-actions">
          <button
            className={`holiday-toggle-button ${isHoliday ? "active" : ""}`}
            type="button"
            onClick={onToggleHoliday}
            disabled={saving}
            aria-pressed={isHoliday}
          >
            휴무
          </button>
          <button className="icon-button" type="button" aria-label={t("aria_calendar")} onClick={() => nav("/calendar")}>
            <span className="material-symbols-outlined">calendar_month</span>
          </button>
        </div>
      </header>

      <main className="content-area">
        {debug && (
          <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", padding: "6px 16px" }}>
            BUILD: EDFA927__20260111
          </div>
        )}
        <div className="date-status-section">
          <div className="date-text-group">
            <h2 className="main-date">{formatTodayTitle(dateISO)}</h2>
            <p className="sub-text">{t("today_desc_default")}</p>
          </div>
        </div>

        <div className="core-input-card card" id="input-card">
          <div className={`input-row ${isHoliday ? "disabled" : ""}`}>
            <span className="label">
              <span className="material-symbols-outlined">login</span>
              {t("today_label_check_in")}
            </span>
            <button
              className="time-button"
              type="button"
              onClick={() => openPicker("in")}
              disabled={isHoliday || saving}
              aria-label={t("today_label_check_in")}
            >
              {isHoliday ? "--:--" : checkIn ?? "--:--"}
            </button>
            <button className="now-button" type="button" onClick={onNowCheckIn} disabled={isHoliday || saving}>
              출근
            </button>
          </div>
          <div className={`input-row ${isHoliday ? "disabled" : ""}`}>
            <span className="label">
              <span className="material-symbols-outlined">logout</span>
              {t("today_label_check_out")}
            </span>
            <button
              className="time-button"
              type="button"
              onClick={() => openPicker("out")}
              disabled={isHoliday || saving}
              aria-label={t("today_label_check_out")}
            >
              {isHoliday ? "--:--" : checkOut ?? "--:--"}
            </button>
            <button className="now-button" type="button" onClick={onNowCheckOut} disabled={isHoliday || saving}>
              퇴근
            </button>
          </div>
          <div className={`input-row ${isHoliday ? "disabled" : ""}`}>
            <span className="label">
              <span className="material-symbols-outlined">hourglass_empty</span>
              {t("today_label_break")}
              <span style={{ fontSize: 13, color: "var(--muted-color)" }}>{t("today_unit_minutes")}</span>
            </span>
            <div className="stepper-group">
              <button className="stepper-button" type="button" onClick={decBreak} disabled={isHoliday || saving}>
                -
              </button>
              <span className="stepper-value">{isHoliday ? 0 : breakMinutes}</span>
              <button className="stepper-button" type="button" onClick={incBreak} disabled={isHoliday || saving}>
                +
              </button>
            </div>
          </div>

          <div className="result-summary-bar">
            <div className="summary-item">
              <span className="label">{t("today_sum_work")}</span>
              <span className="value">{totalDisplay}</span>
            </div>
            <div className="summary-item">
              <span className="label">{t("today_sum_break")}</span>
              <span className="value">{breakDisplay}</span>
            </div>
          </div>
        </div>

        <div className="today-actions">
          <div className="savebar" role="presentation">
            <button className="primary-cta-button" type="button" onClick={handleSave} disabled={saving || !canSave}>
              <span className={saving ? "hidden" : ""}>
                {isHoliday ? "휴무 저장하기" : t("today_btn_save")}
              </span>
              <div className={`spinner ${saving ? "visible" : ""}`} />
            </button>
          </div>
        </div>

        <p className={`error-message-block ${errorMsg ? "visible" : ""}`}>{errorMsg}</p>

        <div className="data-options-accordion">
          <button
            className={`accordion-header ${accordionOpen ? "expanded" : ""}`}
            type="button"
            onClick={() => setAccordionOpen((v) => !v)}
          >
            <span>{t("today_data_options")}</span>
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
          <div className="accordion-content" style={{ display: accordionOpen ? "block" : "none" }}>
            <div className="list-item" onClick={() => console.log("TODO reset")}>초기화</div>
            <div className="list-item" onClick={() => console.log("TODO export")}>내보내기</div>
            <div className="list-item" onClick={() => console.log("TODO sync")}>동기화 상태</div>
          </div>
        </div>
      </main>

      <div className={`toast-message ${toastVisible ? "visible" : ""}`} id="save-success-toast">
        기록이 성공적으로 저장되었습니다!
      </div>

      {pickerOpen && (
        <div className="timepicker-overlay" onClick={() => setPickerOpen(false)}>
          <div className="timepicker-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="timepicker-header">
              <div className="timepicker-title">{pickerField === "in" ? "출근 시간" : "퇴근 시간"}</div>
            </div>
            <div className="timepicker-wheel">
              <div className="wheel-column" ref={hourColRef} onScroll={(event) => {
                const target = event.currentTarget;
                const idx = Math.round(target.scrollTop / itemHeight);
                const next = Math.max(0, Math.min(23, idx));
                setDraftHour(next);
              }}>
                {hourSteps.map((h) => (
                  <div key={h} className={`wheel-item ${draftHour === h ? "active" : ""}`}>
                    {String(h).padStart(2, "0")}
                  </div>
                ))}
              </div>
              <div className="wheel-column" ref={minColRef} onScroll={(event) => {
                const target = event.currentTarget;
                const idx = Math.round(target.scrollTop / itemHeight);
                const next = Math.max(0, Math.min(minuteSteps.length - 1, idx));
                setDraftMin(minuteSteps[next]);
              }}>
                {minuteSteps.map((m) => (
                  <div key={m} className={`wheel-item ${draftMin === m ? "active" : ""}`}>
                    {String(m).padStart(2, "0")}
                  </div>
                ))}
              </div>
              <div className="wheel-highlight" aria-hidden="true" />
            </div>
            <div className="timepicker-actions">
              <button className="timepicker-btn ghost" type="button" onClick={() => setPickerOpen(false)}>
                취소
              </button>
              <button className="timepicker-btn primary" type="button" onClick={applyPicker}>
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
