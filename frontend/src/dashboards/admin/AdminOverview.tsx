import { Link } from 'react-router-dom';
import { Armchair, Bus, ListChecks, Siren, UserCheck, Users, Wifi, WifiOff, Wine } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import { errorMessage } from '../../services/api';
import type { Incident } from '../../services/types';
import { Card, CardHeader, EmptyState, ErrorState, KpiCard, PageHeader, SkeletonRows } from '../../components/ui';
import { IncidentStatusBadge, IncidentTypeBadge } from '../../components/StatusBadges';
import { timeAgo } from '../../components/format';
import { useTheme } from '../../hooks/useTheme';

interface Overview {
  kpis: {
    total_students: number;
    total_buses: number;
    online_buses: number;
    offline_buses: number;
    students_onboard: number | null;
    available_seats: number | null;
    buses_reporting_seats: number;
    active_sos: number;
    alcohol_warnings: number;
    pending_pickups: number;
  };
  charts: {
    pickups_last_7_days: { date: string; count: number }[];
    incidents_last_30_days: { type: string; count: number }[];
    bus_occupancy: { bus_number: string; occupied: number; capacity: number; state: string }[];
  };
}

const EVENTS = ['pickup_request_created', 'pickup_request_updated', 'occupancy_updated', 'sos_created', 'sos_acknowledged', 'sos_updated', 'alcohol_updated', 'device_status_updated'];

export function AdminOverview() {
  const ov = useFetch<Overview>('/api/admin/overview', 60000);
  const inc = useFetch<{ items: Incident[] }>('/api/admin/incidents?status=open');
  useLiveReload(EVENTS, () => {
    ov.reload();
    inc.reload();
  });
  const { theme } = useTheme();
  const axis = theme === 'dark' ? '#94a3b8' : '#64748b';
  const grid = theme === 'dark' ? '#1c2e63' : '#e2e8f0';
  const k = ov.data?.kpis;
  const loading = !ov.data && ov.loading;

  if (ov.error && !ov.data) return <Card><ErrorState message={errorMessage(ov.error)} onRetry={ov.reload} /></Card>;

  const days = (ov.data?.charts.pickups_last_7_days ?? []).map((d) => ({
    ...d,
    label: new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
  }));
  const occ = (ov.data?.charts.bus_occupancy ?? []).map((b) => ({ ...b, available: Math.max(0, b.capacity - b.occupied) }));

  return (
    <>
      <PageHeader title="Fleet overview" subtitle="Live figures from the database and hardware telemetry. Nothing on this page is estimated." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard loading={loading} label="Total students" value={k?.total_students ?? '—'} icon={<Users className="h-5 w-5" />} />
        <KpiCard loading={loading} label="Registered buses" value={k?.total_buses ?? '—'} icon={<Bus className="h-5 w-5" />} tone="violet" />
        <KpiCard loading={loading} label="Online buses" value={k?.online_buses ?? '—'} icon={<Wifi className="h-5 w-5" />} tone="green" hint="ESP32 heartbeat received recently" />
        <KpiCard loading={loading} label="Offline buses" value={k?.offline_buses ?? '—'} icon={<WifiOff className="h-5 w-5" />} tone={k?.offline_buses ? 'amber' : 'neutral'} />
        <KpiCard loading={loading} label="Students onboard" value={k?.students_onboard ?? '—'} icon={<UserCheck className="h-5 w-5" />} tone="cyan" hint={k ? (k.buses_reporting_seats ? 'Counted by bus occupancy sensors' : 'Waiting for hardware data') : undefined} />
        <KpiCard
          loading={loading}
          label="Available seats"
          value={k?.available_seats ?? '—'}
          icon={<Armchair className="h-5 w-5" />}
          tone="blue"
          hint={k ? (k.buses_reporting_seats ? `${k.buses_reporting_seats} bus(es) reporting live` : 'Waiting for hardware data') : undefined}
        />
        <KpiCard loading={loading} label="Active SOS alerts" value={k?.active_sos ?? '—'} icon={<Siren className="h-5 w-5" />} tone={k?.active_sos ? 'red' : 'neutral'} />
        <KpiCard loading={loading} label="Alcohol sensor warnings" value={k?.alcohol_warnings ?? '—'} icon={<Wine className="h-5 w-5" />} tone={k?.alcohol_warnings ? 'red' : 'neutral'} />
        <KpiCard loading={loading} label="Pending pickups" value={k?.pending_pickups ?? '—'} icon={<ListChecks className="h-5 w-5" />} tone={k?.pending_pickups ? 'amber' : 'neutral'} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Pickup requests — last 7 days" subtitle="Count of requests created per day" />
          <div className="h-72 p-4">
            {loading ? <SkeletonRows rows={4} /> : days.every((d) => d.count === 0) ? (
              <EmptyState title="No pickup requests in the last 7 days" message="Requests made by students will appear here." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={days} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(47,99,255,.06)' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                  <Bar isAnimationActive={false} dataKey="count" name="Requests" fill="#2f63ff" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Open incidents" subtitle="Active and acknowledged" actions={<Link to="/admin/emergency" className="text-xs font-semibold text-electric-600 hover:underline">Emergency center</Link>} />
          {!inc.data ? <SkeletonRows rows={3} /> : inc.data.items.length === 0 ? (
            <EmptyState title="No open incidents" message="SOS, breakdown and medical alerts will appear here instantly." icon={<Siren className="h-6 w-6" />} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {inc.data.items.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <IncidentTypeBadge type={i.incident_type} label={i.type_label} />
                      <span className="text-sm font-semibold">Bus {i.bus_number}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{timeAgo(i.created_at)} · {i.source.replace('_', ' ')}</p>
                  </div>
                  <IncidentStatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="Seat occupancy by bus" subtitle="Latest hardware-reported reading per bus (buses without sensor data are not shown)" />
          <div className="h-72 p-4">
            {loading ? <SkeletonRows rows={4} /> : occ.length === 0 ? (
              <EmptyState title="Waiting for hardware data" message="Occupancy appears once an ESP32 reports seat counts." icon={<Armchair className="h-6 w-6" />} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={occ} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis dataKey="bus_number" tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar isAnimationActive={false} dataKey="occupied" name="Occupied" stackId="a" fill={theme === "dark" ? "#5a88ff" : "#1c2e63"} maxBarSize={48} />
                  <Bar isAnimationActive={false} dataKey="available" name="Available" stackId="a" fill="#22d3ee" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
