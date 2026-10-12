import { errorMessage } from '../../services/api';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonRows } from '../../components/ui';
import { PickupBadge } from '../../components/StatusBadges';
import { fmtCoord, fmtDateTime } from '../../components/format';
import { useMyPickups } from './useStudentData';

export function StudentRequestsPage() {
  const { data, error, reload } = useMyPickups();
  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  return (
    <>
      <PageHeader title="My pickup requests" subtitle="Status updates arrive in real time." />
      <Card>
        <CardHeader title="History" />
        {!data ? <SkeletonRows /> : data.items.length === 0 ? <EmptyState title="No requests yet" message="Open the live map to request a pickup." /> : (
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {data.items.map((p) => (
              <li key={p.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{p.boarding_stop_name} <span className="text-xs font-normal text-slate-500">· Bus {p.bus_number} · #{p.id}</span></p>
                    <p className="text-xs text-slate-500">{fmtDateTime(p.created_at)} · {p.latitude != null ? <span className="mono">{fmtCoord(p.latitude, 5)}, {fmtCoord(p.longitude, 5)}</span> : 'stop only'}</p>
                  </div>
                  <PickupBadge status={p.status} />
                </div>
                {p.history && p.history.length > 0 && (
                  <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {p.history.map((h, i) => (
                      <li key={i}>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{h.to_status.replace('_', ' ')}</span> · {fmtDateTime(h.at)} · by {h.changed_by}
                        {h.reason ? ` (${h.reason})` : ''}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
