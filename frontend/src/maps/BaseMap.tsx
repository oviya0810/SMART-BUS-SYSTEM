import { ReactNode, useEffect, useRef } from 'react';
import { MapContainer, Polyline, Popup, TileLayer, Marker, useMap } from 'react-leaflet';
import L, { LatLngExpression } from 'leaflet';
import { Maximize2 } from 'lucide-react';
import type { RouteInfo } from '../services/types';
import { stopIcon } from './icons';
import { cx } from '../components/format';

const DEFAULT_CENTER: [number, number] = [
  Number(import.meta.env.VITE_MAP_DEFAULT_LAT ?? 20.5937),
  Number(import.meta.env.VITE_MAP_DEFAULT_LNG ?? 78.9629),
];

export type Point = [number, number];

export const validPoint = (lat?: number | null, lng?: number | null): lat is number =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** Fits the map to the given points whenever `trigger` changes. */
export function FitBounds({ points, trigger }: { points: Point[]; trigger: number }) {
  const map = useMap();
  const hasPoints = points.length > 0;
  const fittedOnce = useRef(false);
  const lastTrigger = useRef(trigger);
  useEffect(() => {
    if (!hasPoints) return;
    // Fit automatically the first time data arrives, then only when asked.
    if (fittedOnce.current && lastTrigger.current === trigger) return;
    fittedOnce.current = true;
    lastTrigger.current = trigger;
    if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 15), { animate: true });
    else map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, hasPoints, map]);
  return null;
}

function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 150);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

export function RouteLayer({ route, highlightStopIds = [] }: { route?: RouteInfo | null; highlightStopIds?: number[] }) {
  if (!route) return null;
  const stops = route.stops.filter((s) => validPoint(s.latitude, s.longitude));
  const line = stops.map((s) => [s.latitude!, s.longitude!] as LatLngExpression);
  return (
    <>
      {line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#2f63ff', weight: 4, opacity: 0.7, dashArray: '1 8', lineCap: 'round' }} />}
      {line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#2f63ff', weight: 3, opacity: 0.35 }} />}
      {stops.map((s) => (
        <Marker key={s.id} position={[s.latitude!, s.longitude!]} icon={stopIcon(s.sequence, highlightStopIds.includes(s.id))}>
          <Popup>
            <strong>{s.name}</strong>
            <br />
            Stop #{s.sequence} · {route.name}
            <br />
            <span style={{ color: '#64748b' }}>
              {s.latitude!.toFixed(6)}, {s.longitude!.toFixed(6)}
            </span>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export function MapLegend({ items }: { items: { color: string; label: string; shape?: 'dot' | 'square' | 'line' }[] }) {
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-[500] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[11px] shadow-card backdrop-blur dark:border-navy-700 dark:bg-navy-900/95" aria-label="Map legend">
      <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Legend</p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <span
              className={cx('inline-block', i.shape === 'line' ? 'h-0.5 w-4' : i.shape === 'square' ? 'h-3 w-3 rounded' : 'h-3 w-3 rounded-full')}
              style={{ background: i.color }}
            />
            {i.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MapToolbar({ children }: { children: ReactNode }) {
  return <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2">{children}</div>;
}

export function MapButton({ onClick, label, icon }: { onClick: () => void; label: string; icon?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-card backdrop-blur hover:bg-white dark:border-navy-700 dark:bg-navy-900/95 dark:text-slate-200"
      title={label}
    >
      {icon ?? <Maximize2 className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function BaseMap({ children, className, overlay, zoom = 13, center }: { children?: ReactNode; className?: string; overlay?: ReactNode; zoom?: number; center?: Point }) {
  return (
    <div className={cx('relative overflow-hidden rounded-2xl border border-slate-200 dark:border-navy-800', className ?? 'h-[480px]')}>
      <MapContainer center={center ?? DEFAULT_CENTER} zoom={center ? zoom : 5} className="h-full w-full" zoomControl scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <InvalidateOnResize />
        {children}
      </MapContainer>
      {overlay}
    </div>
  );
}
