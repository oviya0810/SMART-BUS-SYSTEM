import { useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { CheckCircle2, Hand, Siren } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import { errorMessage, post } from '../../services/api';
import type { Incident } from '../../services/types';
import { BaseMap, FitBounds, MapButton, MapToolbar, Point, validPoint } from '../../maps/BaseMap';
import { incidentIcon } from '../../maps/icons';
import { Button, Card, CardHeader, EmptyState, ErrorState, Field, Modal, PageHeader, SkeletonRows } from '../../components/ui';
import { IncidentStatusBadge, IncidentTypeBadge } from '../../components/StatusBadges';
import { useToast } from '../../components/Toast';
import { cx, fmtCoord, fmtDateTime, timeAgo } from '../../components/format';

const EVENTS = ['sos_created', 'sos_acknowledged', 'sos_updated'];

export function EmergencyPage() {
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const [type, setType] = useState('');
  const qs = new URLSearchParams({ status });
  if (type) qs.set('type', type);
  const { data, error, loading, reload } = useFetch<{ items: Incident[] }>(`/api/admin/incidents?${qs}`);
  useLiveReload(EVENTS, reload, 150);
  const [dialog, setDialog] = useState<null | { mode: 'ack' | 'resolve'; incident: Incident }>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [fit, setFit] = useState(0);

  const items = data?.items ?? [];
  const located = items.filter((i) => validPoint(i.latitude, i.longitude));
  const points: Point[] = located.map((i) => [i.latitude!, i.longitude!]);

  const submit = async () => {
    if (!dialog) return;
    setBusy(true);
    try {
      if (dialog.mode === 'ack') await post(`/api/admin/incidents/${dialog.incident.id}/acknowledge`, { note: notes || undefined });
      else await post(`/api/admin/incidents/${dialog.incident.id}/resolve`, { resolution_notes: notes });
      toast({ type: 'success', title: dialog.mode === 'ack' ? 'Incident acknowledged' : 'Incident resolved' });
      setDialog(null);
      setNotes('');
      reload();
    } catch (err) {
      toast({ type: 'error', title: 'Action failed', message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  const activeCount = items.filter((i) => i.status === 'active').length;

  return (
    <>
      <PageHeader title="Emergency center" subtitle="SOS button presses, breakdowns, medical emergencies and other incidents — with full audit history." />
      {activeCount > 0 && status !== 'resolved' && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-red-600 px-5 py-4 text-white shadow-lg shadow-red-600/20" role="alert">
          <Siren className="h-6 w-6 animate-pulse" />
          <p className="font-semibold">{activeCount} active incident{activeCount > 1 ? 's' : ''} awaiting acknowledgement</p>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader
            title="Incidents"
            actions={
              <>
                <select className="input w-auto py-1.5" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                  <option value="open">Open</option>
                  <option value="active">Active</option>
                  <option value="acknowledged">Acknowledged</option>
                  <option value="resolved">Resolved</option>
                  <option value="all">All</option>
                </select>
                <select className="input w-auto py-1.5" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
                  <option value="">All types</option>
                  <option value="sos">SOS</option>
                  <option value="breakdown">Breakdown</option>
                  <option value="medical">Medical</option>
                  <option value="other">Other</option>
                </select>
              </>
            }
          />
          {loading && !data ? <SkeletonRows /> : items.length === 0 ? (
            <EmptyState title="No incidents" message="Incidents reported by ESP32 SOS buttons or bus consoles appear here instantly." icon={<Siren className="h-6 w-6" />} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {items.map((i) => (
                <li key={i.id} className={cx('p-5', i.status === 'active' && 'bg-red-50/60 dark:bg-red-900/10')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <IncidentTypeBadge type={i.incident_type} label={i.type_label} />
                        <span className="font-semibold">Bus {i.bus_number}</span>
                        <IncidentStatusBadge status={i.status} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        #{i.id} · event <span className="mono">{i.event_id}</span> · via {i.source.replace('_', ' ')} · {fmtDateTime(i.created_at)} ({timeAgo(i.created_at)})
                      </p>
                      <p className="mono mt-1 text-xs text-slate-600 dark:text-slate-300">
                        {validPoint(i.latitude, i.longitude) ? `${fmtCoord(i.latitude)}, ${fmtCoord(i.longitude)} (${i.location_source === 'last_known_gps' ? 'last known bus GPS' : 'reported'})` : 'Location not available'}
                      </p>
                      {i.description && <p className="mt-2 text-sm">{i.description}</p>}
                      {i.acknowledged_at && <p className="mt-2 text-xs text-slate-500">Acknowledged by {i.acknowledged_by ?? '—'} at {fmtDateTime(i.acknowledged_at)}</p>}
                      {i.resolved_at && <p className="text-xs text-slate-500">Resolved by {i.resolved_by ?? '—'} at {fmtDateTime(i.resolved_at)}</p>}
                      {i.resolution_notes && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-navy-950">{i.resolution_notes}</p>}
                    </div>
                    <div className="flex gap-2">
                      {i.status === 'active' && <Button size="sm" variant="danger" icon={<Hand className="h-3.5 w-3.5" />} onClick={() => { setNotes(''); setDialog({ mode: 'ack', incident: i }); }}>Acknowledge</Button>}
                      {i.status !== 'resolved' && <Button size="sm" variant="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => { setNotes(''); setDialog({ mode: 'resolve', incident: i }); }}>Resolve</Button>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div>
          <BaseMap className="h-[480px]" overlay={<MapToolbar><MapButton label="Fit incidents" onClick={() => setFit((f) => f + 1)} /></MapToolbar>}>
            <FitBounds points={points} trigger={fit} />
            {located.map((i) => (
              <Marker key={i.id} position={[i.latitude!, i.longitude!]} icon={incidentIcon}>
                <Popup>
                  <strong>{i.type_label}</strong> — Bus {i.bus_number}
                  <br />
                  {fmtDateTime(i.created_at)} · {i.status}
                </Popup>
              </Marker>
            ))}
          </BaseMap>
          <p className="mt-2 text-xs text-slate-500">{located.length} of {items.length} incident(s) have coordinates.</p>
        </div>
      </div>

      <Modal
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog?.mode === 'ack' ? 'Acknowledge incident' : 'Resolve incident'}
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button><Button variant={dialog?.mode === 'ack' ? 'danger' : 'success'} loading={busy} disabled={dialog?.mode === 'resolve' && notes.trim().length < 3} onClick={submit}>{dialog?.mode === 'ack' ? 'Acknowledge' : 'Mark resolved'}</Button></>}
      >
        {dialog && (
          <div className="space-y-3 text-sm">
            <p>{dialog.incident.type_label} on <strong>Bus {dialog.incident.bus_number}</strong>, reported {timeAgo(dialog.incident.created_at)}.</p>
            <Field label={dialog.mode === 'ack' ? 'Note (optional)' : 'Resolution notes (required)'} htmlFor="inc-notes">
              <textarea id="inc-notes" rows={4} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={dialog.mode === 'ack' ? 'e.g. Called driver, ambulance dispatched' : 'What happened and how it was resolved'} />
            </Field>
            <p className="text-xs text-slate-500">This action is recorded in the audit log with your name and time.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
