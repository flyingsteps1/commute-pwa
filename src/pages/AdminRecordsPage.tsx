import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listStaffPublic, type StaffPublic } from "../storage/staffRepo";
import { useI18n } from "../i18n/I18nProvider";
import { supabase } from "../storage/supabaseClient";
import { normalizeWorkRecord } from "../storage/todayRepo";
import { getWorkStatus } from "../domain/workStatus";
import PageHeader from "../components/PageHeader";
import "./AdminRecordsPage.css";

type TodayStatusCode = "working" | "off" | "no_record" | "incomplete" | "holiday";

type TodayStatus = {
  code: TodayStatusCode;
  detailTime?: string;
  detailKind?: "check_in" | "check_out";
};

function deriveStatus(r: any | undefined, todayISO: string): TodayStatus {
  const code = getWorkStatus(r, todayISO);
  if (code === "off") return { code, detailTime: toHHMM(r?.checkOut), detailKind: "check_out" };
  if (code === "working" || code === "incomplete") return { code, detailTime: toHHMM(r?.checkIn), detailKind: "check_in" };
  return { code };
}

function toHHMM(ts?: string | null) {
  if (!ts) return undefined;
  try {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d.toISOString().substring(11, 16);
  } catch {
    /* ignore */
  }
  return ts?.slice(11, 16);
}

export default function AdminRecordsPage() {
  const nav = useNavigate();
  const { t } = useI18n();
  const [staff, setStaff] = useState<StaffPublic[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "work" | "incomplete" | "holiday">("all");
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const staffList = await listStaffPublic();
        if (cancelled) return;
        setStaff(staffList);
        const userIds = staffList.map((s) => s.userId).filter(Boolean) as string[];
        if (userIds.length === 0) {
          setRecords([]);
        } else {
          const { data, error: recErr, status } = await supabase
            .from("work_records")
            .select("date, staff_user_id, check_in, check_out, break_minutes, note")
            .eq("date", todayKey)
            .in("staff_user_id", userIds);
          if (recErr) {
            if (import.meta.env.DEV) console.error("[AdminRecords] records error", { status, recErr });
            throw recErr;
          }
          setRecords((data ?? []).map(normalizeWorkRecord));
        }
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
  }, [todayKey]);

  const rows = staff.map((s) => {
    const rec = records.find((r) => r.staff_user_id && s.userId && r.staff_user_id === s.userId);
    const status = deriveStatus(rec, todayKey);
    return { ...s, status };
  });

  const filteredRows = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "work") return r.status.code === "off" || r.status.code === "working";
    if (filter === "incomplete") return r.status.code === "incomplete";
    if (filter === "holiday") return r.status.code === "holiday";
    return true;
  });

  const summary = useMemo(() => {
    let workCount = 0;
    let incompleteCount = 0;
    let holidayCount = 0;
    for (const r of rows) {
      if (r.status.code === "off" || r.status.code === "working") workCount++;
      else if (r.status.code === "incomplete") incompleteCount++;
      else if (r.status.code === "holiday") holidayCount++;
    }
    return { workCount, incompleteCount, holidayCount };
  }, [rows]);

  return (
    <div className="recordsRoot">
      <div className="recordsShell">
        <PageHeader
          title={t("records")}
          subtitle={t("admin_dashboard_staff_list")}
          backAriaLabel={t("back") ?? "back"}
        />

        <main className="recordsMain">
          <section aria-label="Summary Statistics">
            <div className="kpiGrid">
              <SummaryCard label={t("records_filter_work")} value={summary.workCount} />
              <SummaryCard label={t("records_filter_incomplete")} value={summary.incompleteCount} />
              <SummaryCard label={t("records_filter_holiday")} value={summary.holidayCount} />
            </div>
          </section>

          <section className="chipRow" aria-label="Filters">
            <FilterBtn label={t("records_filter_all")} active={filter === "all"} onClick={() => setFilter("all")} />
            <FilterBtn label={t("records_filter_work")} active={filter === "work"} onClick={() => setFilter("work")} />
            <FilterBtn label={t("records_filter_incomplete")} active={filter === "incomplete"} onClick={() => setFilter("incomplete")} />
            <FilterBtn label={t("records_filter_holiday")} active={filter === "holiday"} onClick={() => setFilter("holiday")} />
          </section>

          <section className="staffSection" aria-label="Staff List">
            <div className="staffHeader">
              <h2 className="staffTitle">{t("admin_dashboard_staff_list")}</h2>
            </div>
            <div className="staffCard">
              {filteredRows.length === 0 && (
                <div className="emptyState">
                  {loading ? t("login_staff_select_placeholder") : t("common_no_record")}
                </div>
              )}
              {error && <div className="errorState">{error}</div>}
              {filteredRows.map((r) => {
                const label = r.name ?? r.displayName ?? r.staffId ?? t("common_staff");
                const badge = (() => {
                  if (r.status.code === "holiday") {
                    return { text: t("common_holiday"), className: "staffBadge--off" };
                  }
                  if (r.status.code === "working") {
                    return { text: t("common_working"), className: "staffBadge--working" };
                  }
                  if (r.status.code === "incomplete") {
                    return { text: t("common_incomplete"), className: "staffBadge--incomplete" };
                  }
                  if (r.status.code === "off") {
                    return { text: t("records_filter_work"), className: "staffBadge--work" };
                  }
                  return { text: t("common_no_record"), className: "staffBadge--none" };
                })();
                const onNavigate = () => nav(`/admin/staff/${r.staffId}?userId=${r.userId ?? ""}`);
                return (
                  <div
                    key={r.staffId}
                    role="button"
                    tabIndex={0}
                    onClick={onNavigate}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onNavigate();
                      }
                    }}
                    className="staffItem"
                  >
                    <div className="staffAvatar">
                      <span>{label.charAt(0)}</span>
                    </div>
                    <div className="staffMeta">
                      <span className="staffName">{label}</span>
                      <span className="staffSub">{r.staffId}</span>
                    </div>
                    <div className="staffBadge">
                      <span className={`staffBadgePill ${badge.className}`}>{badge.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="kpiCard">
      <span className="kpiValue">{value}</span>
      <span className="kpiLabel">{label}</span>
    </div>
  );
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip ${active ? "chipActive" : ""}`}
    >
      {label}
    </button>
  );
}
