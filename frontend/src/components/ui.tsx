import { ButtonHTMLAttributes, ReactNode, useEffect, useId, useRef } from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import { cx } from './format';

/* ------------------------------------------------------------------ Button */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-electric-600 text-white hover:bg-electric-700 shadow-sm shadow-electric-600/20',
  secondary:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 dark:bg-navy-900 dark:text-slate-200 dark:border-navy-700 dark:hover:bg-navy-800',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Card */
export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('card', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-navy-800">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 text-electric-600 dark:text-electric-400">{icon}</div>}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Badge */
export type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'cyan' | 'violet';
const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-navy-800 dark:text-slate-300 dark:ring-navy-700',
  blue: 'bg-electric-50 text-electric-700 ring-electric-200 dark:bg-electric-900/40 dark:text-electric-300 dark:ring-electric-800',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800',
  red: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:ring-cyan-800',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800',
};
const DOTS: Record<Tone, string> = {
  neutral: 'bg-slate-400', blue: 'bg-electric-500', green: 'bg-emerald-500', amber: 'bg-amber-500',
  red: 'bg-red-500', cyan: 'bg-cyan-500', violet: 'bg-violet-500',
};

export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', DOTS[tone])} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ KPI */
export function KpiCard({
  label,
  value,
  icon,
  tone = 'blue',
  hint,
  loading,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: Tone;
  hint?: ReactNode;
  loading?: boolean;
}) {
  const iconTone: Record<Tone, string> = {
    neutral: 'bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-300',
    blue: 'bg-electric-50 text-electric-600 dark:bg-electric-900/40 dark:text-electric-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300',
    cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300',
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          {loading ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="mono mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>}
        </div>
        <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', iconTone[tone])}>{icon}</div>
      </div>
      {hint && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </Card>
  );
}

/* ------------------------------------------------------------------ states */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-slate-200/80 dark:bg-navy-800', className)} />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ title, message, icon, action }: { title: string; message?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-navy-800 dark:text-slate-500">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-900/30">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Could not load data</p>
      <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = 'amber', title, children, icon }: { tone?: Tone; title?: string; children: ReactNode; icon?: ReactNode }) {
  const map: Record<Tone, string> = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200',
    red: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200',
    blue: 'border-electric-200 bg-electric-50 text-electric-900 dark:border-electric-800 dark:bg-electric-900/20 dark:text-electric-200',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200',
    neutral: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-200',
    violet: 'border-violet-200 bg-violet-50 text-violet-900',
  };
  return (
    <div className={cx('flex gap-3 rounded-xl border px-4 py-3 text-sm', map[tone])} role="status">
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ form */
export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ modal */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx('relative flex max-h-[92vh] w-full animate-fadeIn flex-col rounded-t-2xl bg-white shadow-pop dark:bg-navy-900 sm:rounded-2xl', widths[size])}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-navy-800">
          <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-white">
            {title}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-navy-800" aria-label="Close dialog">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-navy-800">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'primary',
  loading,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger' | 'success';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600 dark:text-slate-300">{message}</div>
      {children && <div className="mt-4">{children}</div>}
    </Modal>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}…
    </div>
  );
}

export function StatItem({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mono mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-white">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</dd>}
    </div>
  );
}
