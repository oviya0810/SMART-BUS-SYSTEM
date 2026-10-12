import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from './hooks/useAuth';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { AccountPage } from './pages/AccountPage';
import { NotFound } from './pages/NotFound';
import { Spinner } from './components/ui';
import type { Role } from './services/types';

import { AdminOverview } from './dashboards/admin/AdminOverview';
import { FleetMapPage } from './dashboards/admin/FleetMapPage';
import { StudentsPage } from './dashboards/admin/StudentsPage';
import { BusesPage } from './dashboards/admin/BusesPage';
import { RoutesPage } from './dashboards/admin/RoutesPage';
import { AdminPickupsPage } from './dashboards/admin/AdminPickupsPage';
import { EmergencyPage } from './dashboards/admin/EmergencyPage';
import { ReportsPage } from './dashboards/admin/ReportsPage';
import { AuditPage } from './dashboards/admin/AuditPage';

import { StudentOverview } from './dashboards/student/StudentOverview';
import { StudentMapPage } from './dashboards/student/StudentMapPage';
import { StudentRequestsPage } from './dashboards/student/StudentRequestsPage';
import { StudentAlertsPage } from './dashboards/student/StudentAlertsPage';
import { StudentProfilePage } from './dashboards/student/StudentProfilePage';

import { BusOverview } from './dashboards/bus/BusOverview';
import { BusMapPage } from './dashboards/bus/BusMapPage';
import { BusPickupsPage } from './dashboards/bus/BusPickupsPage';
import { BusOccupancyPage } from './dashboards/bus/BusOccupancyPage';
import { BusAlcoholPage } from './dashboards/bus/BusAlcoholPage';
import { BusEmergencyPage } from './dashboards/bus/BusEmergencyPage';
import { BusDevicePage } from './dashboards/bus/BusDevicePage';
import { BusDriverPage } from './dashboards/bus/BusDriverPage';

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen"><Spinner label="Checking session" /></div>;
  if (!user) return <Navigate to={`/login?portal=${role}&next=${encodeURIComponent(location.pathname)}`} replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />

      <Route path="/admin" element={<RequireRole role="admin"><AppLayout role="admin" /></RequireRole>}>
        <Route index element={<AdminOverview />} />
        <Route path="map" element={<FleetMapPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="buses" element={<BusesPage />} />
        <Route path="routes" element={<RoutesPage />} />
        <Route path="pickups" element={<AdminPickupsPage />} />
        <Route path="emergency" element={<EmergencyPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/student" element={<RequireRole role="student"><AppLayout role="student" /></RequireRole>}>
        <Route index element={<StudentOverview />} />
        <Route path="map" element={<StudentMapPage />} />
        <Route path="requests" element={<StudentRequestsPage />} />
        <Route path="alerts" element={<StudentAlertsPage />} />
        <Route path="profile" element={<StudentProfilePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/bus" element={<RequireRole role="bus"><AppLayout role="bus" /></RequireRole>}>
        <Route index element={<BusOverview />} />
        <Route path="map" element={<BusMapPage />} />
        <Route path="pickups" element={<BusPickupsPage />} />
        <Route path="occupancy" element={<BusOccupancyPage />} />
        <Route path="alcohol" element={<BusAlcoholPage />} />
        <Route path="emergency" element={<BusEmergencyPage />} />
        <Route path="driver" element={<BusDriverPage />} />
        <Route path="device" element={<BusDevicePage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
