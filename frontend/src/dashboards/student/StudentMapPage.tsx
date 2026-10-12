import { useEffect, useMemo, useState } from 'react';
import { Circle, Marker, Popup } from 'react-leaflet';
import { CheckCircle2, LocateFixed, MapPin, Navigation, Send, Share2, XCircle } from 'lucide-react';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useRealtime } from '../../hooks/useRealtime';
import { errorMessage, post } from '../../services/api';
import type { Pickup } from '../../services/types';
import { BaseMap, FitBounds, MapButton, MapLegend, MapToolbar, Point, RouteLayer, validPoint } from '../../maps/BaseMap';
import { busIcon, studentIcon } from '../../maps/icons';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Field, Notice, PageHeader } from '../../components/ui';
import { GpsBadge, PickupBadge } from '../../components/StatusBadges';
import { useToast } from '../../components/Toast';
import { cx, fmtCoord, fmtDateTime, timeAgo } from '../../components/format';
import { useBusStatus, useMyPickups, useProfile } from './useStudentData';

const STEPS: { key: Pickup['status']; label: string }[] = [
  { key: 'pending', label: 'Sent' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'approaching', label: 'Approaching' },
  { key: 'picked_up', label: 'Picked up' },
];

export function StudentMapPage() {
  const toast = useToast();
  const { state: conn } = useRealtime();
  const status = useBusStatus();
  const profile = useProfile();
  const pickups = useMyPickups();
  const geo = useGeolocation();
  const [source, setSource] = useState<'gps' | 'stop'>('gps');
  const [stopId, setStopId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fit, setFit] = useState(0);
  const [cancelId, setCancelId] = useState<number | null>(null);

  const route = status.data?.route ?? profile.data?.route ?? null;
  const stops = route?.stops ?? [];
  useEffect(() => {
    if (!stopId && profile.data?.student.boarding_stop) setStopId(String(profile.data.student.boarding_stop.id));
  }, [profile.data, stopId]);

  const myPos = geo.state.status === 'ok' ? ([geo.state.latitude, geo.state.longitude] as Point) : null;
  const loc = status.data?.location;
  const busPos = loc?.available && validPoint(loc.latitude, loc.longitude) ? ([loc.latitude!, loc.longitude!] as Point) : null;
  const active = (pickups.data?.items ?? []).find((p) => ['pending', 'accepted', 'approaching'].includes(p.status));
  const points = useMemo(() => {
    const pts: Point[] = [];
    if (myPos) pts.push(myPos);
    if (busPos) pts.push(busPos);
    if (!pts.length) stops.filter((s) => validPoint(s.latitude, s.longitude)).forEach((s) => pts.push([s.latitude!, s.longitude!]));
    return pts;
  }, [myPos?.[0], myPos?.[1], busPos?.[0], busPos?.[1], stops.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (myPos) setFit((f) => f + 1);
  }, [myPos?.[0], myPos?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedStop = stops.find((s) => String(s.id) === stopId);
  const canSubmit = !active && status.data?.assigned && (source === 'gps' ? !!myPos : !!selectedStop);

  const submit = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { note: note.trim() || undefined };
      if (selectedStop) body.boarding_stop_id = selectedStop.id;
      if (source === 'gps' && geo.state.status === 'ok') {
        body.latitude = geo.state.latitude;
        body.longitude = geo.state.longitude;
        body.accuracy_m = Math.round(geo.state.accuracy);
      }
      const res = await post<{ pickup_request: Pickup; message: string }>('/api/student/pickup-requests', body);
      toast({ type: 'success', title: 'Pickup request saved', message: res.message });
      setNote('');
      pickups.reload();
    } catch (err) {
      toast({ type: 'error', title: 'Request not sent', message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const shareLocation = async () => {
    if (geo.state.status !== 'ok') return;
    try {
      await post('/api/student/location', { latitude: geo.state.latitude, longitude: geo.state.longitude, accuracy_m: Math.round(geo.state.accuracy) });
      toast({ type: 'success', title: 'Location shared with the transport office' });
    } catch (err) {
      toast({ type: 'error', title: 'Could not share location', message: errorMessage(err) });
    }
  };

  const cancel = async () => {
    if (!cancelId) return;
    setBusy(true);
    try {
      await post(`/api/student/pickup-requests/${cancelId}/cancel`, { reason: 'Cancelled by student' });
      toast({ type: 'info', title: 'Pickup request cancelled' });
      setCancelId(null);
      pickups.reload();
    } catch (err) {
      toast({ type: 'error', title: 'Could not cancel', message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const busMessage = !status.data ? null : !status.data.assigned ? 'You are not assigned to a bus yet.' : !loc?.available ? 'Bus location is not available yet — the bus tracker has not reported a GPS fix.' : loc.state === 'stale' ? `Bus GPS is stale — last update ${timeAgo(loc.received_at)}.` : null;
  const stepIndex = active ? STEPS.findIndex((s) => s.key === active.status) : -1;

  return (
    <>
      <PageHeader title="Live map & pickup" subtitle="See your bus in real time and request a pickup from your location or a stop." />
      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="space-y-3">
          {conn === 'offline' && <Notice tone="red">You are offline. The map shows the last loaded positions.</Notice>}
          {busMessage && <Notice tone="amber">{busMessage}</Notice>}
          {geo.state.status === 'error' && <Notice tone="amber" title="Location unavailable">{geo.state.message}</Notice>}
          <BaseMap
            className="h-[58vh] min-h-[380px]"
            overlay={
              <>
                <MapToolbar>
                  <MapButton label={geo.state.status === 'locating' ? 'Locating…' : 'My location'} onClick={geo.request} icon={<LocateFixed className="h-3.5 w-3.5" />} />
                  <MapButton label="Fit markers" onClick={() => setFit((f) => f + 1)} />
                </MapToolbar>
                <MapLegend items={[{ color: '#06b6d4', label: 'You (phone GPS)' }, { color: '#1f4ff2', label: 'Your bus', shape: 'square' }, { color: '#0b1736', label: 'Bus stop' }, { color: '#2f63ff', label: 'Route', shape: 'line' }]} />
              </>
            }
          >
            <FitBounds points={points} trigger={fit} />
            <RouteLayer route={route} highlightStopIds={selectedStop ? [selectedStop.id] : []} />
            {busPos && (
              <Marker position={busPos} icon={busIcon(status.data!.bus!.bus_number, { state: loc!.state === 'live' ? 'live' : 'stale', sos: (status.data!.active_incidents ?? 0) > 0 })}>
                <Popup>
                  <strong>Bus {status.data!.bus!.bus_number}</strong>
                  <br />GPS: {fmtDateTime(loc!.received_at)} ({timeAgo(loc!.received_at)})
                  {loc!.speed_kmh != null && <><br />Speed: {loc!.speed_kmh.toFixed(0)} km/h</>}
                </Popup>
              </Marker>
            )}
            {myPos && geo.state.status === 'ok' && (
              <>
                <Circle center={myPos} radius={Math.min(geo.state.accuracy, 500)} pathOptions={{ color: '#06b6d4', weight: 1, fillOpacity: 0.08 }} />
                <Marker position={myPos} icon={studentIcon}>
                  <Popup>
                    <strong>Your location</strong>
                    <br />{fmtCoord(myPos[0])}, {fmtCoord(myPos[1])}
                    <br />Accuracy ±{Math.round(geo.state.accuracy)} m
                  </Popup>
                </Marker>
              </>
            )}
          </BaseMap>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <GpsBadge loc={loc} />
            {loc?.available && <span>Bus GPS timestamp: {fmtDateTime(loc.device_timestamp)}</span>}
            {geo.state.status === 'ok' && <span>· Your fix: {new Date(geo.state.timestamp).toLocaleTimeString()}</span>}
          </div>
        </div>

        <div className="space-y-4">
          {active ? (
            <Card>
              <CardHeader title={`Pickup request #${active.id}`} subtitle={`${active.boarding_stop_name} · ${timeAgo(active.created_at)}`} actions={<PickupBadge status={active.status} />} />
              <div className="p-5">
                <ol className="flex items-center gap-1" aria-label="Request progress">
                  {STEPS.map((s, i) => (
                    <li key={s.key} className="flex flex-1 flex-col items-center gap-1 text-center">
                      <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold', i <= stepIndex ? 'bg-electric-600 text-white' : 'bg-slate-100 text-slate-400 dark:bg-navy-800')}>
                        {i < stepIndex ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                      </span>
                      <span className={cx('text-[11px] font-medium', i <= stepIndex ? 'text-slate-900 dark:text-white' : 'text-slate-400')}>{s.label}</span>
                    </li>
                  ))}
                </ol>
                <dl className="mt-4 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  <div>Location sent: <span className="mono">{active.latitude != null ? `${fmtCoord(active.latitude)}, ${fmtCoord(active.longitude)}` : 'stop only'}</span> ({active.location_source === 'phone_gps' ? 'phone GPS' : 'stop'})</div>
                  <div>Created: {fmtDateTime(active.created_at)}</div>
                </dl>
                <Button variant="secondary" size="sm" className="mt-4" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setCancelId(active.id)}>Cancel request</Button>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Request a pickup" icon={<Navigation className="h-5 w-5" />} subtitle="Your request goes to your bus console, the admin dashboard and the bus hardware." />
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-navy-950" role="radiogroup" aria-label="Location source">
                  {(['gps', 'stop'] as const).map((k) => (
                    <button key={k} role="radio" aria-checked={source === k} onClick={() => setSource(k)} className={cx('rounded-lg py-2 text-sm font-medium', source === k ? 'bg-white shadow-sm dark:bg-navy-700' : 'text-slate-500')}>
                      {k === 'gps' ? 'Use my GPS' : 'Choose a stop'}
                    </button>
                  ))}
                </div>
                {source === 'gps' && (
                  <div className="rounded-xl border border-slate-200 p-3 dark:border-navy-700">
                    {geo.state.status === 'ok' ? (
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-slate-500">Your current location</p>
                          <p className="mono text-sm font-semibold">{fmtCoord(geo.state.latitude)}, {fmtCoord(geo.state.longitude)}</p>
                          <p className="text-xs text-slate-500">Accuracy ±{Math.round(geo.state.accuracy)} m {geo.state.accuracy > 100 && <Badge tone="amber">low accuracy</Badge>}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={geo.request} icon={<LocateFixed className="h-3.5 w-3.5" />}>Refresh</Button>
                      </div>
                    ) : (
                      <Button variant="secondary" className="w-full" loading={geo.state.status === 'locating'} onClick={geo.request} icon={<LocateFixed className="h-4 w-4" />}>
                        Get my location
                      </Button>
                    )}
                  </div>
                )}
                <Field label={source === 'gps' ? 'Boarding stop (optional)' : 'Boarding stop'} htmlFor="pk-stop" hint={!stops.length ? 'No stops configured for your route.' : undefined}>
                  <select id="pk-stop" className="input" value={stopId} onChange={(e) => setStopId(e.target.value)} disabled={!stops.length}>
                    <option value="">{source === 'gps' ? 'My current location' : 'Select a stop'}</option>
                    {stops.map((s) => <option key={s.id} value={s.id}>{s.sequence}. {s.name}</option>)}
                  </select>
                </Field>
                {source === 'stop' && selectedStop && (
                  <p className="mono text-xs text-slate-500">{validPoint(selectedStop.latitude, selectedStop.longitude) ? `${fmtCoord(selectedStop.latitude)}, ${fmtCoord(selectedStop.longitude)}` : 'This stop has no coordinates configured.'}</p>
                )}
                <Field label="Note for the driver (optional)" htmlFor="pk-note">
                  <input id="pk-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Near the main gate" />
                </Field>
                <Button className="w-full" loading={busy} disabled={!canSubmit} onClick={submit} icon={<Send className="h-4 w-4" />}>Submit pickup request</Button>
                {source === 'gps' && geo.state.status === 'ok' && (
                  <button className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-electric-600 hover:underline" onClick={shareLocation}>
                    <Share2 className="h-3.5 w-3.5" /> Only share my location with the transport office
                  </button>
                )}
              </div>
            </Card>
          )}
          <Card className="p-4 text-xs text-slate-500">
            <p className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200"><MapPin className="h-3.5 w-3.5" /> Privacy</p>
            <p className="mt-1">Your location is read from your phone only when you tap “Get my location”, and is shared only with your assigned bus and the transport office.</p>
          </Card>
        </div>
      </div>
      <ConfirmDialog open={!!cancelId} title="Cancel pickup request?" message="The bus will be notified that you no longer need a pickup." confirmLabel="Cancel request" tone="danger" loading={busy} onConfirm={cancel} onClose={() => setCancelId(null)} />
    </>
  );
}
