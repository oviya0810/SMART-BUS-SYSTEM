import { useState } from 'react';
import { AlertTriangle, Siren } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import { errorMessage, post } from '../../services/api';
import type { Incident } from '../../services/types';
import { Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, PageHeader, SkeletonRows } from '../../components/ui';
import { IncidentStatusBadge, IncidentTypeBadge } from '../../components/StatusBadges';
import { useToast } from '../../components/Toast';
import { cx, fmtCoord, fmtDateTime, timeAgo } from '../../components/format';

export function BusEmergencyPage() {
  const toast = useToast();
  const { data, error, reload } = useFetch<{ items: Incident[] }>('/api/bus/alerts');
  useLiveReload(['sos_created', 'sos_acknowledged', 'sos_updated'], reload, 100);
  const [type, setType] = useState<Incident['incident_type']>('breakdown');
  const [description, setDescription] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const report = async () => {
    setBusy(true);
    try {
      await post('/api/bus/incidents', { incident_type: type, description: description.trim() || undefined });
      toast({ type: 'success', title: 'Incident reported', message: 'The transport office and students on this bus have been alerted.' });
      setConfirm(false);
      setDescription('');
      reload();
    } catch (err) {
      toast({ type: 'error', title: 'Report failed', message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  return (
    <>
      <PageHeader title="SOS & incidents" subtitle="SOS button presses arrive here instantly. You can also report a breakdown or medical emergency." />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Incident history" icon={<Siren className="h-5 w-5" />} />
          {!data ? <SkeletonRows /> : data.items.length === 0 ? <EmptyState title="No incidents recorded" message="When the ESP32 SOS push button is pressed, the incident is stored and shown here." /> : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {data.items.map((i) => (
                <li key={i.id} className={cx('p-5', i.status === 'active' && 'bg-red-50/60 dark:bg-red-900/10')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><IncidentTypeBadge type={i.incident_type} label={i.type_label} /><span className="text-xs text-slate-500">via {i.source.replace('_', ' ')}</span></div>
                    <IncidentStatusBadge status={i.status} />
                  </div>
                  <dl className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2 dark:text-slate-300">
                    <div>Event ID: <span className="mono">{i.event_id}</span></div>
                    <div>Time: {fmtDateTime(i.created_at)} ({timeAgo(i.created_at)})</div>
                    <div>GPS: {i.latitude != null ? <span className="mono">{fmtCoord(i.latitude, 5)}, {fmtCoord(i.longitude, 5)}</span> : 'not available'}</div>
                    <div>Acknowledged: {i.acknowledged_at ? `${fmtDateTime(i.acknowledged_at)}${i.acknowledged_by ? ` by ${i.acknowledged_by}` : ''}` : 'not yet'}</div>
                    {i.resolved_at && <div className="sm:col-span-2">Resolved {fmtDateTime(i.resolved_at)}{i.resolution_notes ? ` — ${i.resolution_notes}` : ''}</div>}
                    {i.description && <div className="sm:col-span-2">Description: {i.description}</div>}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="h-fit">
          <CardHeader title="Report an incident" icon={<AlertTriangle className="h-5 w-5" />} subtitle="Alerts the transport office and students on this bus." />
          <div className="space-y-4 p-5">
            <Field label="Incident type" htmlFor="inc-type">
              <select id="inc-type" className="input" value={type} onChange={(e) => setType(e.target.value as Incident['incident_type'])}>
                <option value="breakdown">Breakdown</option>
                <option value="medical">Medical emergency</option>
                <option value="sos">SOS emergency</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Description" htmlFor="inc-desc">
              <textarea id="inc-desc" rows={4} maxLength={500} className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened, where, anyone hurt?" />
            </Field>
            <Button variant="danger" className="w-full" icon={<Siren className="h-4 w-4" />} onClick={() => setConfirm(true)}>Report incident</Button>
            <p className="text-xs text-slate-500">The last known GPS position of the bus (if recent) is attached automatically.</p>
          </div>
        </Card>
      </div>
      <ConfirmDialog open={confirm} title="Send emergency alert?" message="This immediately notifies the transport office and every student assigned to this bus." confirmLabel="Send alert" tone="danger" loading={busy} onConfirm={report} onClose={() => setConfirm(false)} />
    </>
  );
}
