import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createSocket } from '../services/socket';
import { useAuth } from './useAuth';

export type ConnState = 'connecting' | 'connected' | 'disconnected' | 'offline';

interface RealtimeCtx {
  socket: Socket | null;
  state: ConnState;
  /** increments after every (re)connect so pages can reload persisted state */
  epoch: number;
}

const Ctx = createContext<RealtimeCtx>({ socket: null, state: 'disconnected', epoch: 0 });

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<ConnState>('disconnected');
  const [online, setOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const canConnect = !!user && !user.must_change_password;
  useEffect(() => {
    if (!canConnect) {
      setSocket(null);
      setState('disconnected');
      return;
    }
    const s = createSocket();
    setSocket(s);
    setState('connecting');
    s.on('connect', () => {
      setState('connected');
      setEpoch((e) => e + 1);
    });
    s.on('disconnect', () => setState('disconnected'));
    s.on('connect_error', () => setState('disconnected'));
    return () => {
      s.removeAllListeners();
      s.disconnect();
    };
  }, [canConnect, user?.id]);

  return <Ctx.Provider value={{ socket, state: online ? state : 'offline', epoch }}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);

/** Subscribe to a server event for the lifetime of the component. */
export function useSocketEvent<T = unknown>(event: string | string[], handler: (payload: T, event: string) => void) {
  const { socket } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  const key = Array.isArray(event) ? event.join('|') : event;
  useEffect(() => {
    if (!socket) return;
    const events = key.split('|');
    const fns = events.map((ev) => {
      const fn = (payload: T) => ref.current(payload, ev);
      socket.on(ev, fn);
      return [ev, fn] as const;
    });
    return () => fns.forEach(([ev, fn]) => socket.off(ev, fn));
  }, [socket, key]);
}

/**
 * Reload REST state whenever one of `events` arrives and after every reconnect.
 * Data always comes from the database, so realtime events never create
 * client-side duplicates.
 */
export function useLiveReload(events: string[], reload: () => void, delayMs = 350) {
  const { epoch } = useRealtime();
  const timer = useRef<number | undefined>(undefined);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useSocketEvent(events, () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => reloadRef.current(), delayMs);
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reloadRef.current();
  }, [epoch]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
}
