import { useState } from 'react';
import { Cpu, MessageSquare } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import { errorMessage, post } from '../../services/api';
import type { AlcoholStatus, DeviceStatus, LocationStatus, OccupancyStatus } from '../../services/types';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Notice, PageHeader, SkeletonRows, StatItem } from '../../components/ui';
import { AlcoholBadge, DeviceBadge, GpsBadge, OccupancyBadge } from '../../components/StatusBadges';
import { useToast } from '../../components/Toast';
import { fmtDateTime, timeAgo } from '../../components/format';

const LABELS: Record<string, string> = { gps: 'GPS module', occupancy_sensor: 'Occupancy sensor', alcohol_sensor: 'Alcohol sensor (MQ-3)', rfid_reader: 'RFID reader (driver card)', lcd: 'LCD display', buzzer: 'Buzzer' };

export function BusDevicePage() {
  const toast = useToast();
  const { data, error, reload } = useFetch<{ device: DeviceStatus; alcohol: AlcoholStatus; occupancy: OccupancyStatus; location: LocationStatus }>('/api/bus/device', 15000);
  useLiveReload(['device_status_updated', 'bus_location_updated', 'occupancy_updated', 'alcohol_updated'], reload, 300);
  const [lcd, setLcd] = useState({ line1: '', line2: '' });
  const [busy, setBusy] = useState(false);
  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  const dev = data?.device;

  const sendLcd = async () => {
    setBusy(true);
    try {
      await post('/api/bus/lcd-message', lcd);
      toast({ type: 'success', title: 'Message queued for the LCD', message: 'Delivered at the next command poll; status shows when the ESP32 acknowledges.' });
      setLcd({ line1: '', line2: '' });
    } catch (err) {
      toast({ type: 'error', title: 'Could not queue message', message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Hardware status" subtitle="Everything shown here was reported by the ESP32 — components without a report are shown as “unknown”." actions={<DeviceBadge device={dev} />} />
      {!data ? <Card><SkeletonRows /></Card> : !dev?.assigned ? (
        <Card><EmptyState icon={<Cpu className="h-6 w-6" />} title="No ESP32 device associated" message="Ask the administrator to associate a device with this bus." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Device" icon={<Cpu className="h-5 w-5" />} />
            <dl className="grid grid-cols-2 gap-4 p-5">
              <StatItem label="Device ID" value={dev.device_id} />
              <StatItem label="Connection" value={dev.online ? 'Online' : dev.connection === 'never_connected' ? 'Never connected' : 'Offline'} />
              <StatItem label="Last heartbeat" value={dev.last_seen_at ? timeAgo(dev.last_seen_at) : 'Never'} sub={fmtDateTime(dev.last_seen_at)} />
              <StatItem label="Last telemetry" value={dev.last_telemetry_at ? timeAgo(dev.last_telemetry_at) : 'Never'} sub={fmtDateTime(dev.last_telemetry_at)} />
              <StatItem label="Firmware" value={dev.firmware_version ?? '—'} />
              <StatItem label="Registered" value={fmtDateTime(dev.registered_at)} />
              <StatItem label="IP address" value={dev.last_ip ?? '—'} />
            </dl>
            {dev.last_error && <div className="px-5 pb-5"><Notice tone="red" title={`Last device error · ${timeAgo(dev.last_error_at)}`}>{dev.last_error}</Notice></div>}
          </Card>
          <Card>
            <CardHeader title="Components" subtitle="As reported in the latest heartbeat" />
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {Object.entries(dev.components ?? {}).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span>{LABELS[k] ?? k}</span>
                  <Badge tone={v === 'ok' || v === 'fix' ? 'green' : v === 'unknown' ? 'neutral' : v === 'warming_up' || v === 'no_fix' || v === 'degraded' ? 'amber' : 'red'} dot>{v.replace('_', ' ')}</Badge>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3 dark:border-navy-800">
              <GpsBadge loc={data.location} />
              <OccupancyBadge occ={data.occupancy} />
              <AlcoholBadge alc={data.alcohol} />
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Send message to the bus LCD" icon={<MessageSquare className="h-5 w-5" />} subtitle="16×2 display · ASCII only · delivered through the command queue" />
            <div className="flex flex-wrap items-end gap-3 p-5">
              <Field label="Line 1" htmlFor="l1"><input id="l1" maxLength={16} className="input mono w-48" value={lcd.line1} onChange={(e) => setLcd({ ...lcd, line1: e.target.value })} /></Field>
              <Field label="Line 2" htmlFor="l2"><input id="l2" maxLength={16} className="input mono w-48" value={lcd.line2} onChange={(e) => setLcd({ ...lcd, line2: e.target.value })} /></Field>
              <Button loading={busy} disabled={!lcd.line1.trim()} onClick={sendLcd}>Queue message</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
