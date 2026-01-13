import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listStaffPublic, type StaffPublic } from "../storage/staffRepo";
import { getAppSession } from "../storage/appSession";
import { useI18n } from "../i18n/I18nProvider";
import { supabase } from "../storage/supabaseClient";
import { normalizeWorkRecord } from "../storage/todayRepo";
import { calcDailyWorkMin, minToHhmm } from "../domain/timeCalc";
import type { WorkRecord } from "../domain/types";
import PageHeader from "../components/PageHeader";
import "./AdminRecordsPage.css";

type RecordStatus = "working" | "done" | "incomplete" | "off" | "none";

type RecordItem = {
  record: WorkRecord;
  staff: StaffPublic | null;
  status: RecordStatus;
};

type RangeMode = "week" | "month" | "custom";

const MS_DAY = 24 * 60 * 60 * 1000;

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeekMonday(d: Date) {
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  return start;
}

function isOffNote(note: unknown) {
  if (!note) return false;
  const s = String(note).toLowerCase();
  return s.includes("off") || s.includes("휴무");
}

function getRecordStatus(record: WorkRecord, todayISO: string): RecordStatus {
  if (isOffNote(record.note)) return "off";
  const hasCheckIn = !!record.checkIn;
  const hasCheckOut = !!record.checkOut;
  if (hasCheckIn && hasCheckOut) return "done";
  if (hasCheckIn && !hasCheckOut) {
    if (record.date === todayISO) return "working";
    if (record.date < todayISO) return "incomplete";
    return "none";
  }
  if (!hasCheckIn && hasCheckOut) return "incomplete";
  return "none";
}

function formatDateLabel(dateISO: string) {
  return dateISO.replace(/-/g, ".");
}

