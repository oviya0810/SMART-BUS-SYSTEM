import { useState } from 'react';
import { Download, KeyRound, Pencil, Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { API_BASE, errorMessage, post } from '../../services/api';
import type { Bus, Credentials, Pickup, RouteInfo, Student } from '../../services/types';
import { DataTable, Column } from '../../components/DataTable';
import { Badge, Button, Card, ConfirmDialog, ErrorState, Modal, PageHeader, StatItem } from '../../components/ui';
import { ActiveBadge, PickupBadge } from '../../components/StatusBadges';
import { CredentialsDialog } from '../../components/CredentialsDialog';
import { useToast } from '../../components/Toast';
import { fmtDateTime } from '../../components/format';
import { StudentForm } from './StudentForm';

interface StudentDetail {
  student: Student;
  pickup_requests: Pickup[];
  last_location: { latitude: number; longitude: number; recorded_at: string } | null;
}

export function StudentsPage() {
  const toast = useToast();
  const [busFilter, setBusFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const qs = new URLSearchParams();
  if (busFilter) qs.set('bus_id', busFilter);
  if (activeFilter) qs.set('active', activeFilter);
  const list = useFetch<{ items: Student[] }>(`/api/admin/students?${qs}`);
  const buses = useFetch<{ items: Bus[] }>('/api/admin/buses');
  const routes = useFetch<{ items: RouteInfo[] }>('/api/admin/routes');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [creds, setCreds] = useState<{ title: string; c: Credentials } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const detail = useFetch<StudentDetail>(detailId ? `/api/admin/students/${detailId}` : null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const columns: Column<Student>[] = [
    {
      key: 'full_name',
      header: 'Student',
      render: (s) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-white">{s.full_name}</div>
          <div className="text-xs text-slate-500">@{s.username}</div>
        </div>
      ),
    },
    { key: 'register_number', header: 'Register no.', render: (s) => <span className="mono">{s.register_number}</span> },
    { key: 'department', header: 'Dept / Year', value: (s) => `${s.department} ${s.year}`, render: (s) => `${s.department} · Y${s.year}` },
    { key: 'bus', header: 'Bus', value: (s) => s.bus?.bus_number ?? '', render: (s) => (s.bus ? <Badge tone="blue">Bus {s.bus.bus_number}</Badge> : <span className="text-slate-400">—</span>) },
    { key: 'stop', header: 'Boarding → Destination', value: (s) => s.boarding_stop?.name ?? '', render: (s) => `${s.boarding_stop?.name ?? '—'} → ${s.destination_stop?.name ?? '—'}` },
    { key: 'is_active', header: 'Status', value: (s) => (s.is_active ? 1 : 0), render: (s) => <div className="flex gap-1"><ActiveBadge active={s.is_active} />{s.must_change_password && <Badge tone="amber">First login</Badge>}</div> },
  ];

  const resetPassword = async () => {
    if (!detailId) return;
    setResetting(true);
    try {
      const res = await post<{ credentials: Credentials }>(`/api/admin/students/${detailId}/reset-password`);
      setConfirmReset(false);
      setCreds({ title: 'Temporary password', c: res.credentials });
    } catch (err) {
      toast({ type: 'error', title: 'Reset failed', message: errorMessage(err) });
    } finally {
      setResetting(false);
    }
  };

  if (list.error && !list.data) return <Card><ErrorState message={errorMessage(list.error)} onRetry={list.reload} /></Card>;
  const d = detail.data;

  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Register students and assign buses and stops."
        actions={
          <>
            <a href={`${API_BASE}/api/admin/reports?type=students&format=csv`} className="inline-flex">
              <Button variant="secondary" icon={<Download className="h-4 w-4" />}>Export CSV</Button>
            </a>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Add student</Button>
          </>
        }
      />
      <Card>
        <DataTable
          rows={list.data?.items ?? []}
          columns={columns}
          loading={list.loading}
          searchPlaceholder="Search name, register no., username…"
          emptyTitle="No students yet"
          emptyMessage="Use “Add student” to create the first account."
          onRowClick={(s) => setDetailId(s.id)}
          initialSort={{ key: 'full_name', dir: 'asc' }}
          filters={
            <>
              <select className="input w-auto" value={busFilter} onChange={(e) => setBusFilter(e.target.value)} aria-label="Filter by bus">
                <option value="">All buses</option>
                {(buses.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>Bus {b.bus_number}</option>)}
              </select>
              <select className="input w-auto" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} aria-label="Filter by status">
                <option value="">Any status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </>
          }
        />
      </Card>

      {formOpen && (
        <StudentForm
          open
          student={editing}
          buses={buses.data?.items ?? []}
          routes={routes.data?.items ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={(s, c) => {
            setFormOpen(false);
            list.reload();
            if (detailId) detail.reload();
            toast({ type: 'success', title: editing ? 'Student updated' : 'Student account created', message: s.full_name });
            if (c) setCreds({ title: 'Student login credentials', c });
          }}
        />
      )}

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={d ? d.student.full_name : 'Student'} size="lg"
        footer={d && (
          <>
            <Button variant="secondary" icon={<KeyRound className="h-4 w-4" />} onClick={() => setConfirmReset(true)}>Reset password</Button>
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditing(d.student); setFormOpen(true); }}>Edit</Button>
          </>
        )}
      >
        {!d ? <p className="py-8 text-center text-sm text-slate-500">Loading…</p> : (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatItem label="Register no." value={d.student.register_number} />
              <StatItem label="Username" value={`@${d.student.username}`} />
              <StatItem label="Department" value={`${d.student.department} · Year ${d.student.year}`} />
              <StatItem label="Phone" value={d.student.phone} />
              <StatItem label="Bus" value={d.student.bus ? `Bus ${d.student.bus.bus_number}` : 'Not assigned'} sub={d.student.bus?.route_name} />
              <StatItem label="Boarding stop" value={d.student.boarding_stop?.name ?? '—'} />
              <StatItem label="Destination stop" value={d.student.destination_stop?.name ?? '—'} />
              <StatItem label="Last shared location" value={d.last_location ? fmtDateTime(d.last_location.recorded_at) : 'Never'} />
            </dl>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Pickup request history</h3>
              {d.pickup_requests.length === 0 ? <p className="text-sm text-slate-500">No requests yet.</p> : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-navy-800 dark:border-navy-800">
                  {d.pickup_requests.slice(0, 20).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>#{p.id} · {p.boarding_stop_name} · Bus {p.bus_number}</span>
                      <span className="flex items-center gap-2 text-xs text-slate-500">{fmtDateTime(p.created_at)} <PickupBadge status={p.status} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmReset}
        title="Reset password?"
        message="A random temporary password will be generated and shown once. The student will be signed out and must set a new password at next login."
        confirmLabel="Reset password"
        tone="danger"
        loading={resetting}
        onConfirm={resetPassword}
        onClose={() => setConfirmReset(false)}
      />
      {creds && (
        <CredentialsDialog
          open
          title={creds.title}
          notice={creds.c.notice}
          items={[{ label: 'Username', value: creds.c.username }, { label: creds.c.initial_password ? 'Initial password' : 'Temporary password', value: (creds.c.initial_password ?? creds.c.temporary_password)! }]}
          onClose={() => setCreds(null)}
        />
      )}
    </>
  );
}
