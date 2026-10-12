import { Link } from 'react-router-dom';
import { Armchair, Bus, MapPin, Navigation, Siren } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { errorMessage } from '../../services/api';
import type { DeviceStatus } from '../../services/types';
import { Button, Card, CardHeader, EmptyState, ErrorState, Notice, PageHeader, Skeleton, StatItem } from '../../components/ui';
import { DeviceBadge, GpsBadge, IncidentStatusBadge, IncidentTypeBadge, PickupBadge } from '../../components/StatusBadges';
import { SeatGauge } from '../../components/SeatGauge';
import { fmtCoord, fmtDateTime, timeAgo } from '../../components/format';
import { useBusStatus, useMyAlerts, useMyPickups, useProfile } from './useStudentData';

export function StudentOverview() {
  const { user } = useAuth();
  const profile = useProfile();
  const status = useBusStatus();
  const pickups = useMyPickups();
  const alerts = useMyAlerts();
  const s = profile.data?.student;
  const st = status.data;
  const active = (pickups.data?.items ?? []).filter((p) => ['pending', 'accepted', 'approaching'].includes(p.status));
  const openAlerts = (alerts.data?.items ?? []).filter((a) => a.status !== 'resolved');

  if (profile.error && !profile.data) return <Card><ErrorState message={errorMessage(profile.error)} onRetry={profile.reload} /></Card>;

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.display_name.split(' ')[0] ?? ''}`}
        subtitle="Your bus, seats and pickup requests at a glance."
        actions={<Link to="/student/map"><Button icon={<Navigation className="h-4 w-4" />}>Request pickup</Button></Link>}
      />

      {openAlerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {openAlerts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-red-600 px-4 py-3 text-white" role="alert">
              <Siren className="h-5 w-5 animate-pulse" />
              <p className="text-sm font-semibold">{a.type_label} reported on Bus {a.bus_number} · {timeAgo(a.created_at)}</p>
              <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">{a.status === 'acknowledged' ? 'Transport office responding' : 'Alert sent to transport office'}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="My details" icon={<MapPin className="h-5 w-5" />} />
          {!s ? <div className="space-y-3 p-5"><Skeleton className="h-5 w-40" /><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-48" /></div> : (
            <dl className="grid grid-cols-2 gap-4 p-5">
              <StatItem label="Name" value={s.full_name} />
              <StatItem label="Register no." value={s.register_number} />
              <StatItem label="Assigned bus" value={s.bus ? `Bus ${s.bus.bus_number}` : 'Not assigned'} />
              <StatItem label="Route" value={s.bus?.route_name ?? '—'} />
              <StatItem label="Boarding stop" value={s.boarding_stop?.name ?? '—'} />
              <StatItem label="Destination" value={s.destination_stop?.name ?? '—'} />
            </dl>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Bus status" icon={<Bus className="h-5 w-5" />} actions={st?.assigned && <><DeviceBadge device={st.device as DeviceStatus} /><GpsBadge loc={st.location} /></>} />
          {!st ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : !st.assigned ? (
            <EmptyState title="No bus assigned" message="Contact the transport office to be assigned to a bus." />
          ) : (
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <StatItem label="Bus" value={`Bus ${st.bus!.bus_number}`} sub={st.bus!.route_name ?? 'No route'} />
              <StatItem
                label="Latest GPS position"
                value={st.location?.available ? `${fmtCoord(st.location.latitude, 5)}, ${fmtCoord(st.location.longitude, 5)}` : 'Not available'}
                sub={st.location?.available ? `${fmtDateTime(st.location.received_at)} (${timeAgo(st.location.received_at)})` : st.location?.message}
              />
              <StatItem label="Tracker" value={st.device?.online ? 'Online' : st.device?.assigned ? 'Offline' : 'Not installed'} sub={st.device?.last_seen_at ? `last seen ${timeAgo(st.device.last_seen_at)}` : undefined} />
              {st.location?.state === 'stale' && <div className="sm:col-span-3"><Notice tone="amber">The bus GPS position is stale — the last fix is {timeAgo(st.location.received_at)}. The tracker may be offline or without satellite lock.</Notice></div>}
              <div className="sm:col-span-3">
                <Link to="/student/map" className="text-sm font-semibold text-electric-600 hover:underline">Open live map →</Link>
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Seat availability" icon={<Armchair className="h-5 w-5" />} subtitle="Reported by the occupancy sensor on your bus" />
          <div className="p-5">{st?.assigned ? <SeatGauge occ={st.occupancy} /> : <p className="text-sm text-slate-500">Not available without an assigned bus.</p>}</div>
        </Card>

        <Card>
          <CardHeader title="My pickup requests" icon={<Navigation className="h-5 w-5" />} actions={<Link to="/student/requests" className="text-xs font-semibold text-electric-600 hover:underline">All</Link>} />
          {!pickups.data ? <div className="p-5"><Skeleton className="h-16 w-full" /></div> : active.length === 0 ? (
            <EmptyState title="No pending requests" action={<Link to="/student/map"><Button size="sm" variant="secondary">Request a pickup</Button></Link>} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {active.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{p.boarding_stop_name}</p>
                    <p className="text-xs text-slate-500">#{p.id} · {timeAgo(p.created_at)}</p>
                  </div>
                  <PickupBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Emergency notifications" icon={<Siren className="h-5 w-5" />} subtitle="Incidents on your bus in the last 30 days" actions={<Link to="/student/alerts" className="text-xs font-semibold text-electric-600 hover:underline">View all</Link>} />
          {!alerts.data ? <div className="p-5"><Skeleton className="h-12 w-full" /></div> : alerts.data.items.length === 0 ? (
            <EmptyState title="No incidents" message="You will be notified instantly if an emergency is reported on your bus." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {alerts.data.items.slice(0, 4).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div className="flex items-center gap-2"><IncidentTypeBadge type={a.incident_type} label={a.type_label} /><span className="text-sm">Bus {a.bus_number}</span></div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">{fmtDateTime(a.created_at)} <IncidentStatusBadge status={a.status} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
