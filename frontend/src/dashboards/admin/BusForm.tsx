import { FormEvent, useState } from 'react';
import { errorMessage, fieldErrors, post, put } from '../../services/api';
import type { Bus, Credentials, RouteInfo } from '../../services/types';
import { Button, Field, Modal, Notice } from '../../components/ui';

export interface DeviceSecret {
  device_id: string;
  device_token: string;
  notice: string;
}

export function BusForm({
  open,
  bus,
  routes,
  onClose,
  onSaved,
}: {
  open: boolean;
  bus?: Bus | null;
  routes: RouteInfo[];
  onClose: () => void;
  onSaved: (bus: Bus, credentials?: Credentials, device?: DeviceSecret | null) => void;
}) {
  const editing = !!bus;
  const [form, setForm] = useState({
    bus_number: bus?.bus_number ?? '',
    registration_number: bus?.registration_number ?? '',
    route_id: bus?.route_id ? String(bus.route_id) : '',
    driver_name: bus?.driver_name ?? '',
    driver_phone: bus?.driver_phone ?? '',
    capacity: String(bus?.capacity ?? 40),
    alcohol_threshold: String(bus?.alcohol_threshold ?? 2000),
    driver_rfid_uid: bus?.driver_rfid_uid ?? '',
    device_id: '',
    is_active: bus?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    const payload: Record<string, unknown> = {
      bus_number: form.bus_number,
      registration_number: form.registration_number,
      route_id: form.route_id ? Number(form.route_id) : null,
      driver_name: form.driver_name,
      driver_phone: form.driver_phone,
      capacity: Number(form.capacity),
      alcohol_threshold: Number(form.alcohol_threshold),
      driver_rfid_uid: form.driver_rfid_uid.trim() || null,
    };
    try {
      if (editing) {
        payload.is_active = form.is_active;
        const res = await put<{ bus: Bus }>(`/api/admin/buses/${bus!.id}`, payload);
        onSaved(res.bus);
      } else {
        if (form.device_id.trim()) payload.device_id = form.device_id.trim();
        const res = await post<{ bus: Bus; credentials: Credentials; device: DeviceSecret | null }>('/api/admin/buses', payload);
        onSaved(res.bus, res.credentials, res.device);
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
      title={editing ? `Edit bus ${bus!.bus_number}` : 'Register bus'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="bus-form" loading={busy}>{editing ? 'Save changes' : 'Create bus account'}</Button>
        </>
      }
    >
      <form id="bus-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        {error && <div className="sm:col-span-2"><Notice tone="red">{error}</Notice></div>}
        <Field label="Bus number" htmlFor="bf-num" error={errors.bus_number} hint={!editing ? 'Username = bus_ + number (letters/digits); initial password = Bus@<NUMBER>#360' : undefined}>
          <input id="bf-num" className="input uppercase" value={form.bus_number} onChange={(e) => set('bus_number', e.target.value)} required />
        </Field>
        <Field label="Registration number" htmlFor="bf-reg" error={errors.registration_number}>
          <input id="bf-reg" className="input uppercase" value={form.registration_number} onChange={(e) => set('registration_number', e.target.value)} placeholder="TN 38 AB 1234" required />
        </Field>
        <Field label="Driver name" htmlFor="bf-dn" error={errors.driver_name}>
          <input id="bf-dn" className="input" value={form.driver_name} onChange={(e) => set('driver_name', e.target.value)} required />
        </Field>
        <Field label="Driver phone" htmlFor="bf-dp" error={errors.driver_phone}>
          <input id="bf-dp" className="input" inputMode="tel" value={form.driver_phone} onChange={(e) => set('driver_phone', e.target.value)} required />
        </Field>
        <Field label="Driver RFID ID-card UID" htmlFor="bf-drfid" error={errors.driver_rfid_uid} hint="Driver taps this card on the bus reader to start / end duty. Hex, e.g. D1A2B3C4.">
          <input id="bf-drfid" className="input mono uppercase" value={form.driver_rfid_uid} onChange={(e) => set('driver_rfid_uid', e.target.value)} />
        </Field>
        <Field label="Total seat capacity" htmlFor="bf-cap" error={errors.capacity}>
          <input id="bf-cap" type="number" min={1} max={150} className="input" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} required />
        </Field>
        <Field label="Assigned route" htmlFor="bf-route" error={errors.route_id} hint={editing ? 'Changing the route clears students’ stops on this bus.' : undefined}>
          <select id="bf-route" className="input" value={form.route_id} onChange={(e) => set('route_id', e.target.value)}>
            <option value="">No route</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Alcohol warning threshold (raw ADC)" htmlFor="bf-alc" error={errors.alcohol_threshold} hint="ESP32 12-bit ADC: 0–4095. Calibrate on the real MQ-3 sensor.">
          <input id="bf-alc" type="number" min={1} max={4095} className="input" value={form.alcohol_threshold} onChange={(e) => set('alcohol_threshold', e.target.value)} />
        </Field>
        {!editing ? (
          <Field label="ESP32 device ID (optional)" htmlFor="bf-dev" error={errors.device_id} hint="e.g. ESP32-BUS07. A device token will be generated and shown once.">
            <input id="bf-dev" className="input mono" value={form.device_id} onChange={(e) => set('device_id', e.target.value)} />
          </Field>
        ) : (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-4 w-4 accent-electric-600" />
            Bus account active
          </label>
        )}
      </form>
    </Modal>
  );
}
