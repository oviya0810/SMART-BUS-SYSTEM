import { useMemo, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { Crosshair, Search } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import { errorMessage } from '../../services/api';
import type { Bus, Pickup } from '../../services/types';
import { BaseMap, FitBounds, MapButton, MapLegend, MapToolbar, Point, RouteLayer, validPoint } from '../../maps/BaseMap';
import { busIcon, pickupIcon } from '../../maps/icons';
import { Card, ErrorState, PageHeader } from '../../components/ui';
import { DeviceBadge, GpsBadge, OccupancyBadge } from '../../components/StatusBadges';
import { cx, fmtCoord, fmtDateTime, timeAgo } from '../../components/format';

const EVENTS = ['driver_rfid_event', 'bus_location_updated', 'occupancy_updated', 'device_status_updated', 'sos_created', 'sos_updated', 'sos_acknowledged', 'pickup_request_created', 'pickup_request_updated'];

export function FleetMapPage() {
  const { data, error, reload } = useFetch<{ buses: Bus[]; pickups: Pickup[] }>('/api/admin/fleet', 60000);
  useLiveReload(EVENTS, reload, 250);
  const [q, setQ] = useState('');
  const [route, setRoute] = useState('');
  const [conn, setConn] = useState<'all' | 'online' | 'offline'>('all');
  const [emergencyOnly, setEmergencyOnly] = useState(false);
  const [fit, setFit] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);

  const routes = useMemo(() => Array.from(new Set((data?.buses ?? []).map((b) => b.route_name).filter(Boolean))) as string[], [data]);
  const buses = useMemo(
    () =>
      (data?.buses ?? []).filter(
        (b) =>
          (!q || b.bus_number.toLowerCase().includes(q.toLowerCase())) &&
          (!route || b.route_name === route) &&
          (conn === 'all' || (conn === 'online') === !!b.live?.device.online) &&
          (!emergencyOnly || (b.live?.active_incidents ?? 0) > 0),
      ),
    [data, q, route, conn, emergencyOnly],
  );
  const busIds = new Set(buses.map((b) => b.id));
  const pickups = (data?.pickups ?? []).filter((p) => busIds.has(p.bus_id) && validPoint(p.latitude, p.longitude));
  const points: Point[] = [
    ...buses.filter((b) => b.live?.location.available).map((b) => [b.live!.location.latitude!, b.live!.location.longitude!] as Point),
    ...pickups.map((p) => [p.latitude!, p.longitude!] as Point),
  ];
  const withoutGps = buses.filter((b) => !b.live?.location.available).length;
  const sel = buses.find((b) => b.id === selected && b.live?.location.available);
  const fitPoints: Point[] = sel ? [[sel.live!.location.latitude!, sel.live!.location.longitude!]] : points;

  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;

  return (
    <>
      <PageHeader title="Fleet map" subtitle="Hardware-reported GPS positions of every registered bus." />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[180px] flex-1 sm:max-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Bus number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter by bus number" />
        </div>
        <select className="input w-auto" value={route} onChange={(e) => setRoute(e.target.value)} aria-label="Filter by route">
          <option value="">All routes</option>
          {routes.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select className="input w-auto" value={conn} onChange={(e) => setConn(e.target.value as typeof conn)} aria-label="Filter by connectivity">
          <option value="all">Online & offline</option>
          <option value="online">Online only</option>
          <option value="offline">Offline only</option>
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-navy-700">
          <input type="checkbox" checked={emergencyOnly} onChange={(e) => setEmergencyOnly(e.target.checked)} className="accent-red-600" />
          Active emergencies
        </label>
        <span className="ml-auto text-xs text-slate-500">{buses.length} bus(es){withoutGps ? ` · ${withoutGps} without GPS data` : ''}</span>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <BaseMap
          className="h-[62vh] min-h-[420px]"
          overlay={
            <>
              <MapToolbar>
                <MapButton label="Fit all" onClick={() => { setSelected(null); setFit((f) => f + 1); }} />
              </MapToolbar>
              <MapLegend items={[{ color: '#1f4ff2', label: 'Bus · live GPS', shape: 'square' }, { color: '#d97706', label: 'Bus · stale GPS', shape: 'square' }, { color: '#dc2626', label: 'Bus · active SOS', shape: 'square' }, { color: '#f59e0b', label: 'Pickup request' }, { color: '#2f63ff', label: 'Route', shape: 'line' }]} />
            </>
          }
        >
          <FitBounds points={fitPoints} trigger={fit} />
          {buses.map((b) => <RouteLayer key={`r${b.id}`} route={b.route} />)}
          {buses.filter((b) => b.live?.location.available).map((b) => {
            const loc = b.live!.location;
            return (
              <Marker
                key={b.id}
                position={[loc.latitude!, loc.longitude!]}
                icon={busIcon(b.bus_number, { state: loc.state === 'live' ? 'live' : 'stale', sos: (b.live?.active_incidents ?? 0) > 0 })}
                eventHandlers={{ click: () => setSelected(b.id) }}
                zIndexOffset={b.live?.active_incidents ? 1000 : 0}
              >
                <Popup>
                  <strong>Bus {b.bus_number}</strong> · {b.route_name ?? 'No route'}
                  <br />
                  {fmtCoord(loc.latitude)}, {fmtCoord(loc.longitude)}
                  <br />
                  GPS: {fmtDateTime(loc.received_at)} ({timeAgo(loc.received_at)})
                  <br />
                  Driver: {b.live?.driver.on_duty ? 'on duty' : 'off duty'} · Device: {b.live?.device.online ? 'online' : 'offline'} · Seats:{' '}
                  {b.live?.occupancy.available ? `${b.live.occupancy.occupied}/${b.capacity}` : 'no data'}
                  {b.live?.active_incidents ? <><br /><span style={{ color: '#dc2626', fontWeight: 700 }}>⚠ {b.live.active_incidents} active incident(s)</span></> : null}
                </Popup>
              </Marker>
            );
          })}
          {pickups.map((p) => (
            <Marker key={`p${p.id}`} position={[p.latitude!, p.longitude!]} icon={pickupIcon(p.status)}>
              <Popup>
                <strong>{p.student_name}</strong> ({p.register_number})
                <br />
                Bus {p.bus_number} · {p.boarding_stop_name}
                <br />
                {p.status_label} · {timeAgo(p.created_at)}
              </Popup>
            </Marker>
          ))}
        </BaseMap>

        <Card className="max-h-[62vh] overflow-y-auto">
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {buses.length === 0 && <li className="p-6 text-center text-sm text-slate-500">No buses match these filters.</li>}
            {buses.map((b) => (
              <li key={b.id} className={cx('p-4', selected === b.id && 'bg-electric-50/60 dark:bg-navy-800/60')}>
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="flex items-center gap-2 text-left text-sm font-semibold hover:text-electric-600"
                    onClick={() => {
                      setSelected(b.id);
                      if (b.live?.location.available) setFit((f) => f + 1);
                    }}
                  >
                    <Crosshair className="h-3.5 w-3.5" /> Bus {b.bus_number}
                  </button>
                  <DeviceBadge device={b.live?.device} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{b.route_name ?? 'No route assigned'} · {b.driver_name}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <GpsBadge loc={b.live?.location} />
                  <OccupancyBadge occ={b.live?.occupancy} />
                  {(b.live?.active_incidents ?? 0) > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">SOS</span>}
                </div>
                {b.live?.location.available && (
                  <p className="mono mt-2 text-xs text-slate-500">
                    {fmtCoord(b.live.location.latitude, 5)}, {fmtCoord(b.live.location.longitude, 5)} · {timeAgo(b.live.location.received_at)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
