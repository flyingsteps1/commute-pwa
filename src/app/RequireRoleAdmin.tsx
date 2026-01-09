import { Navigate, useLocation } from "react-router-dom";
import { getAppSession } from "../storage/appSession";
import type { ReactNode } from "react";

export default function RequireRoleAdmin({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const session = getAppSession();

  if (!session || session.role !== "admin") {
    return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  }

  return <>{children}</>;
}
