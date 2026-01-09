import { createBrowserRouter } from "react-router-dom";
import AppShell from "./AppShell";
import TodayPage from "../pages/TodayPage";
import MonthlyPage from "../pages/MonthlyPage";
import RecordsPage from "../pages/RecordsPage";
import CalendarPage from "../pages/CalendarPage";
import PrintPage from "../pages/PrintPage";
import LoginPage from "../pages/LoginPage";
import RequireAuth from "./RequireAuth";
import RequireRoleAdmin from "./RequireRoleAdmin";
import SettingsPage from "../pages/SettingsPage";
import AdminDashboardPage from "../pages/AdminDashboardPage";
import AdminRecordsPage from "../pages/AdminRecordsPage";
import AdminStaffDetailPage from "../pages/AdminStaffDetailPage";
import AdminMonthlyPage from "../pages/AdminMonthlyPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <TodayPage /> },
      { path: "monthly", element: <MonthlyPage /> },
      { path: "records", element: <RecordsPage /> },
      { path: "calendar", element: <CalendarPage /> },
      {
        path: "settings",
        element: (
          <RequireRoleAdmin>
            <SettingsPage />
          </RequireRoleAdmin>
        ),
      },
      {
        path: "admin",
        element: (
          <RequireRoleAdmin>
            <AdminDashboardPage />
          </RequireRoleAdmin>
        ),
      },
      {
        path: "admin/records",
        element: (
          <RequireRoleAdmin>
            <AdminRecordsPage />
          </RequireRoleAdmin>
        ),
      },
      {
        path: "admin/monthly",
        element: (
          <RequireRoleAdmin>
            <AdminMonthlyPage />
          </RequireRoleAdmin>
        ),
      },
      {
        path: "admin/staff/:staffId",
        element: (
          <RequireRoleAdmin>
            <AdminStaffDetailPage />
          </RequireRoleAdmin>
        ),
      },
      {
        path: "admin/settings",
        element: (
          <RequireRoleAdmin>
            <SettingsPage />
          </RequireRoleAdmin>
        ),
      },

      // PDF 출력 (새 경로 및 레거시 호환)
      { path: "print", element: <PrintPage /> },
      { path: "print/monthly", element: <PrintPage /> },
    ],
  },
]);
