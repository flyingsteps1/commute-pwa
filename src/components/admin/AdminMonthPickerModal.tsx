import { useEffect, useMemo, useState } from "react";
import "./AdminMonthPickerModal.css";

type Props = {
  open: boolean;
  yyyyMm: string;
  onClose: () => void;
  onSelect: (yyyyMm: string) => void;
};

function parseYearMonth(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return { year: y, month: m };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export default function AdminMonthPickerModal({ open, yyyyMm, onClose, onSelect }: Props) {
  const { year, month } = useMemo(() => parseYearMonth(yyyyMm), [yyyyMm]);
  const [viewYear, setViewYear] = useState(year);

  useEffect(() => {
    if (open) setViewYear(year);
  }, [open, year]);

  if (!open) return null;

  return (
    <div className="monthPickerOverlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="monthPickerCard" onClick={(e) => e.stopPropagation()}>
        <div className="monthPickerHeader">
          <div className="yearControls">
            <button
              type="button"
              className="yearButton"
              onClick={() => setViewYear((prev) => prev - 1)}
              aria-label="prev year"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <span className="yearLabel">{viewYear}</span>
            <button
              type="button"
              className="yearButton"
              onClick={() => setViewYear((prev) => prev + 1)}
              aria-label="next year"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
          <button type="button" className="monthPickerClose" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="monthGrid">
          {Array.from({ length: 12 }).map((_, idx) => {
            const mm = idx + 1;
            const isSelected = viewYear === year && mm === month;
            const label = pad2(mm);
            return (
              <button
                key={label}
                type="button"
                className={`monthButton ${isSelected ? "selected" : ""}`}
                onClick={() => {
                  onSelect(`${viewYear}-${label}`);
                  onClose();
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
