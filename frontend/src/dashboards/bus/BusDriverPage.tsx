import { IdCard, Info } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import { errorMessage } from '../../services/api';
import type { DriverDuty, DriverEvent } from '../../services/types';
import { DataTable, Column } from '../../components/DataTable';
import { Badge, Card, CardHeader, ErrorState, Notice, PageHeader, SkeletonRows, StatItem } from '../../components/ui';
import { DutyBadge } from '../../components/StatusBadges';
import { fmtDateTime, timeAgo } from '../../components/format';

export function BusDriverPage() {
  const { data, error, loading, reload } = useFetch<{ duty: DriverDuty; card_registered: boolean; events: DriverEvent[] }>('/api/bus/driver-duty', 30000);
  useLiveReload(['driver_rfid_event'], reload, 100);
  const columns: Column<DriverEvent>[] = [
    { key: 'received_at', header: 'Time', render: (e) => <div><div>{fmtDateTime(e.device_timestamp)}</div><div className="text-xs text-slate-500">{timeAgo(e.received_at)}</div></div> },
    { key: 'action', header: 'Action', render: (e) => (e.action === 'duty_start' ? 'Duty started' : e.action === 'duty_end' ? 'Duty ended' : '—') },
    { key: 'driver_name', header: 'Driver', render: (e) => e.driver_name ?? <span className="text-slate-400">—</span> },
    { key: 'card_uid', header: 'Card UID', render: (e) => <span className="mono text-xs">{e.card_uid}</span> },
    { key: 'result', header: 'Result', render: (e) => <Badge tone={e.authorized ? 'green' : 'red'} dot>{e.result_label}</Badge> },
  ];
  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  const duty = data?.duty;
  return (
    <>
      <PageHeader title="Driver duty" subtitle="The driver taps the ID card on the bus RFID reader to start and end duty." actions={<DutyBadge duty={duty} />} />
      {data && !data.card_registered && (
        <div className="mb-4"><Notice tone="amber" icon={<Info className="h-4 w-4" />}>No driver ID card is registered for this bus. Ask the administrator to add the card UID in Buses &amp; Devices.</Notice></div>
      )}
      <Card className="mb-4">
        <CardHeader title="Current status" icon={<IdCard className="h-5 w-5" />} />
        {!duty ? <SkeletonRows rows={2} /> : (
          <dl className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
            <StatItem label="Status" value={duty.on_duty ? 'On duty' : duty.state === 'off_duty' ? 'Off duty' : 'No tap yet'} />
            <StatItem label="Driver" value={duty.driver_name ?? '—'} />
            <StatItem label={duty.on_duty ? 'On duty since' : 'Last change'} value={duty.since ? timeAgo(duty.since) : '—'} sub={fmtDateTime(duty.since)} />
            <StatItem label="Last card tap" value={duty.last_tap_at ? timeAgo(duty.last_tap_at) : 'Never'} sub={duty.last_tap_result ? duty.last_tap_result.replace(/_/g, ' ') : undefined} />
          </dl>
        )}
      </Card>
      <Card>
        <CardHeader title="Card tap history" subtitle="Latest 200 taps reported by the bus hardware. Unknown cards are flagged and the office is notified." />
        <DataTable rows={data?.events ?? []} columns={columns} loading={loading} emptyTitle="No driver card taps yet" initialSort={{ key: 'received_at', dir: 'desc' }} />
      </Card>
    </>
  );
}
