import { Wifi, WifiOff } from 'lucide-react';
import { useRealtime } from '../hooks/useRealtime';
import { cx } from './format';

export function ConnectionIndicator({ compact }: { compact?: boolean }) {
  const { state } = useRealtime();
  const map = {
    connected: { label: 'Live', cls: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-500' },
    connecting: { label: 'Connecting', cls: 'text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-500' },
    disconnected: { label: 'Reconnecting', cls: 'text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-500' },
    offline: { label: 'Offline', cls: 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-300', dot: 'bg-red-500' },
  }[state];
  return (
    <span
      className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', map.cls)}
      title={state === 'connected' ? 'Real-time updates connected' : 'Real-time updates unavailable — data may be out of date'}
      role="status"
    >
      {state === 'offline' ? <WifiOff className="h-3.5 w-3.5" /> : state === 'connected' ? (
        <span className="relative flex h-2 w-2">
          <span className={cx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', map.dot)} />
          <span className={cx('relative inline-flex h-2 w-2 rounded-full', map.dot)} />
        </span>
      ) : (
        <Wifi className="h-3.5 w-3.5" />
      )}
      {!compact && map.label}
    </span>
  );
}

export function OfflineBanner() {
  const { state } = useRealtime();
  if (state === 'connected' || state === 'connecting') return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-200" role="alert">
      {state === 'offline'
        ? 'Your device is offline. Showing the last loaded data — it will refresh when the network returns.'
        : 'Real-time connection lost. Reconnecting… data will reload automatically.'}
    </div>
  );
}