export default function AdminRecordsPage() {
  const nav = useNavigate();
  const { t } = useI18n();
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RecordStatus | "all">("all");
  const [rangeMode, setRangeMode] = useState<RangeMode>("month");
  const [customOpen, setCustomOpen] = useState(false);

  const monthStart = useMemo(() => {
    const d = new Date();
    return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
  }, []);
  const monthEnd = useMemo(() => {
    const d = new Date();
    return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }, []);

  const [customStart, setCustomStart] = useState(monthStart);
  const [customEnd, setCustomEnd] = useState(monthEnd);

  const range = useMemo(() => {
    const today = new Date();
    if (rangeMode === "week") {
      const start = startOfWeekMonday(today);
      const end = new Date(start.getTime() + MS_DAY * 6);
      return { start: toISODate(start), end: toISODate(end) };
    }
    if (rangeMode === "custom") {
      return { start: customStart, end: customEnd };
    }
    return { start: monthStart, end: monthEnd };
  }, [rangeMode, customStart, customEnd, monthStart, monthEnd]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const staffList = await listStaffPublic();
        if (cancelled) return;
        console.log("========== ADMIN RECORDS DEBUG ==========");
        console.log("range =", range);
        console.log("staffList.length =", staffList.length);
        console.log(
          "staffList preview =",
          staffList.slice(0, 5).map((s) => ({
            name: s.name,
            displayName: s.displayName,
            userId: s.userId,
            staffId: s.staffId,
          }))
        );
        console.log(
          "staffList userIds preview =",
          staffList.map((s) => s.userId).filter(Boolean).slice(0, 10)
        );
        const userIds = staffList.map((s) => s.userId).filter(Boolean) as string[];
        if (userIds.length === 0) {
          setRecords([]);
          return;
        }
        const workplaceId = getAppSession()?.workplaceId ?? import.meta.env.VITE_WORKPLACE_ID ?? null;
        let data: any[] | null = null;
        let recErr: any = null;

        if (workplaceId) {
          const res = await supabase
            .from("work_records")
            .select("date, staff_user_id, check_in, check_out, break_minutes, note")
            .eq("workplace_id", workplaceId)
            .gte("date", range.start)
            .lte("date", range.end)
            .order("date", { ascending: false });
          data = res.data ?? null;
          recErr = res.error ?? null;
        }

        if (recErr || !workplaceId) {
          const res = await supabase
            .from("work_records")
            .select("date, staff_user_id, check_in, check_out, break_minutes, note")
            .in("staff_user_id", userIds)
            .gte("date", range.start)
            .lte("date", range.end)
            .order("date", { ascending: false });
          data = res.data ?? null;
          recErr = res.error ?? null;
        }

        if (recErr) throw recErr;

        const rows = data ?? [];
        console.log("records.rows.length =", rows.length);
        const rowStaffIds = Array.from(
          new Set(rows.map((r: any) => r.staff_user_id).filter(Boolean))
        );
        console.log("distinct staff_user_id count =", rowStaffIds.length);
        console.log("staff_user_id preview =", rowStaffIds.slice(0, 10));
        const staffUserIds = new Set(staffList.map((s) => s.userId).filter(Boolean));
        const rowIdSet = new Set(rowStaffIds);
        const idsInRowsNotInStaff = rowStaffIds.filter((id) => !staffUserIds.has(id)).slice(0, 10);
        const idsInStaffNotInRows = Array.from(staffUserIds).filter((id) => !rowIdSet.has(id)).slice(0, 10);
        console.log("idsInRowsNotInStaff preview =", idsInRowsNotInStaff);
        console.log("idsInStaffNotInRows preview =", idsInStaffNotInRows);

        const normalized = (data ?? []).map(normalizeWorkRecord);
        const byUserId = new Map(staffList.map((s) => [s.userId, s]));
        const items = normalized.map((rec) => {
          const staffItem = byUserId.get((rec as any).staff_user_id ?? rec.employeeId ?? "");
          return { record: rec, staff: staffItem ?? null, status: getRecordStatus(rec, todayISO) };
        });
        if (!cancelled) setRecords(items);
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
  }, [range.start, range.end, todayISO]);

  const summary = useMemo(() => {
    let working = 0;
    let done = 0;
    let incomplete = 0;
    let off = 0;
    for (const r of records) {
      if (r.status === "working") working++;
      else if (r.status === "done") done++;
      else if (r.status === "incomplete") incomplete++;
      else if (r.status === "off") off++;
    }
    return { working, done, incomplete, off };
  }, [records]);

  const visibleRecords = records.filter((r) => {
    if (statusFilter === "all") return true;
    return r.status === statusFilter;
  });

  return (
    <div className="adminRecordsRoot">
      <div className="adminRecordsShell">
        <PageHeader
          title="기록"
          subtitle="직원 기록 조회"
          backAriaLabel={t("back") ?? "back"}
          rightSlot={(
            <button
              type="button"
              className="pageHeaderBtn pageHeaderBtnAccent"
              onClick={() => setCustomOpen(true)}
              aria-label={t("calendar") ?? "calendar"}
            >
              <span className="material-symbols-outlined">calendar_month</span>
            </button>
          )}
        />

        <main className="adminRecordsMain">
          <section className="periodCard" aria-label="기간 요약">
            <div className="periodRange">{range.start} ~ {range.end}</div>
            <div className="periodSummary">
              <span className="periodChip">근무 {summary.working}</span>
              <span className="periodChip periodChipDone">{t("common_off")} {summary.done}</span>
              <span className="periodChip periodChipIncomplete">{t("common_incomplete")} {summary.incomplete}</span>
              <span className="periodChip periodChipOff">{t("common_holiday")} {summary.off}</span>
            </div>
            <div className="periodTabs">
              <button
                type="button"
                className={`periodTab ${rangeMode === "week" ? "isActive" : ""}`}
                onClick={() => setRangeMode("week")}
              >
                이번주
              </button>
              <button
                type="button"
                className={`periodTab ${rangeMode === "month" ? "isActive" : ""}`}
                onClick={() => setRangeMode("month")}
              >
                이번달
              </button>
              <button
                type="button"
                className={`periodTab ${rangeMode === "custom" ? "isActive" : ""}`}
                onClick={() => {
                  setRangeMode("custom");
                  setCustomOpen(true);
                }}
              >
                직접선택
              </button>
            </div>
          </section>

          <section className="statusFilters" aria-label="상태 필터">
            <button type="button" className={`statusChip ${statusFilter === "all" ? "isActive" : ""}`} onClick={() => setStatusFilter("all")}>
              {t("records_filter_all")}
            </button>
            <button type="button" className={`statusChip ${statusFilter === "working" ? "isActive" : ""}`} onClick={() => setStatusFilter("working")}>
              {t("common_working")}
            </button>
            <button type="button" className={`statusChip ${statusFilter === "done" ? "isActive" : ""}`} onClick={() => setStatusFilter("done")}>
              {t("common_off")}
            </button>
            <button type="button" className={`statusChip ${statusFilter === "incomplete" ? "isActive" : ""}`} onClick={() => setStatusFilter("incomplete")}>
              {t("common_incomplete")}
            </button>
            <button type="button" className={`statusChip ${statusFilter === "off" ? "isActive" : ""}`} onClick={() => setStatusFilter("off")}>
              {t("common_holiday")}
            </button>
          </section>

          <section className="recordList" aria-label="직원 기록 리스트">
            {loading && (
              <div className="recordsEmpty">로딩중...</div>
            )}
            {!loading && error && (
              <div className="recordsError">{error}</div>
            )}
            {!loading && !error && visibleRecords.length === 0 && (
              <div className="recordsEmpty">{t("common_no_record")}</div>
            )}
            {visibleRecords.map((item, idx) => {
              const staffName = item.staff?.name ?? item.staff?.displayName ?? item.staff?.staffId ?? t("common_staff");
              const staffId = item.staff?.staffId ?? item.staff?.userId ?? item.record.employeeId ?? `staff-${idx}`;
              const dateISO = item.record.date;
              const status = item.status;
              const detail = calcDailyWorkMin(item.record);
              const timeLine = (() => {
                if (status === "done") return `${item.record.checkIn ?? "--:--"} - ${item.record.checkOut ?? "--:--"}`;
                if (status === "working") return `${item.record.checkIn ?? "--:--"} - ...`;
                if (status === "incomplete") return `${item.record.checkIn ?? "--:--"} - --:--`;
                return "-";
              })();
              const descLine = (() => {
                if (status === "done") {
                  return `휴게 ${minToHhmm(detail.breakMin)} | 총근무 ${detail.workMin === null ? "--:--" : minToHhmm(detail.workMin)}`;
                }
                if (status === "working") {
                  return "근무중";
                }
                if (status === "incomplete") {
                  return "퇴근 미처리";
                }
                if (status === "off") {
                  return item.record.note ? String(item.record.note) : t("common_holiday");
                }
                return t("common_no_record");
              })();
              const badge = (() => {
                if (status === "working") return { text: t("common_working"), className: "recordBadge--working" };
                if (status === "done") return { text: t("common_off"), className: "recordBadge--done" };
                if (status === "incomplete") return { text: t("common_incomplete"), className: "recordBadge--incomplete" };
                if (status === "off") return { text: t("common_holiday"), className: "recordBadge--off" };
                return { text: t("common_no_record"), className: "recordBadge--none" };
              })();
              const onNavigate = () => {
                const month = dateISO.slice(0, 7);
                nav(`/admin/monthly?staffId=${encodeURIComponent(staffId)}&month=${encodeURIComponent(month)}&date=${encodeURIComponent(dateISO)}`);
              };
              return (
                <button
                  key={`${staffId}-${dateISO}`}
                  type="button"
                  className={`recordCard ${status === "incomplete" ? "recordCard--alert" : ""}`}
                  onClick={onNavigate}
                >
                  <div className="recordHeader">
                    <span className="recordDate">{formatDateLabel(dateISO)}</span>
                    <span className="recordBadge">
                      <span className={`recordBadgePill ${badge.className}`}>{badge.text}</span>
                    </span>
                  </div>
                  <div className="recordMeta">
                    <div className="recordStaff">
                      <span className="recordName">{staffName}</span>
                      <span className="recordStaffId">{staffId}</span>
                    </div>
                    <span className="recordChevron material-symbols-outlined">chevron_right</span>
                  </div>
                  <div className="recordBody">
                    <div className="recordTime">
                      {timeLine}
                      {status === "working" && <span className="recordPing" aria-hidden="true" />}
                    </div>
                    <div className="recordDesc">{descLine}</div>
                  </div>
                </button>
              );
            })}
          </section>
        </main>
      </div>

      {customOpen && (
        <div className="recordsModalOverlay" role="presentation">
          <div className="recordsModal" role="dialog" aria-modal="true" aria-label="기간 직접 선택">
            <div className="recordsModalHeader">
              <span className="recordsModalTitle">기간 직접선택</span>
              <button type="button" className="recordsModalClose" onClick={() => setCustomOpen(false)}>
                닫기
              </button>
            </div>
            <div className="recordsModalBody">
              <label className="recordsModalField">
                <span>시작일</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </label>
              <label className="recordsModalField">
                <span>종료일</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </label>
            </div>
            <div className="recordsModalActions">
              <button type="button" className="recordsModalBtn" onClick={() => setCustomOpen(false)}>
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
