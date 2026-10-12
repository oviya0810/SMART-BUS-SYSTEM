import { Link } from 'react-router-dom';
import { Armchair, Cpu, ListChecks, MapPin, Siren, Users, Wine } from 'lucide-react';
import { errorMessage } from '../../services/api';
import { Badge, Card, CardHeader, EmptyState, ErrorState, KpiCard, Notice, PageHeader, SkeletonRows, StatItem } from '../../components/ui';
import { AlcoholBadge, DeviceBadge, DutyBadge, GpsBadge, IncidentStatusBadge, IncidentTypeBadge, PickupBadge } from '../../components/StatusBadges';
import { SeatGauge } from '../../components/SeatGauge';
import { fmtCoord, fmtDateTime, timeAgo } from '../../components/format';
import { PickupActions } from './PickupActions';
import { useBusOverview } from './useBusData';

export function BusOverview() {
  const { data: d, error, reload, loading } = useBusOverview();
  if (error && !d) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  const live = d?.live;
  return (
    <>
      <PageHeader
        title={d ? `Bus ${d.bus.bus_number}` : 'Bus console'}
        subtitle={d ? `${d.route?.name ?? 'No route assigned'} · Driver ${d.bus.driver_name} (${d.bus.driver_phone})` : undefined}
        actions={d && <><DutyBadge duty={live?.driver} /><DeviceBadge device={live?.device} /><GpsBadge loc={live?.location} /></>}
      />

      {d && d.active_incidents.length > 0 && (
        <Link to="/bus/emergency" className="mb-4 flex items-center gap-3 rounded-2xl bg-red-600 px-5 py-4 text-white shadow-lg shadow-red-600/20" role="alert">
          <Siren className="h-6 w-6 animate-pulse" />
          <span className="font-semibold">{d.active_incidents.length} open incident(s) on this bus — {d.active_incidents[0].type_label}, {timeAgo(d.active_incidents[0].created_at)}</span>
        </Link>
      )}
      {live?.alcohol.state === 'warning' && (
        <div className="mb-4"><Notice tone="red" icon={<Wine className="h-4 w-4" />} title="Alcohol sensor warning">Raw MQ-3 reading {live.alcohol.raw_adc} ≥ threshold {live.alcohol.threshold}. {live.alcohol.disclaimer}</Notice></div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard loading={loading && !d} label="Pending pickups" value={d?.pending_pickups ?? '—'} icon={<ListChecks className="h-5 w-5" />} tone={d?.pending_pickups ? 'amber' : 'neutral'} />
        <KpiCard loading={loading && !d} label="Available seats" value={live?.occupancy.available ? live.occupancy.available_seats : '—'} icon={<Armchair className="h-5 w-5" />} hint={live?.occupancy.available ? `${live.occupancy.occupied} of ${d?.bus.capacity} occupied` : 'Waiting for hardware data'} />
        <KpiCard loading={loading && !d} label="Passengers onboard" value={live?.occupancy.available ? live.occupancy.occupied : '—'} icon={<Users className="h-5 w-5" />} tone="cyan" hint={d ? `Occupancy sensor · ${d.assigned_students} students assigned` : undefined} />
        <KpiCard loading={loading && !d} label="Alcohol sensor" value={<AlcoholBadge alc={live?.alcohol} />} icon={<Wine className="h-5 w-5" />} tone={live?.alcohol.state === 'warning' ? 'red' : 'violet'} hint={live?.alcohol.raw_adc != null ? `raw ${live.alcohol.raw_adc} · threshold ${live.alcohol.threshold}` : 'No recent reading'} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Live pickup requests" icon={<ListChecks className="h-5 w-5" />} subtitle="Oldest first" actions={<Link to="/bus/pickups" className="text-xs font-semibold text-electric-600 hover:underline">Manage all</Link>} />
          {!d ? <SkeletonRows rows={3} /> : d.active_pickups.length === 0 ? (
            <EmptyState title="No active pickup requests" message="New requests appear here instantly with a notification." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {d.active_pickups.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="font-semibold">{p.student_name}</span><PickupBadge status={p.status} /></div>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300"><MapPin className="mr-1 inline h-3.5 w-3.5" />{p.boarding_stop_name}{p.note ? ` — “${p.note}”` : ''}</p>
                    <p className="mono mt-0.5 text-xs text-slate-500">{p.latitude != null ? `${fmtCoord(p.latitude, 5)}, ${fmtCoord(p.longitude, 5)}` : 'no coordinates'} · {timeAgo(p.created_at)}</p>
                  </div>
                  <PickupActions pickup={p} onChanged={reload} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Seat occupancy" icon={<Armchair className="h-5 w-5" />} />
          <div className="p-5"><SeatGauge occ={live?.occupancy} /></div>
        </Card>

        <Card>
          <CardHeader title="Bus position" icon={<MapPin className="h-5 w-5" />} actions={<Link to="/bus/map" className="text-xs font-semibold text-electric-600 hover:underline">Map</Link>} />
          <dl className="grid grid-cols-2 gap-4 p-5">
            <StatItem label="Coordinates" value={live?.location.available ? `${fmtCoord(live.location.latitude, 5)}, ${fmtCoord(live.location.longitude, 5)}` : 'No GPS data'} />
            <StatItem label="Last GPS update" value={live?.location.received_at ? timeAgo(live.location.received_at) : '—'} sub={fmtDateTime(live?.location.received_at)} />
            <StatItem label="Speed" value={live?.location.speed_kmh != null ? `${live.location.speed_kmh.toFixed(0)} km/h` : '—'} />
            <StatItem label="Satellites" value={live?.location.satellites ?? '—'} />
          </dl>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Hardware" icon={<Cpu className="h-5 w-5" />} actions={<Link to="/bus/device" className="text-xs font-semibold text-electric-600 hover:underline">Details</Link>} />
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between text-sm"><span>ESP32</span><DeviceBadge device={live?.device} /></div>
            <div className="flex items-center justify-between text-sm"><span>Driver duty (ID card)</span><span className="flex items-center gap-2 text-slate-500">{live?.driver.since ? timeAgo(live.driver.since) : ''} <DutyBadge duty={live?.driver} /></span></div>
            <div className="flex items-center justify-between text-sm"><span>Last heartbeat</span><span className="text-slate-500">{live?.device.last_seen_at ? timeAgo(live.device.last_seen_at) : 'never'}</span></div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(live?.device.components ?? {}).map(([k, v]) => <Badge key={k} tone={v === 'ok' || v === 'fix' ? 'green' : v === 'unknown' ? 'neutral' : 'amber'}>{k.replace('_', ' ')}: {v}</Badge>)}
            </div>
          </div>
        </Card>


        {d && d.active_incidents.length > 0 && (
          <Card className="xl:col-span-3">
            <CardHeader title="Open incidents" icon={<Siren className="h-5 w-5" />} />
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {d.active_incidents.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div className="flex items-center gap-2"><IncidentTypeBadge type={i.incident_type} label={i.type_label} /><span className="mono text-xs">{i.event_id}</span></div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">{fmtDateTime(i.created_at)} <IncidentStatusBadge status={i.status} /></div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
