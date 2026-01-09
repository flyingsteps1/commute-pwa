import { useNavigate } from "react-router-dom";
import "./PageHeader.css";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  backAriaLabel?: string;
};

export default function PageHeader({
  title,
  subtitle,
  rightSlot,
  backAriaLabel = "back",
}: PageHeaderProps) {
  const nav = useNavigate();

  return (
    <header className="pageHeader">
      <div className="pageHeaderLeft">
        <button
          type="button"
          className="pageHeaderBtn"
          onClick={() => nav(-1)}
          aria-label={backAriaLabel}
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
      </div>
      <div className="pageHeaderCenter">
        <h1 className="pageHeaderTitle">{title}</h1>
        {subtitle && <p className="pageHeaderSubtitle">{subtitle}</p>}
      </div>
      <div className="pageHeaderRight">{rightSlot}</div>
    </header>
  );
}
