import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { useLiveReload, useSocketEvent } from '../hooks/useRealtime';
import { post } from '../services/api';
import type { AppNotification } from '../services/types';
import { cx, timeAgo } from './format';
import { useToast } from './Toast';

export function NotificationCenter() {
  const { data, reload } = useFetch<{ items: AppNotification[]; unread: number }>('/api/notifications');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useLiveReload([], reload);
  useSocketEvent<AppNotification>('notification', (n) => {
    reload();
    toast({ type: n.severity === 'critical' ? 'critical' : n.severity === 'warning' ? 'warning' : 'info', title: n.title, message: n.message });
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const markAll = async () => {
    await post('/api/notifications/read', {}).catch(() => undefined);
    reload();
  };

  const unread = data?.unread ?? 0;
  const sev = { critical: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-electric-500' };
  return (
    <div className="relative" ref={ref}>
      <button
        className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications (${unread} unread)`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-[1100] mt-2 w-[min(92vw,380px)] animate-fadeIn overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop dark:border-navy-700 dark:bg-navy-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-navy-800">
            <p className="text-sm font-semibold">Notifications</p>
            <button onClick={markAll} className="inline-flex items-center gap-1 text-xs font-medium text-electric-600 hover:underline dark:text-electric-400" disabled={!unread}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {!data?.items.length ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">You’re all caught up.</p>
            ) : (
              data.items.map((n) => (
                <div key={n.id} className={cx('flex gap-3 border-b border-slate-50 px-4 py-3 last:border-0 dark:border-navy-800', !n.is_read && 'bg-electric-50/40 dark:bg-electric-900/10')}>
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', sev[n.severity])} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{n.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{n.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
