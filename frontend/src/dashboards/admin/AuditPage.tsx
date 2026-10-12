import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { errorMessage } from '../../services/api';
import { DataTable, Column } from '../../components/DataTable';
import { Badge, Card, ErrorState, PageHeader } from '../../components/ui';
import { fmtDateTime } from '../../components/format';

interface Entry {
  id: number;
  actor: string;
  actor_type: string;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export function AuditPage() {
  const [prefix, setPrefix] = useState('');
  const { data, error, loading, reload } = useFetch<{ items: Entry[] }>(`/api/admin/audit-logs${prefix ? `?action=${prefix}` : ''}`);
  const columns: Column<Entry>[] = [
    { key: 'created_at', header: 'Time', render: (e) => fmtDateTime(e.created_at) },
    { key: 'actor', header: 'Actor', render: (e) => <span><Badge tone={e.actor_type === 'device' ? 'cyan' : e.actor_type === 'system' ? 'neutral' : 'blue'}>{e.actor_type}</Badge> <span className="ml-1">{e.actor}</span></span> },
    { key: 'action', header: 'Action', render: (e) => <span className="mono text-xs">{e.action}</span> },
    { key: 'entity', header: 'Entity', value: (e) => `${e.entity_type ?? ''} ${e.entity_id ?? ''}`, render: (e) => (e.entity_type ? `${e.entity_type} #${e.entity_id ?? '—'}` : '—') },
    { key: 'details', header: 'Details', sortable: false, value: (e) => JSON.stringify(e.details ?? {}), render: (e) => <span className="mono block max-w-[360px] truncate text-xs text-slate-500" title={JSON.stringify(e.details)}>{e.details && Object.keys(e.details).length ? JSON.stringify(e.details) : '—'}</span> },
    { key: 'ip_address', header: 'IP', render: (e) => <span className="mono text-xs">{e.ip_address ?? '—'}</span> },
  ];
  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  return (
    <>
      <PageHeader title="Audit log" subtitle="Append-only history of security-relevant actions (latest 300). Secrets are redacted." />
      <Card>
        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          loading={loading}
          pageSize={20}
          initialSort={{ key: 'created_at', dir: 'desc' }}
          filters={
            <select className="input w-auto" value={prefix} onChange={(e) => setPrefix(e.target.value)} aria-label="Filter by action">
              <option value="">All actions</option>
              <option value="auth">Authentication</option>
              <option value="student">Students</option>
              <option value="bus">Buses</option>
              <option value="device">Devices</option>
              <option value="driver">Driver duty</option>
              <option value="pickup">Pickups</option>
              <option value="incident">Incidents</option>
              <option value="alcohol">Alcohol</option>
              <option value="route">Routes</option>
            </select>
          }
        />
      </Card>
    </>
  );
}
