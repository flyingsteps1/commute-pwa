import { useEffect, useMemo, useState } from "react";
import { calcDailyWorkMin, minToHhmm } from "../../domain/timeCalc";
import { getWorkStatus } from "../../domain/workStatus";
import type { WorkRecord } from "../../domain/types";
import { getMonthSummary, type MonthSummary } from "../../storage/adminCalendarRepo";
import { useI18n } from "../../i18n/I18nProvider";
import "./AdminCalendarModal.css";

type StaffCalendarProps = {
  open: boolean;
  yyyyMm: string;
  staffName: string;
  records: WorkRecord[];
  loading: boolean;
  error: string | null;
  selectedDate: string | null;
  onClose: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (dateISO: string) => void;
};

type SummaryCalendarProps = {
  open: boolean;
  yyyyMm: string;
  onClose: () => void;
  onSelectDate: (dateISO: string) => void;
  onShiftMonth: (delta: number) => void;
};

type Props = StaffCalendarProps | SummaryCalendarProps;

const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function isStaffMode(props: Props): props is StaffCalendarProps {
  return "records" in props;
}

function daysInMonth(yyyy: number, mm1: number) {
  return new Date(yyyy, mm1, 0).getDate();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export default function AdminCalendarModal(props: Props) {
  const { t } = useI18n();
  const { open, yyyyMm, onClose } = props;
  const staffProps = isStaffMode(props) ? props : null;
  const summaryProps: SummaryCalendarProps | null = staffProps ? null : (props as SummaryCalendarProps);
  const staffRecords: WorkRecord[] = staffProps ? staffProps.records : [];
  const staffSelected = staffProps ? staffProps.selectedDate : null;
  const staffName = staffProps ? staffProps.staffName : "";
  const staffLoading = staffProps ? staffProps.loading : false;
  const staffError = staffProps ? staffProps.error : null;

  const [summary, setSummary] = useState<MonthSummary>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const recordMap = useMemo(
    () => new Map<string, WorkRecord>(staffRecords.map((r: WorkRecord) => [r.date, r])),
    [staffRecords]
  );

  useEffect(() => {
    if (staffProps || !open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getMonthSummary(yyyyMm);
        if (!cancelled) setSummary(res.days);
        if (import.meta.env.DEV) console.log("[AdminCalendarModal] loaded", { yyyyMm, days: Object.keys(res.days).length });
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
  }, [open, yyyyMm, staffProps]);

  useEffect(() => {
    if (staffProps || !open) return;
    setSelectedDate(null);
  }, [open, yyyyMm, staffProps]);

  if (!open) return null;

  const [yyyy, mm1] = yyyyMm.split("-").map(Number);
  const totalDays = Number.isNaN(yyyy) || Number.isNaN(mm1) ? 31 : daysInMonth(yyyy, mm1);
  const firstDow = Number.isNaN(yyyy) || Number.isNaN(mm1) ? 0 : new Date(`${yyyyMm}-01T00:00:00`).getDay();

  const cells: Array<{ dateISO: string; dd: string; dow: number; record?: WorkRecord } | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let day = 1; day <= totalDays; day++) {
    const dd = pad2(day);
    const dateISO = `${yyyyMm}-${dd}`;
    cells.push({ dateISO, dd, dow: (firstDow + day - 1) % 7, record: recordMap.get(dateISO) });
  }

  const detailRecord = staffSelected ? recordMap.get(staffSelected) : undefined;
  const detailStatus = detailRecord ? getWorkStatus(detailRecord, todayISO) : "no_record";
  const detailIsOff = detailStatus === "holiday";
  const detailWorking = detailStatus === "working";
  const detailIncomplete = detailStatus === "incomplete";
  const detailComplete = detailStatus === "off";
  const detailDaily = detailRecord && !detailIsOff ? calcDailyWorkMin(detailRecord) : { workMin: null, breakMin: 0 };

  if (!staffProps) {
    return (
      <div className="no-print adminCalendarOverlay isStaff" onClick={onClose}>
        <div className="adminCalendarCard" onClick={(e) => e.stopPropagation()}>
          <div className="calendarHeader">
            <div className="monthNav">
              <button
                type="button"
                className="navBtn"
                onClick={() => summaryProps!.onShiftMonth(-1)}
                aria-label="previous-month"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <span className="monthLabel">{yyyyMm}</span>
              <button
                type="button"
                className="navBtn"
                onClick={() => summaryProps!.onShiftMonth(1)}
                aria-label="next-month"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
            <button type="button" className="closeBtn" onClick={onClose}>
              {t("calendar_sheet_close")}
            </button>
          </div>

          {(loading || error) && (
            <div className="calendarNotice">
              {loading && <span>{t("common_loading")}</span>}
              {!loading && error && <span className="errorText">{error}</span>}
            </div>
          )}

          <div className="calendarBody">
            <div className="dowRow">
              {DOW_LABELS.map((label, idx) => (
                <div
                  key={`dow-${idx}`}
                  className={`dowCell ${idx === 0 ? "dowSun" : ""} ${idx === 6 ? "dowSat" : ""}`}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="calendarGrid">
              {Array.from({ length: 31 }).map((_, i) => {
                const dd = String(i + 1).padStart(2, "0");
                const dateISO = `${yyyyMm}-${dd}`;
                const s = summary[dateISO];
                const isToday = dateISO === todayISO;
                const isSelected = dateISO === selectedDate;
                const hasRecord = !!s && (s.off + s.incomplete + s.holiday > 0);

                let lines: Array<{ text: string; className: string }> = [];
                if (s && hasRecord) {
                  if (s.holiday > 0) lines.push({ text: `${t("common_holiday")} ${s.holiday}`, className: "summaryHoliday" });
                  if (s.incomplete > 0) lines.push({ text: `${t("common_incomplete")} ${s.incomplete}`, className: "summaryIncomplete" });
                  if (s.off > 0) lines.push({ text: `${t("common_off")} ${s.off}`, className: "summaryOff" });
                }

                return (
                  <button
                    key={`d-${dateISO}`}
                    type="button"
                    className={`calendarCell ${isToday ? "isToday" : ""} ${isSelected ? "isSelected" : ""} ${
                      hasRecord ? "hasRecord" : "noRecord"
                    }`}
                    onClick={() => {
                      setSelectedDate(dateISO);
                      summaryProps!.onSelectDate(dateISO);
                    }}
                  >
                    <span className="cellDay">{dd}</span>
                    <div className="cellSummary">
                      {lines.slice(0, 2).map((line, idx) => (
                        <span key={`${dateISO}-${idx}`} className={`summaryLine ${line.className}`}>
                          {line.text}
                        </span>
                      ))}
                    </div>
                    {hasRecord && <span className="recordDot" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="no-print adminCalendarOverlay" onClick={onClose}>
      <div className="adminCalendarCard isStaff" onClick={(e) => e.stopPropagation()}>
        <div className="calendarHeader">
          <div className="headerTitles">
            <h2 className="staffTitle">{staffName || t("common_staff")}</h2>
            <span className="monthLabel">{yyyyMm}</span>
          </div>
          <div className="monthNav">
            <button type="button" className="navBtn" onClick={staffProps.onPrevMonth} aria-label="previous-month">
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <button type="button" className="navBtn" onClick={staffProps.onNextMonth} aria-label="next-month">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
          <button type="button" className="closeBtn" onClick={onClose}>
            {t("calendar_sheet_close")}
          </button>
        </div>

        {(staffLoading || staffError) && (
          <div className="calendarNotice">
            {staffLoading && <span>{t("common_loading")}</span>}
            {!staffLoading && staffError && <span className="errorText">{staffError}</span>}
          </div>
        )}

        <div className="calendarBody">
          <div className="calendarLayout">
          <div className="calendarPanel">
            <div className="dowRow">
              {DOW_LABELS.map((label, idx) => (
                <div
                  key={`dow-${idx}`}
                  className={`dowCell ${idx === 0 ? "dowSun" : ""} ${idx === 6 ? "dowSat" : ""}`}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="calendarGrid">
              {cells.map((cell, idx) => {
                if (!cell) return <div key={`empty-${idx}`} className="calendarCell emptyCell" />;
                const isToday = cell.dateISO === todayISO;
                const isSelected = cell.dateISO === staffSelected;
                const record = cell.record;
                const status = record ? getWorkStatus(record, todayISO) : "no_record";
                const statusLabel =
                  status === "holiday"
                    ? t("common_holiday")
                    : status === "off"
                      ? t("common_off")
                      : status === "working"
                        ? t("common_working")
                        : status === "incomplete"
                          ? t("common_incomplete")
                          : "";
                const statusClass =
                  status === "holiday"
                    ? "statusOff"
                    : status === "off"
                      ? "statusComplete"
                      : status === "working"
                        ? "statusWorking"
                        : status === "incomplete"
                          ? "statusIncomplete"
                          : "statusNone";
                return (
                  <button
                    key={`d-${cell.dateISO}`}
                    type="button"
                    className={`calendarCell ${isToday ? "isToday" : ""} ${isSelected ? "isSelected" : ""}`}
                    onClick={() => staffProps.onSelectDate(cell.dateISO)}
                  >
                    <span className="cellDay">{cell.dd}</span>
                    {record && status !== "no_record" && <span className={`statusBadge ${statusClass}`}>{statusLabel}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="detailPanel">
            <div className="detailCard">
              <div className="detailHeader">
                <div className="detailDate">{staffSelected ?? "날짜를 선택하세요"}</div>
              </div>

              {!staffSelected && (
                <div className="detailEmpty">날짜를 선택하세요</div>
              )}

              {staffSelected && !detailRecord && (
                <div className="detailEmpty">{t("common_no_record")}</div>
              )}

              {staffSelected && detailRecord && detailIsOff && (
                <div className="detailEmpty">{t("common_holiday")} (OFF)</div>
              )}

              {staffSelected && detailRecord && detailWorking && (
                <>
                  <div className="detailNote">{t("common_working")}</div>
                  {detailRecord.checkIn && (
                    <div className="detailRow">
                      <span className="detailLabel">{t("common_check_in")}</span>
                      <span className="detailValue">{detailRecord.checkIn}</span>
                    </div>
                  )}
                  {detailRecord.breakMin !== undefined && (
                    <div className="detailRow">
                      <span className="detailLabel">{t("today_label_break")}</span>
                      <span className="detailValue">{minToHhmm(detailRecord.breakMin ?? 0)}</span>
                    </div>
                  )}
                </>
              )}

              {staffSelected && detailRecord && detailIncomplete && (
                <>
                  <div className="detailNote">미완료(체크아웃 누락)</div>
                  {detailRecord.checkIn && (
                    <div className="detailRow">
                      <span className="detailLabel">{t("common_check_in")}</span>
                      <span className="detailValue">{detailRecord.checkIn}</span>
                    </div>
                  )}
                  {detailRecord.checkOut && (
                    <div className="detailRow">
                      <span className="detailLabel">{t("common_check_out")}</span>
                      <span className="detailValue">{detailRecord.checkOut}</span>
                    </div>
                  )}
                  {detailRecord.breakMin !== undefined && (
                    <div className="detailRow">
                      <span className="detailLabel">{t("today_label_break")}</span>
                      <span className="detailValue">{minToHhmm(detailRecord.breakMin ?? 0)}</span>
                    </div>
                  )}
                </>
              )}

              {staffSelected && detailRecord && detailComplete && (
                <>
                  <div className="detailRow">
                    <span className="detailLabel">{t("today_label_check_in")}</span>
                    <span className="detailValue">{detailRecord.checkIn ?? "--"}</span>
                  </div>
                  <div className="detailRow">
                    <span className="detailLabel">{t("today_label_check_out")}</span>
                    <span className="detailValue">{detailRecord.checkOut ?? "--"}</span>
                  </div>
                  <div className="detailRow">
                    <span className="detailLabel">{t("today_label_break")}</span>
                    <span className="detailValue">{minToHhmm(detailDaily.breakMin ?? 0)}</span>
                  </div>
                  <div className="detailRow">
                    <span className="detailLabel">{t("today_sum_work")}</span>
                    <span className="detailValue">{detailDaily.workMin === null ? "--" : minToHhmm(detailDaily.workMin)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}


