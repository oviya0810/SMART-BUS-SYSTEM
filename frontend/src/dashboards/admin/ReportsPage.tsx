import { useState } from 'react';
import { Download, FileBarChart } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { API_BASE, errorMessage } from '../../services/api';
import type { Bus, RouteInfo } from '../../services/types';
import { Button, Card, CardHeader, EmptyState, ErrorState, Field, PageHeader, SkeletonRows } from '../../components/ui';
import { cx } from '../../components/format';

const TYPES = [
  { id: 'students', label: 'Student list', dated: false },
  { id: 'buses', label: 'Bus list', dated: false },
  { id: 'driver_duty', label: 'Driver duty (ID card)', dated: true },
  { id: 'pickups', label: 'Pickup requests', dated: true },
  { id: 'occupancy', label: 'Occupancy history', dated: true },
  { id: 'device_status', label: 'Device uptime / status', dated: true },
  { id: 'sos', label: 'SOS incidents', dated: true, incident: true },
  { id: 'alcohol', label: 'Alcohol sensor warnings', dated: true },
];

export function ReportsPage() {
  const [type, setType] = useState('pickups');
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [bus, setBus] = useState('');
  const [route, setRoute] = useState('');
  const [incidentType, setIncidentType] = useState('');
  const meta = TYPES.find((t) => t.id === type)!;

  const qs = new URLSearchParams({ type });
  if (meta.dated && from) qs.set('from', from);
  if (meta.dated && to) qs.set('to', to);
  if (bus) qs.set('bus_id', bus);
  if (route) qs.set('route_id', route);
  if (meta.incident && incidentType) qs.set('incident_type', incidentType);
  const report = useFetch<{ columns: string[]; rows: (string | number | null)[][]; count: number }>(`/api/admin/reports?${qs}`);
  const buses = useFetch<{ items: Bus[] }>('/api/admin/buses');
  const routes = useFetch<{ items: RouteInfo[] }>('/api/admin/routes');
  const csvUrl = `${API_BASE}/api/admin/reports?${qs}&format=csv`;
  const rows = report.data?.rows ?? [];

  return (
    <>
      <PageHeader title="Reports" subtitle="Filter, preview and export operational records as CSV. Passwords and tokens are never included." />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit p-2">
          {TYPES.map((t) => (
            <button key={t.id} onClick={() => setType(t.id)} className={cx('flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm', t.id === type ? 'bg-electric-50 font-semibold text-electric-700 dark:bg-navy-800 dark:text-white' : 'hover:bg-slate-50 dark:hover:bg-navy-800/60')}>
              <FileBarChart className="h-4 w-4 shrink-0" /> {t.label}
            </button>
          ))}
        </Card>
        <Card>
          <CardHeader
            title={meta.label}
            subtitle={report.data ? `${report.data.count} record(s)${report.data.count >= 5000 ? ' (first 5000)' : ''}` : 'Loading…'}
            actions={<a href={csvUrl}><Button icon={<Download className="h-4 w-4" />} disabled={!rows.length}>Download CSV</Button></a>}
          />
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4 dark:border-navy-800">
            {meta.dated && (
              <>
                <Field label="From" htmlFor="rp-from"><input id="rp-from" type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
                <Field label="To" htmlFor="rp-to"><input id="rp-to" type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
              </>
            )}
            <Field label="Bus" htmlFor="rp-bus">
              <select id="rp-bus" className="input" value={bus} onChange={(e) => setBus(e.target.value)}>
                <option value="">All buses</option>
                {(buses.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>Bus {b.bus_number}</option>)}
              </select>
            </Field>
            <Field label="Route" htmlFor="rp-route">
              <select id="rp-route" className="input" value={route} onChange={(e) => setRoute(e.target.value)}>
                <option value="">All routes</option>
                {(routes.data?.items ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            {meta.incident && (
              <Field label="Incident type" htmlFor="rp-it">
                <select id="rp-it" className="input" value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
                  <option value="">All</option><option value="sos">SOS</option><option value="breakdown">Breakdown</option><option value="medical">Medical</option><option value="other">Other</option>
                </select>
              </Field>
            )}
          </div>
          {report.error ? <ErrorState message={errorMessage(report.error)} onRetry={report.reload} /> : report.loading && !report.data ? <SkeletonRows /> : rows.length === 0 ? (
            <EmptyState title="No records for these filters" />
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-navy-800">
                <thead className="sticky top-0 bg-slate-50 dark:bg-navy-900"><tr>{report.data!.columns.map((c) => <th key={c} className="th">{c}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-navy-800">
                  {rows.slice(0, 300).map((r, i) => (
                    <tr key={i}>{r.map((v, j) => <td key={j} className="td mono text-xs">{v === null || v === '' ? '—' : String(v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 300 && <p className="px-5 py-3 text-xs text-slate-500">Preview shows 300 of {rows.length} rows — download the CSV for everything.</p>}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
