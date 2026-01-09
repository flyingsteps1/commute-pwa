import { useEffect, useState } from "react";
import { getDayDetails, type DayDetail } from "../../storage/adminCalendarRepo";
import { minToHhmm } from "../../domain/timeCalc";
import { useI18n } from "../../i18n/I18nProvider";
import "./AdminDayDetailModal.css";

type Props = {
  open: boolean;
  dateISO: string | null;
  onClose: () => void;
};

export default function AdminDayDetailModal({ open, dateISO, onClose }: Props) {
  const { t } = useI18n();
  const [rows, setRows] = useState<DayDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !dateISO) return;
    const targetDate = dateISO as string;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getDayDetails(targetDate);
        if (!cancelled) setRows(res);
        if (import.meta.env.DEV) console.log("[AdminDayDetail] loaded", { dateISO: targetDate, count: res.length, sample: res[0] });
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
  }, [open, dateISO]);

  if (!open || !dateISO) return null;

  const statusLabel = (status: DayDetail["status"]) => {
    switch (status) {
      case "holiday":
        return t("common_holiday");
      case "off":
        return t("common_off");
      case "working":
        return t("common_working");
      case "incomplete":
        return t("common_incomplete");
      default:
        return t("common_no_record");
    }
  };

  const statusClass = (status: DayDetail["status"]) => {
    switch (status) {
      case "holiday":
        return "detailHoliday";
      case "incomplete":
        return "detailIncomplete";
      case "off":
        return "detailOff";
      case "working":
        return "detailWorking";
      default:
        return "detailNoRecord";
    }
  };

  return (
    <div className="no-print adminDayOverlay" onClick={onClose}>
      <div className="adminDayCard" onClick={(e) => e.stopPropagation()}>
        <div className="dayHeader">
          <div className="dayTitle">{dateISO}</div>
          <button type="button" onClick={onClose} className="dayCloseBtn">
            {t("calendar_sheet_close")}
          </button>
        </div>
        {(loading || error) && (
          <div className="dayNotice">
            {loading && <span>{t("common_loading")}</span>}
            {!loading && error && <span className="dayError">{error}</span>}
          </div>
        )}
        <div className="dayList">
          {rows.map((r) => {
            const isHoliday = r.status === "holiday";
            const dash = t("common_dash");
            const checkIn = isHoliday ? dash : r.checkIn ?? dash;
            const checkOut = isHoliday ? dash : r.checkOut ?? dash;
            const breakMin = isHoliday ? dash : String(r.breakMin ?? 0);
            const workMin = isHoliday
              ? dash
              : r.workMin === null || r.workMin === undefined
              ? t("print_incomplete")
              : minToHhmm(r.workMin);
            return (
              <div key={r.staffId} className="dayRow">
                <div className="dayLeft">
                  <div className="dayAvatar">{(r.name || r.staffId || t("common_staff")).charAt(0)}</div>
                  <div className="dayInfo">
                    <div className="dayName">{r.name}</div>
                    <div className="dayStaffId">{r.staffId}</div>
                  </div>
                </div>
                <div className="dayRight">
                  <span className={`detailStatusPill ${statusClass(r.status)}`}>
                    {statusLabel(r.status)}
                  </span>
                  <div className="detailGrid">
                    <span className="detailKey">{t("common_check_in")}</span>
                    <span className="detailVal">{checkIn}</span>
                    <span className="detailKey">{t("common_check_out")}</span>
                    <span className="detailVal">{checkOut}</span>
                    <span className="detailKey">{t("print_break")}</span>
                    <span className="detailVal">{breakMin}</span>
                    <span className="detailKey">{t("print_work")}</span>
                    <span className="detailVal">{workMin}</span>
                    <span className="detailKey">상태</span>
                    <span className="detailVal">{statusLabel(r.status)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && !loading && (
            <div className="dayEmpty">{t("common_no_record")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
