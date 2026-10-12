import type { OccupancyStatus } from '../services/types';
import { OccupancyBadge } from './StatusBadges';
import { fmtDateTime, timeAgo } from './format';

/** Seat availability visual. Renders an explicit "no data" state instead of numbers when hardware data is missing. */
export function SeatGauge({ occ }: { occ?: OccupancyStatus }) {
  const has = !!occ?.available && occ.occupied !== null;
  const pct = has ? Math.min(100, occ!.occupancy_percent ?? 0) : 0;
  const color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#f59e0b' : '#06b6d4';
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
          <circle cx="64" cy="64" r={r} fill="none" stroke="currentColor" strokeWidth="12" className="text-slate-100 dark:text-navy-800" />
          {has && <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray .6s ease' }} />}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {has ? (
            <>
              <span className="mono text-3xl font-semibold text-slate-900 dark:text-white">{occ!.available_seats}</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">seats free</span>
            </>
          ) : (
            <span className="px-4 text-xs font-medium text-slate-500">Waiting for hardware data</span>
          )}
        </div>
      </div>
      <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div><dt className="text-xs text-slate-500">Capacity</dt><dd className="mono font-semibold">{occ?.capacity ?? '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Occupied</dt><dd className="mono font-semibold">{has ? occ!.occupied : '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Occupancy</dt><dd className="mono font-semibold">{has ? `${occ!.occupancy_percent}%` : '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Sensor</dt><dd><OccupancyBadge occ={occ} /></dd></div>
        <div className="col-span-2"><dt className="text-xs text-slate-500">Last sensor update</dt><dd className="font-medium">{occ?.received_at ? `${fmtDateTime(occ.received_at)} · ${timeAgo(occ.received_at)}` : 'No reading received'}</dd></div>
        {occ?.message && <div className="col-span-2 text-xs font-medium text-amber-700 dark:text-amber-300">{occ.message}</div>}
      </dl>
    </div>
  );
}
