import { Siren } from 'lucide-react';
import { errorMessage } from '../../services/api';
import { Card, EmptyState, ErrorState, PageHeader, SkeletonRows } from '../../components/ui';
import { IncidentStatusBadge, IncidentTypeBadge } from '../../components/StatusBadges';
import { cx, fmtCoord, fmtDateTime, timeAgo } from '../../components/format';
import { useMyAlerts } from './useStudentData';

export function StudentAlertsPage() {
  const { data, error, reload } = useMyAlerts();
  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  return (
    <>
      <PageHeader title="Safety alerts" subtitle="Official emergency incidents on your assigned bus (last 30 days)." />
      <Card>
        {!data ? <SkeletonRows /> : data.items.length === 0 ? (
          <EmptyState icon={<Siren className="h-6 w-6" />} title="No incidents" message="If the SOS button on your bus is pressed, you will see it here instantly." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {data.items.map((a) => (
              <li key={a.id} className={cx('p-5', a.status === 'active' && 'bg-red-50/60 dark:bg-red-900/10')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <IncidentTypeBadge type={a.incident_type} label={a.type_label} />
                    <span className="font-semibold">Bus {a.bus_number}</span>
                  </div>
                  <IncidentStatusBadge status={a.status} />
                </div>
                <dl className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-3 dark:text-slate-300">
                  <div>Event time: {fmtDateTime(a.created_at)} ({timeAgo(a.created_at)})</div>
                  <div>Location: {a.latitude != null ? <span className="mono">{fmtCoord(a.latitude, 5)}, {fmtCoord(a.longitude, 5)}</span> : 'not available'}</div>
                  <div>Latest update: {fmtDateTime(a.resolved_at ?? a.acknowledged_at ?? a.updated_at)}</div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
