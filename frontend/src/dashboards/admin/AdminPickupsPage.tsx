import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import { errorMessage } from '../../services/api';
import type { Bus, Pickup } from '../../services/types';
import { DataTable, Column } from '../../components/DataTable';
import { Card, ErrorState, PageHeader } from '../../components/ui';
import { PickupBadge } from '../../components/StatusBadges';
import { fmtCoord, fmtDateTime, timeAgo } from '../../components/format';

export function AdminPickupsPage() {
  const [status, setStatus] = useState('active');
  const [busId, setBusId] = useState('');
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (busId) qs.set('bus_id', busId);
  const { data, error, loading, reload } = useFetch<{ items: Pickup[] }>(`/api/admin/pickup-requests?${qs}`);
  const buses = useFetch<{ items: Bus[] }>('/api/admin/buses');
  useLiveReload(['pickup_request_created', 'pickup_request_updated'], reload);

  const columns: Column<Pickup>[] = [
    { key: 'id', header: '#', value: (p) => p.id, render: (p) => <span className="mono">#{p.id}</span> },
    { key: 'created_at', header: 'Requested', render: (p) => <div><div>{fmtDateTime(p.created_at)}</div><div className="text-xs text-slate-500">{timeAgo(p.created_at)}</div></div> },
    { key: 'student_name', header: 'Student', render: (p) => <div><div className="font-medium">{p.student_name}</div><div className="mono text-xs text-slate-500">{p.register_number}</div></div> },
    { key: 'bus_number', header: 'Bus', render: (p) => `Bus ${p.bus_number}` },
    { key: 'boarding_stop_name', header: 'Boarding stop' },
    { key: 'coords', header: 'Location', sortable: false, render: (p) => (p.latitude != null ? <span className="mono text-xs">{fmtCoord(p.latitude, 5)}, {fmtCoord(p.longitude, 5)}<br /><span className="text-slate-500">{p.location_source === 'phone_gps' ? `Phone GPS${p.location_accuracy_m ? ` ±${Math.round(p.location_accuracy_m)} m` : ''}` : 'Stop coordinates'}</span></span> : <span className="text-xs text-slate-500">No coordinates</span>) },
    { key: 'status', header: 'Status', render: (p) => <div><PickupBadge status={p.status} />{p.cancel_reason && <div className="mt-1 max-w-[200px] truncate text-xs text-slate-500" title={p.cancel_reason}>{p.cancel_reason}</div>}</div> },
  ];

  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  return (
    <>
      <PageHeader title="Pickup requests" subtitle="Every student pickup request across the fleet, updated in real time." />
      <Card>
        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          loading={loading}
          emptyTitle="No pickup requests"
          initialSort={{ key: 'id', dir: 'desc' }}
          filters={
            <>
              <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                <option value="active">Active (pending/accepted/approaching)</option>
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="approaching">Approaching</option>
                <option value="picked_up">Picked up</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select className="input w-auto" value={busId} onChange={(e) => setBusId(e.target.value)} aria-label="Filter by bus">
                <option value="">All buses</option>
                {(buses.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>Bus {b.bus_number}</option>)}
              </select>
            </>
          }
        />
      </Card>
    </>
  );
}
