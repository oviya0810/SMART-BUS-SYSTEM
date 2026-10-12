import { useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { errorMessage } from '../../services/api';
import { BaseMap, FitBounds, MapButton, MapLegend, MapToolbar, Point, RouteLayer, validPoint } from '../../maps/BaseMap';
import { busIcon, pickupIcon } from '../../maps/icons';
import { Card, ErrorState, Notice, PageHeader } from '../../components/ui';
import { DeviceBadge, GpsBadge } from '../../components/StatusBadges';
import { fmtCoord, fmtDateTime, timeAgo } from '../../components/format';
import { useBusOverview } from './useBusData';

export function BusMapPage() {
  const { data: d, error, reload } = useBusOverview();
  const [fit, setFit] = useState(0);
  if (error && !d) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  const loc = d?.live.location;
  const busPos = loc?.available ? ([loc.latitude!, loc.longitude!] as Point) : null;
  const pickups = (d?.active_pickups ?? []).filter((p) => validPoint(p.latitude, p.longitude));
  const points: Point[] = [...(busPos ? [busPos] : []), ...pickups.map((p) => [p.latitude!, p.longitude!] as Point)];
  if (!points.length) (d?.route?.stops ?? []).filter((s) => validPoint(s.latitude, s.longitude)).forEach((s) => points.push([s.latitude!, s.longitude!]));

  return (
    <>
      <PageHeader title="Live map" subtitle="Your bus GPS, route and the students waiting for pickup." actions={d && <><DeviceBadge device={d.live.device} /><GpsBadge loc={loc} /></>} />
      {d && !loc?.available && <div className="mb-3"><Notice tone="amber">No GPS position has been reported by this bus’s ESP32 yet.</Notice></div>}
      {loc?.state === 'stale' && <div className="mb-3"><Notice tone="amber">GPS position is stale — last fix {timeAgo(loc.received_at)}.</Notice></div>}
      <BaseMap
        className="h-[66vh] min-h-[420px]"
        overlay={
          <>
            <MapToolbar><MapButton label="Fit all" onClick={() => setFit((f) => f + 1)} /></MapToolbar>
            <MapLegend items={[{ color: '#1f4ff2', label: 'This bus', shape: 'square' }, { color: '#f59e0b', label: 'Pending pickup' }, { color: '#06b6d4', label: 'Approaching' }, { color: '#0b1736', label: 'Stop' }, { color: '#2f63ff', label: 'Route', shape: 'line' }]} />
          </>
        }
      >
        <FitBounds points={points} trigger={fit} />
        <RouteLayer route={d?.route} />
        {busPos && d && (
          <Marker position={busPos} icon={busIcon(d.bus.bus_number, { state: loc!.state === 'live' ? 'live' : 'stale', sos: d.active_incidents.length > 0 })}>
            <Popup>
              <strong>Bus {d.bus.bus_number}</strong>
              <br />{fmtCoord(loc!.latitude)}, {fmtCoord(loc!.longitude)}
              <br />GPS time: {fmtDateTime(loc!.device_timestamp)}
              <br />Device: {d.live.device.online ? 'online' : 'offline'}
            </Popup>
          </Marker>
        )}
        {pickups.map((p) => (
          <Marker key={p.id} position={[p.latitude!, p.longitude!]} icon={pickupIcon(p.status)}>
            <Popup><strong>{p.student_name}</strong><br />{p.boarding_stop_name}<br />{p.status_label} · {timeAgo(p.created_at)}</Popup>
          </Marker>
        ))}
      </BaseMap>
    </>
  );
}
