import { createContext, ReactNode, useCallback, useContext, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Siren, X } from 'lucide-react';
import { cx } from './format';

type ToastType = 'success' | 'error' | 'info' | 'warning' | 'critical';
interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++seq;
      setToasts((list) => [...list.slice(-4), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.type === 'critical' ? 15000 : t.type === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );
  const style: Record<ToastType, { icon: ReactNode; cls: string }> = {
    success: { icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />, cls: '' },
    info: { icon: <Info className="h-5 w-5 text-electric-500" />, cls: '' },
    warning: { icon: <AlertTriangle className="h-5 w-5 text-amber-500" />, cls: '' },
    error: { icon: <AlertTriangle className="h-5 w-5 text-red-500" />, cls: '' },
    critical: { icon: <Siren className="h-5 w-5 text-white" />, cls: '!bg-red-600 !text-white !border-red-700' },
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[1500] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'critical' || t.type === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex w-full max-w-sm animate-fadeIn items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-pop dark:border-navy-700 dark:bg-navy-900',
              style[t.type].cls,
            )}
          >
            <div className="mt-0.5 shrink-0">{style[t.type].icon}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.message && <p className="mt-0.5 text-sm opacity-80">{t.message}</p>}
            </div>
            <button className="rounded p-0.5 opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
