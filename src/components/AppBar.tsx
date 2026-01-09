import { useNavigate } from "react-router-dom";

type Action = {
  label?: string;
  icon?: string;
  onClick: () => void;
  ariaLabel?: string;
};

export default function AppBar({
  title,
  subtitle,
  showBack = false,
  actions = [],
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  actions?: Action[];
}) {
  const nav = useNavigate();

  return (
    <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 pt-3 pb-3">
      <div className="h-1 w-full" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              className="flex size-10 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-700 transition-colors text-primary"
              onClick={() => nav(-1)}
              aria-label="뒤로"
            >
              <span className="material-symbols-outlined text-[24px]">arrow_back_ios_new</span>
            </button>
          )}
          <div className="flex flex-col">
            <h1 className="text-lg font-bold leading-tight text-[#0c141d] dark:text-white">{title}</h1>
            {subtitle && <p className="text-xs text-slate-500 font-medium mt-0.5">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {actions.map((a, idx) => (
            <button
              key={idx}
              className="flex size-10 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-700 transition-colors text-primary"
              onClick={a.onClick}
              aria-label={a.ariaLabel || a.label || "action"}
              title={a.label}
            >
              {a.icon ? <span className="material-symbols-outlined text-[24px]">{a.icon}</span> : <span>{a.label}</span>}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
