import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { AddPage } from "@/pages/add-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { ListPage } from "@/pages/list-page";
import { SettingsPage } from "@/pages/settings-page";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate replace to="/dashboard" />} />
          <Route path="/add" element={<AddPage />} />
          <Route path="/list" element={<ListPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
