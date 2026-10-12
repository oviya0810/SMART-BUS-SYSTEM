import { Badge, Tone } from './ui';
import { timeAgo } from './format';
import type { AlcoholStatus, DeviceStatus, DriverDuty, Incident, LocationStatus, OccupancyStatus, PickupStatus } from '../services/types';

const PICKUP_TONE: Record<PickupStatus, Tone> = {
  pending: 'amber', accepted: 'blue', approaching: 'cyan', picked_up: 'green', cancelled: 'neutral',
};
const PICKUP_LABEL: Record<PickupStatus, string> = {
  pending: 'Pending', accepted: 'Accepted', approaching: 'Approaching', picked_up: 'Picked Up', cancelled: 'Cancelled',
};

export function PickupBadge({ status }: { status: PickupStatus }) {
  return <Badge tone={PICKUP_TONE[status]} dot>{PICKUP_LABEL[status]}</Badge>;
}

export function IncidentStatusBadge({ status }: { status: Incident['status'] }) {
  const t: Record<Incident['status'], [Tone, string]> = {
    active: ['red', 'Active'], acknowledged: ['amber', 'Acknowledged'], resolved: ['green', 'Resolved'],
  };
  return <Badge tone={t[status][0]} dot>{t[status][1]}</Badge>;
}

export function IncidentTypeBadge({ type, label }: { type: Incident['incident_type']; label: string }) {
  const tone: Record<string, Tone> = { sos: 'red', medical: 'violet', breakdown: 'amber', other: 'neutral' };
  return <Badge tone={tone[type] ?? 'neutral'}>{label}</Badge>;
}

export function DeviceBadge({ device }: { device?: DeviceStatus }) {
  if (!device || !device.assigned) return <Badge tone="neutral">No device</Badge>;
  if (device.online) return <Badge tone="green" dot>Online</Badge>;
  if (device.connection === 'never_connected') return <Badge tone="neutral" dot>Never connected</Badge>;
  return <Badge tone="red" dot>Offline</Badge>;
}

export function GpsBadge({ loc }: { loc?: LocationStatus }) {
  if (!loc || !loc.available) return <Badge tone="neutral">No GPS data</Badge>;
  if (loc.state === 'stale') return <Badge tone="amber" dot>Stale · {timeAgo(loc.received_at)}</Badge>;
  return <Badge tone="green" dot>Live · {timeAgo(loc.received_at)}</Badge>;
}

export function OccupancyBadge({ occ }: { occ?: OccupancyStatus }) {
  if (!occ || !occ.available) return <Badge tone="neutral">Waiting for hardware data</Badge>;
  if (occ.state === 'sensor_error') return <Badge tone="red" dot>Sensor error</Badge>;
  if (occ.state === 'stale') return <Badge tone="amber" dot>{occ.sensor_connected ? 'Stale' : 'Sensor offline'}</Badge>;
  return <Badge tone="green" dot>Live</Badge>;
}

export function AlcoholBadge({ alc }: { alc?: AlcoholStatus }) {
  if (!alc) return <Badge tone="neutral">Offline</Badge>;
  const tone: Record<AlcoholStatus['state'], Tone> = {
    normal: 'green', warning: 'red', warming_up: 'amber', sensor_error: 'red', offline: 'neutral',
  };
  return <Badge tone={tone[alc.state]} dot>{alc.label}</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? <Badge tone="green" dot>Active</Badge> : <Badge tone="neutral" dot>Inactive</Badge>;
}

export function DutyBadge({ duty }: { duty?: DriverDuty }) {
  if (!duty) return null;
  if (!duty.card_registered && duty.state === 'no_data') return <Badge tone="neutral">No driver card</Badge>;
  if (duty.on_duty) return <Badge tone="green" dot>Driver on duty</Badge>;
  if (duty.state === 'off_duty') return <Badge tone="amber" dot>Driver off duty</Badge>;
  return <Badge tone="neutral" dot>No duty tap yet</Badge>;
}
