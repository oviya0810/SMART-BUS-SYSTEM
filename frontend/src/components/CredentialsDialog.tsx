import { useState } from 'react';
import { Copy, ShieldAlert } from 'lucide-react';
import { Button, Modal, Notice } from './ui';

export interface SecretItem {
  label: string;
  value: string;
  secret?: boolean;
}

/** Shows one-time secrets (initial passwords, device tokens). They cannot be retrieved again. */
export function CredentialsDialog({ open, title, items, notice, onClose }: { open: boolean; title: string; items: SecretItem[]; notice: string; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<Button onClick={onClose}>I have saved these details</Button>}>
      <Notice tone="amber" icon={<ShieldAlert className="h-4 w-4" />} title="Shown only once">
        {notice}
      </Notice>
      <dl className="mt-4 space-y-3">
        {items.map((i) => (
          <div key={i.label}>
            <dt className="label">{i.label}</dt>
            <dd className="flex items-center gap-2">
              <code className="mono flex-1 break-all rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 dark:bg-navy-950 dark:text-slate-100">{i.value}</code>
              <Button variant="secondary" size="sm" onClick={() => copy(i.label, i.value)} icon={<Copy className="h-3.5 w-3.5" />} aria-label={`Copy ${i.label}`}>
                {copied === i.label ? 'Copied' : 'Copy'}
              </Button>
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
