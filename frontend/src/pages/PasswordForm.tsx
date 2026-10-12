import { FormEvent, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { errorMessage, fieldErrors } from '../services/api';
import type { User } from '../services/types';
import { Button, Field, Notice } from '../components/ui';
import { useToast } from '../components/Toast';

export function PasswordForm({ onDone }: { onDone?: (u: User) => void }) {
  const { changePassword } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const strong = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFields({});
    if (next !== confirm) {
      setFields({ confirm: 'Passwords do not match' });
      return;
    }
    setBusy(true);
    try {
      const u = await changePassword(current, next);
      toast({ type: 'success', title: 'Password updated' });
      setCurrent('');
      setNext('');
      setConfirm('');
      onDone?.(u);
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Notice tone="red">{error}</Notice>}
      <Field label="Current password" htmlFor="cur" error={fields.current_password}>
        <input id="cur" type="password" className="input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password" htmlFor="new" error={fields.new_password} hint="At least 8 characters with letters and digits.">
        <input id="new" type="password" className="input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={fields.confirm}>
        <input id="confirm" type="password" className="input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-800" aria-hidden>
        <div className={`h-full transition-all ${strong ? 'w-full bg-emerald-500' : next ? 'w-1/3 bg-amber-500' : 'w-0'}`} />
      </div>
      <Button type="submit" loading={busy} disabled={!current || !next || !confirm} icon={<KeyRound className="h-4 w-4" />}>
        Update password
      </Button>
    </form>
  );
}
