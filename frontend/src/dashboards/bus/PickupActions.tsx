import { useState } from 'react';
import { Check, Navigation, UserCheck, XCircle } from 'lucide-react';
import { errorMessage, post } from '../../services/api';
import type { Pickup, PickupStatus } from '../../services/types';
import { Button, ConfirmDialog, Field } from '../../components/ui';
import { useToast } from '../../components/Toast';

const NEXT: Record<string, { status: PickupStatus; label: string; icon: JSX.Element; variant: 'primary' | 'success' }[]> = {
  pending: [{ status: 'accepted', label: 'Accept', icon: <Check className="h-3.5 w-3.5" />, variant: 'primary' }],
  accepted: [
    { status: 'approaching', label: 'Approaching', icon: <Navigation className="h-3.5 w-3.5" />, variant: 'primary' },
    { status: 'picked_up', label: 'Picked up', icon: <UserCheck className="h-3.5 w-3.5" />, variant: 'success' },
  ],
  approaching: [{ status: 'picked_up', label: 'Picked up', icon: <UserCheck className="h-3.5 w-3.5" />, variant: 'success' }],
};

export function PickupActions({ pickup, onChanged }: { pickup: Pickup; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const change = async (status: PickupStatus, why?: string) => {
    setBusy(status);
    try {
      await post(`/api/bus/pickup-requests/${pickup.id}/status`, { status, reason: why });
      toast({ type: 'success', title: `Request #${pickup.id} updated`, message: `${pickup.student_name} notified.` });
      setCancelOpen(false);
      setReason('');
      onChanged();
    } catch (err) {
      toast({ type: 'error', title: 'Update failed', message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const actions = NEXT[pickup.status] ?? [];
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button key={a.status} size="sm" variant={a.variant} icon={a.icon} loading={busy === a.status} onClick={() => change(a.status)}>
          {a.label}
        </Button>
      ))}
      <Button size="sm" variant="secondary" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setCancelOpen(true)}>Cancel</Button>
      <ConfirmDialog
        open={cancelOpen}
        title={`Cancel request #${pickup.id}?`}
        message={`${pickup.student_name} will be notified with your reason.`}
        confirmLabel="Cancel request"
        tone="danger"
        loading={busy === 'cancelled'}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => reason.trim() && change('cancelled', reason.trim())}
      >
        <Field label="Reason (required)" htmlFor={`cr-${pickup.id}`}>
          <input id={`cr-${pickup.id}`} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Route diverted, bus full" />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
