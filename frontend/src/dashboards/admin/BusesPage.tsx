import { useState } from 'react';
import { Cpu, Download, KeyRound, MessageSquare, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import { API_BASE, del, errorMessage, post } from '../../services/api';
import type { Bus, Credentials, DriverEvent, Incident, LiveSummary, RouteInfo, Student } from '../../services/types';
import { DataTable, Column } from '../../components/DataTable';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, StatItem } from '../../components/ui';
import { ActiveBadge, AlcoholBadge, DeviceBadge, DutyBadge, GpsBadge, IncidentStatusBadge, OccupancyBadge } from '../../components/StatusBadges';
import { CredentialsDialog, SecretItem } from '../../components/CredentialsDialog';
import { useToast } from '../../components/Toast';
import { fmtDateTime, fmtTime, timeAgo } from '../../components/format';
import { BusForm, DeviceSecret } from './BusForm';

interface BusDetail {
  bus: Bus;
  route: RouteInfo | null;
  live: LiveSummary;
  occupancy_history: { occupied: number; capacity: number; received_at: string }[];
  alcohol_history: { raw_adc: number | null; threshold: number; status: string; received_at: string }[];
  sos_history: Incident[];
  students: Student[];
  driver_events: DriverEvent[];
}

export function BusesPage() {
  const toast = useToast();
  const list = useFetch<{ items: Bus[] }>('/api/admin/buses', 60000);
  const routes = useFetch<{ items: RouteInfo[] }>('/api/admin/routes');
  useLiveReload(['device_status_updated', 'occupancy_updated', 'alcohol_updated', 'sos_created', 'sos_updated', 'driver_rfid_event'], list.reload, 800);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Bus | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const detail = useFetch<BusDetail>(detailId ? `/api/admin/buses/${detailId}` : null);
  useLiveReload(['bus_location_updated', 'occupancy_updated', 'alcohol_updated', 'device_status_updated', 'driver_rfid_event'], () => detailId && detail.reload(), 800);
  const [secrets, setSecrets] = useState<{ title: string; notice: string; items: SecretItem[] } | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'remove' | 'rotate' | 'reset'>(null);
  const [lcd, setLcd] = useState({ line1: '', line2: '' });

  const showCreds = (c: Credentials, title: string) =>
    setSecrets({ title, notice: c.notice, items: [{ label: 'Username', value: c.username }, { label: c.initial_password ? 'Initial password' : 'Temporary password', value: (c.initial_password ?? c.temporary_password)! }] });
  const showDevice = (d: DeviceSecret) =>
    setSecrets({ title: 'ESP32 device credentials', notice: d.notice, items: [{ label: 'X-Device-ID', value: d.device_id }, { label: 'Device token (Bearer)', value: d.device_token }] });

  const action = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } catch (err) {
      toast({ type: 'error', title: 'Action failed', message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<Bus>[] = [
    { key: 'bus_number', header: 'Bus', render: (b) => <div><div className="font-semibold text-slate-900 dark:text-white">Bus {b.bus_number}</div><div className="text-xs text-slate-500">{b.registration_number}</div></div> },
    { key: 'route_name', header: 'Route', render: (b) => b.route_name ?? <span className="text-slate-400">—</span> },
    { key: 'driver_name', header: 'Driver', render: (b) => <div><div>{b.driver_name}</div><div className="text-xs text-slate-500">{b.driver_phone}</div><div className="mt-1"><DutyBadge duty={b.live?.driver} /></div></div> },
    { key: 'capacity', header: 'Seats', value: (b) => b.capacity, render: (b) => (b.live?.occupancy.available ? `${b.live.occupancy.occupied}/${b.capacity}` : `—/${b.capacity}`) },
    { key: 'device', header: 'ESP32', value: (b) => b.device_id ?? '', render: (b) => <div className="flex flex-col items-start gap-1"><DeviceBadge device={b.live?.device} />{b.device_id && <span className="mono text-[11px] text-slate-500">{b.device_id}</span>}</div> },
    { key: 'gps', header: 'GPS', sortable: false, render: (b) => <GpsBadge loc={b.live?.location} /> },
    { key: 'alcohol', header: 'Alcohol', sortable: false, render: (b) => <AlcoholBadge alc={b.live?.alcohol} /> },
    { key: 'is_active', header: 'Status', value: (b) => (b.is_active ? 1 : 0), render: (b) => <div className="flex gap-1"><ActiveBadge active={b.is_active} />{(b.live?.active_incidents ?? 0) > 0 && <Badge tone="red">SOS</Badge>}</div> },
  ];

  if (list.error && !list.data) return <Card><ErrorState message={errorMessage(list.error)} onRetry={list.reload} /></Card>;
  const d = detail.data;
  const tickTime = (v: string) => fmtTime(v);

  return (
    <>
      <PageHeader
        title="Buses & devices"
        subtitle="Bus accounts, routes, capacity, ESP32 association and live hardware status."
        actions={
          <>
            <a href={`${API_BASE}/api/admin/reports?type=buses&format=csv`}><Button variant="secondary" icon={<Download className="h-4 w-4" />}>Export CSV</Button></a>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Add bus</Button>
          </>
        }
      />
      <Card>
        <DataTable rows={list.data?.items ?? []} columns={columns} loading={list.loading} searchPlaceholder="Search bus, route, driver…" emptyTitle="No buses registered" emptyMessage="Use “Add bus” to register the first bus." onRowClick={(b) => setDetailId(b.id)} initialSort={{ key: 'bus_number', dir: 'asc' }} />
      </Card>

      {formOpen && (
        <BusForm
          open
          bus={editing}
          routes={routes.data?.items ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={(b, c, dev) => {
            setFormOpen(false);
            list.reload();
            if (detailId) detail.reload();
            toast({ type: 'success', title: editing ? 'Bus updated' : 'Bus account created', message: `Bus ${b.bus_number}` });
            if (c) {
              const items: SecretItem[] = [{ label: 'Username', value: c.username }, { label: 'Initial password', value: c.initial_password! }];
              if (dev) items.push({ label: 'X-Device-ID', value: dev.device_id }, { label: 'Device token (Bearer)', value: dev.device_token });
              setSecrets({ title: 'Bus account credentials', notice: `${c.notice}${dev ? ' Copy the device token into the ESP32 firmware now.' : ''}`, items });
            }
          }}
        />
      )}

      <Modal open={!!detailId} onClose={() => { setDetailId(null); setDeviceId(''); }} title={d ? `Bus ${d.bus.bus_number}` : 'Bus'} size="xl"
        footer={d && (
          <>
            <Button variant="secondary" icon={<KeyRound className="h-4 w-4" />} onClick={() => setConfirm('reset')}>Reset password</Button>
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditing(d.bus); setFormOpen(true); }}>Edit bus</Button>
          </>
        )}
      >
        {!d ? <p className="py-8 text-center text-sm text-slate-500">Loading…</p> : (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatItem label="Registration" value={d.bus.registration_number} />
              <StatItem label="Route" value={d.route?.name ?? '—'} sub={d.route ? `${d.route.stops.length} stops` : undefined} />
              <StatItem label="Driver" value={d.bus.driver_name} sub={d.bus.driver_phone} />
              <StatItem label="Account" value={`@${d.bus.username}`} />
              <StatItem label="Location" value={d.live.location.available ? `${d.live.location.latitude?.toFixed(5)}, ${d.live.location.longitude?.toFixed(5)}` : 'No GPS data'} sub={d.live.location.available ? `${timeAgo(d.live.location.received_at)} · ${d.live.location.state}` : undefined} />
              <StatItem label="Occupancy" value={d.live.occupancy.available ? `${d.live.occupancy.occupied} / ${d.bus.capacity}` : 'Waiting for hardware data'} sub={d.live.occupancy.received_at ? timeAgo(d.live.occupancy.received_at) : undefined} />
              <StatItem label="Alcohol sensor" value={<AlcoholBadge alc={d.live.alcohol} />} sub={d.live.alcohol.raw_adc != null ? `raw ${d.live.alcohol.raw_adc} / threshold ${d.bus.alcohol_threshold}` : `threshold ${d.bus.alcohol_threshold}`} />
              <StatItem label="Assigned students" value={d.students.length} />
              <StatItem label="Driver ID card" value={d.bus.driver_rfid_uid ?? 'Not registered'} />
              <StatItem label="Driver duty" value={<DutyBadge duty={d.live.driver} />} sub={d.live.driver.since ? `since ${fmtDateTime(d.live.driver.since)}` : undefined} />
            </dl>

            <section className="rounded-2xl border border-slate-200 p-4 dark:border-navy-800">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Cpu className="h-4 w-4" /> ESP32 device</h3>
                <DeviceBadge device={d.live.device} />
              </div>
              {d.live.device.assigned ? (
                <div className="space-y-3">
                  <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <StatItem label="Device ID" value={d.live.device.device_id} />
                    <StatItem label="Last heartbeat" value={d.live.device.last_seen_at ? timeAgo(d.live.device.last_seen_at) : 'Never'} sub={fmtDateTime(d.live.device.last_seen_at)} />
                    <StatItem label="Firmware" value={d.live.device.firmware_version ?? '—'} />
                    <StatItem label="Last IP" value={d.live.device.last_ip ?? '—'} />
                  </dl>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(d.live.device.components ?? {}).map(([k, v]) => (
                      <Badge key={k} tone={v === 'ok' || v === 'fix' ? 'green' : v === 'unknown' ? 'neutral' : 'amber'}>{k.replace('_', ' ')}: {v}</Badge>
                    ))}
                  </div>
                  {d.live.device.last_error && <p className="text-xs text-red-600">Last error ({timeAgo(d.live.device.last_error_at)}): {d.live.device.last_error}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setConfirm('rotate')}>Rotate token</Button>
                    <Button variant="secondary" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirm('remove')}>Remove device</Button>
                  </div>
                  <form
                    className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 dark:border-navy-800"
                    onSubmit={(e) => {
                      e.preventDefault();
                      action('lcd', async () => {
                        await post(`/api/admin/buses/${d.bus.id}/lcd-message`, lcd);
                        toast({ type: 'success', title: 'LCD message queued', message: 'Delivered when the ESP32 next polls for commands.' });
                        setLcd({ line1: '', line2: '' });
                      });
                    }}
                  >
                    <Field label="LCD line 1" htmlFor="lcd1"><input id="lcd1" maxLength={16} className="input mono w-44" value={lcd.line1} onChange={(e) => setLcd({ ...lcd, line1: e.target.value })} /></Field>
                    <Field label="LCD line 2" htmlFor="lcd2"><input id="lcd2" maxLength={16} className="input mono w-44" value={lcd.line2} onChange={(e) => setLcd({ ...lcd, line2: e.target.value })} /></Field>
                    <Button type="submit" size="sm" loading={busy === 'lcd'} disabled={!lcd.line1} icon={<MessageSquare className="h-3.5 w-3.5" />}>Send to LCD</Button>
                  </form>
                </div>
              ) : (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    action('provision', async () => {
                      const res = await post<{ device: DeviceSecret }>(`/api/admin/buses/${d.bus.id}/device`, { device_id: deviceId });
                      setDeviceId('');
                      detail.reload();
                      list.reload();
                      showDevice(res.device);
                    });
                  }}
                >
                  <Field label="Associate ESP32 device ID" htmlFor="devid" hint="Generates a unique device token, shown once.">
                    <input id="devid" className="input mono w-64" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="ESP32-BUS07" />
                  </Field>
                  <Button type="submit" loading={busy === 'provision'} disabled={!deviceId.trim()}>Associate device</Button>
                </form>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 p-4 dark:border-navy-800">
                <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">Occupancy history <OccupancyBadge occ={d.live.occupancy} /></h3>
                {d.occupancy_history.length === 0 ? <EmptyState title="Waiting for hardware data" /> : (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={d.occupancy_history} margin={{ left: -20, right: 8, top: 8 }}>
                        <CartesianGrid stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="received_at" tickFormatter={tickTime} tick={{ fontSize: 11 }} minTickGap={30} />
                        <YAxis domain={[0, d.bus.capacity]} allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip labelFormatter={(v) => fmtDateTime(String(v))} />
                        <ReferenceLine y={d.bus.capacity} stroke="#94a3b8" strokeDasharray="4 4" />
                        <Line isAnimationActive={false} type="stepAfter" dataKey="occupied" name="Occupied" stroke="#1f4ff2" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
              <section className="rounded-2xl border border-slate-200 p-4 dark:border-navy-800">
                <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">Alcohol sensor readings (raw ADC) <AlcoholBadge alc={d.live.alcohol} /></h3>
                {d.alcohol_history.length === 0 ? <EmptyState title="Waiting for hardware data" /> : (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={d.alcohol_history} margin={{ left: -12, right: 8, top: 8 }}>
                        <CartesianGrid stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="received_at" tickFormatter={tickTime} tick={{ fontSize: 11 }} minTickGap={30} />
                        <YAxis domain={[0, 4095]} tick={{ fontSize: 11 }} />
                        <Tooltip labelFormatter={(v) => fmtDateTime(String(v))} />
                        <ReferenceLine y={d.bus.alcohol_threshold} stroke="#dc2626" strokeDasharray="4 4" label={{ value: 'threshold', fontSize: 10, fill: '#dc2626' }} />
                        <Line isAnimationActive={false} type="monotone" dataKey="raw_adc" name="Raw ADC" stroke="#7c3aed" strokeWidth={2} dot={false} connectNulls={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="mt-2 text-[11px] text-slate-500">{d.live.alcohol.disclaimer}</p>
              </section>
            </div>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Driver ID-card taps</h3>
              {d.driver_events.length === 0 ? <p className="text-sm text-slate-500">No driver card taps reported by the bus RFID reader.</p> : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-navy-800 dark:border-navy-800">
                  {d.driver_events.slice(0, 15).map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>{e.authorized ? `${e.action === 'duty_start' ? 'Duty started' : 'Duty ended'} · ${e.driver_name ?? ''}` : <>Rejected card <span className="mono text-xs">{e.card_uid}</span></>}</span>
                      <span className="flex items-center gap-2 text-xs text-slate-500">{fmtDateTime(e.device_timestamp)} <Badge tone={e.authorized ? 'green' : 'red'}>{e.result_label}</Badge></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">SOS / incident history</h3>
              {d.sos_history.length === 0 ? <p className="text-sm text-slate-500">No incidents recorded for this bus.</p> : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-navy-800 dark:border-navy-800">
                  {d.sos_history.slice(0, 15).map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>{i.type_label} · <span className="mono text-xs">{i.event_id}</span></span>
                      <span className="flex items-center gap-2 text-xs text-slate-500">{fmtDateTime(i.created_at)} <IncidentStatusBadge status={i.status} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Assigned students ({d.students.length})</h3>
              <div className="flex flex-wrap gap-1.5">
                {d.students.length === 0 && <p className="text-sm text-slate-500">No students assigned.</p>}
                {d.students.map((s) => <Badge key={s.id}>{s.full_name} · {s.register_number}</Badge>)}
              </div>
            </section>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirm === 'remove'}
        title="Remove ESP32 device?"
        message="The device token stops working immediately and the device is detached from this bus. Historical readings are kept."
        tone="danger"
        confirmLabel="Remove device"
        loading={busy === 'remove'}
        onClose={() => setConfirm(null)}
        onConfirm={() => action('remove', async () => { await del(`/api/admin/buses/${detailId}/device`); setConfirm(null); detail.reload(); list.reload(); toast({ type: 'success', title: 'Device removed' }); })}
      />
      <ConfirmDialog
        open={confirm === 'rotate'}
        title="Rotate device token?"
        message="A new token is generated and the old one stops working at once. You must update the ESP32 firmware with the new token."
        confirmLabel="Rotate token"
        loading={busy === 'rotate'}
        onClose={() => setConfirm(null)}
        onConfirm={() => action('rotate', async () => { const r = await post<{ device: DeviceSecret }>(`/api/admin/buses/${detailId}/device/rotate-token`); setConfirm(null); showDevice(r.device); })}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        title="Reset bus account password?"
        message="A random temporary password is generated and shown once. The bus console is signed out and must set a new password."
        tone="danger"
        confirmLabel="Reset password"
        loading={busy === 'reset'}
        onClose={() => setConfirm(null)}
        onConfirm={() => action('reset', async () => { const r = await post<{ credentials: Credentials }>(`/api/admin/buses/${detailId}/reset-password`); setConfirm(null); showCreds(r.credentials, 'Temporary bus password'); })}
      />
      {secrets && <CredentialsDialog open title={secrets.title} notice={secrets.notice} items={secrets.items} onClose={() => setSecrets(null)} />}
    </>
  );
}
