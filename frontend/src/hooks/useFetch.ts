import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from '../services/api';

export interface FetchState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
  setData: (updater: (prev: T | null) => T | null) => void;
}

/** GET a JSON resource; keeps the previous data while reloading (no flicker). */
export function useFetch<T>(path: string | null, intervalMs?: number): FetchState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const [tick, setTick] = useState(0);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    get<T>(path, c.signal)
      .then((d) => {
        if (!c.signal.aborted) {
          setDataState(d);
          setError(null);
        }
      })
      .catch((e) => {
        if ((e as Error)?.name !== 'AbortError' && !c.signal.aborted) setError(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [path, tick]);

  useEffect(() => {
    if (!intervalMs || !path) return;
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, path]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((updater: (prev: T | null) => T | null) => setDataState((p) => updater(p)), []);
  return { data, error, loading, reload, setData };
}
