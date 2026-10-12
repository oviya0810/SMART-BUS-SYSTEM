import { FormEvent, useMemo, useState } from 'react';
import { errorMessage, fieldErrors, post, put } from '../../services/api';
import type { Bus, Credentials, RouteInfo, Student } from '../../services/types';
import { Button, Field, Modal, Notice } from '../../components/ui';

interface Props {
  open: boolean;
  student?: Student | null;
  buses: Bus[];
  routes: RouteInfo[];
  onClose: () => void;
  onSaved: (student: Student, credentials?: Credentials) => void;
}

export function StudentForm({ open, student, buses, routes, onClose, onSaved }: Props) {
  const editing = !!student;
  const [form, setForm] = useState(() => ({
    full_name: student?.full_name ?? '',
    register_number: student?.register_number ?? '',
    department: student?.department ?? '',
    year: String(student?.year ?? 1),
    phone: student?.phone ?? '',
    bus_id: student?.bus?.id ? String(student.bus.id) : '',
    boarding_stop_id: student?.boarding_stop?.id ? String(student.boarding_stop.id) : '',
    destination_stop_id: student?.destination_stop?.id ? String(student.destination_stop.id) : '',
    username: '',
    is_active: student?.is_active ?? true,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const bus = buses.find((b) => String(b.id) === form.bus_id);
  const stops = useMemo(() => routes.find((r) => r.id === bus?.route_id)?.stops ?? [], [routes, bus]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    const payload: Record<string, unknown> = {
      full_name: form.full_name,
      register_number: form.register_number,
      department: form.department,
      year: Number(form.year),
      phone: form.phone,
      bus_id: form.bus_id ? Number(form.bus_id) : null,
      boarding_stop_id: form.boarding_stop_id ? Number(form.boarding_stop_id) : null,
      destination_stop_id: form.destination_stop_id ? Number(form.destination_stop_id) : null,
    };
    try {
      if (editing) {
        payload.is_active = form.is_active;
        const res = await put<{ student: Student }>(`/api/admin/students/${student!.id}`, payload);
        onSaved(res.student);
      } else {
        if (form.username.trim()) payload.username = form.username.trim();
        const res = await post<{ student: Student; credentials: Credentials }>('/api/admin/students', payload);
        onSaved(res.student, res.credentials);
      }
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${student!.full_name}` : 'Register student'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="student-form" loading={busy}>{editing ? 'Save changes' : 'Create account'}</Button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        {error && <div className="sm:col-span-2"><Notice tone="red">{error}</Notice></div>}
        <Field label="Full name" htmlFor="sf-name" error={errors.full_name}>
          <input id="sf-name" className="input" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required />
        </Field>
        <Field label="College register number" htmlFor="sf-reg" error={errors.register_number}>
          <input id="sf-reg" className="input uppercase" value={form.register_number} onChange={(e) => set('register_number', e.target.value)} required />
        </Field>
        <Field label="Department" htmlFor="sf-dept" error={errors.department}>
          <input id="sf-dept" className="input" value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="e.g. ECE" required />
        </Field>
        <Field label="Year" htmlFor="sf-year" error={errors.year}>
          <select id="sf-year" className="input" value={form.year} onChange={(e) => set('year', e.target.value)}>
            {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </Field>
        <Field label="Phone number" htmlFor="sf-phone" error={errors.phone}>
          <input id="sf-phone" className="input" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} required />
        </Field>
        <Field label="Assigned bus" htmlFor="sf-bus" error={errors.bus_id}>
          <select
            id="sf-bus"
            className="input"
            value={form.bus_id}
            onChange={(e) => setForm((f) => ({ ...f, bus_id: e.target.value, boarding_stop_id: '', destination_stop_id: '' }))}
          >
            <option value="">Not assigned</option>
            {buses.filter((b) => b.is_active || String(b.id) === form.bus_id).map((b) => (
              <option key={b.id} value={b.id}>Bus {b.bus_number} — {b.route_name ?? 'no route'}</option>
            ))}
          </select>
        </Field>
        <div className="hidden sm:block" />
        <Field label="Boarding stop" htmlFor="sf-board" error={errors.boarding_stop_id} hint={bus && !bus.route_id ? 'This bus has no route yet.' : undefined}>
          <select id="sf-board" className="input" value={form.boarding_stop_id} onChange={(e) => set('boarding_stop_id', e.target.value)} disabled={!stops.length}>
            <option value="">—</option>
            {stops.map((s) => <option key={s.id} value={s.id}>{s.sequence}. {s.name}</option>)}
          </select>
        </Field>
        <Field label="Destination stop" htmlFor="sf-dest" error={errors.destination_stop_id}>
          <select id="sf-dest" className="input" value={form.destination_stop_id} onChange={(e) => set('destination_stop_id', e.target.value)} disabled={!stops.length}>
            <option value="">—</option>
            {stops.map((s) => <option key={s.id} value={s.id}>{s.sequence}. {s.name}</option>)}
          </select>
        </Field>
        {!editing ? (
          <div className="sm:col-span-2">
            <Field
              label="Username (optional override)"
              htmlFor="sf-user"
              error={errors.username}
              hint="Leave empty to generate firstname.lastname automatically. The initial password is SB@<register number>; it must be changed at first login."
            >
              <input id="sf-user" className="input" value={form.username} onChange={(e) => set('username', e.target.value.toLowerCase())} autoCapitalize="none" />
            </Field>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-4 w-4 accent-electric-600" />
            Account active (unchecking signs the student out everywhere)
          </label>
        )}
      </form>
    </Modal>
  );
}
