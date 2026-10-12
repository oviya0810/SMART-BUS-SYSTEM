import { useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import { errorMessage } from '../../services/api';
import type { Pickup } from '../../services/types';
import { BaseMap, FitBounds, Point, validPoint } from '../../maps/BaseMap';
import { pickupIcon } from '../../maps/icons';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonRows } from '../../components/ui';
import { PickupBadge } from '../../components/StatusBadges';
import { cx, fmtCoord, fmtDateTime, timeAgo } from '../../components/format';
import { PickupActions } from './PickupActions';

export function BusPickupsPage() {
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const { data, error, reload } = useFetch<{ items: Pickup[] }>(`/api/bus/pickup-requests?scope=${scope}`);
  useLiveReload(['pickup_request_created', 'pickup_request_updated'], reload, 100);
  const [focus, setFocus] = useState<number | null>(null);
  const [fit, setFit] = useState(0);
  const items = data?.items ?? [];
  const located = items.filter((p) => ['pending', 'accepted', 'approaching'].includes(p.status) && validPoint(p.latitude, p.longitude));
  const focused = located.find((p) => p.id === focus);
  const points: Point[] = focused ? [[focused.latitude!, focused.longitude!]] : located.map((p) => [p.latitude!, p.longitude!]);

  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  return (
    <>
      <PageHeader title="Pickup requests" subtitle="Accept, mark approaching and confirm pickups. Every action notifies the student and is recorded." />
      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <Card>
          <CardHeader
            title={scope === 'active' ? 'Active requests' : 'Recent requests'}
            actions={
              <select className="input w-auto py-1.5" value={scope} onChange={(e) => setScope(e.target.value as 'active' | 'all')} aria-label="Scope">
                <option value="active">Active</option>
                <option value="all">All (latest 200)</option>
              </select>
            }
          />
          {!data ? <SkeletonRows /> : items.length === 0 ? <EmptyState title="No pickup requests" message="Requests from students assigned to this bus will appear here in real time." /> : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {items.map((p) => (
                <li key={p.id} className={cx('px-5 py-4', focus === p.id && 'bg-electric-50/60 dark:bg-navy-800/60')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button className="min-w-0 text-left" onClick={() => { setFocus(p.id); setFit((f) => f + 1); }}>
                      <div className="flex items-center gap-2"><span className="font-semibold">{p.student_name}</span><PickupBadge status={p.status} /></div>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{p.boarding_stop_name}{p.note ? ` — “${p.note}”` : ''}</p>
                      <p className="mono text-xs text-slate-500">#{p.id} · {p.latitude != null ? `${fmtCoord(p.latitude, 5)}, ${fmtCoord(p.longitude, 5)}` : 'no coordinates'} · {fmtDateTime(p.created_at)} ({timeAgo(p.created_at)})</p>
                      {p.cancel_reason && <p className="text-xs text-slate-500">Reason: {p.cancel_reason}</p>}
                    </button>
                    <PickupActions pickup={p} onChanged={reload} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div>
          <BaseMap className="h-[520px]">
            <FitBounds points={points} trigger={fit} />
            {located.map((p) => (
              <Marker key={p.id} position={[p.latitude!, p.longitude!]} icon={pickupIcon(p.status)} eventHandlers={{ click: () => setFocus(p.id) }}>
                <Popup><strong>{p.student_name}</strong><br />{p.boarding_stop_name}<br />{p.status.replace('_', ' ')} · {timeAgo(p.created_at)}</Popup>
              </Marker>
            ))}
          </BaseMap>
          <p className="mt-2 text-xs text-slate-500">Pickup locations are visible only to this bus and the transport office.</p>
        </div>
      </div>
    </>
  );
}
