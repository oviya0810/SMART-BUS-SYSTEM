import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

/**
 * The Socket.IO handshake carries the same HttpOnly session cookie as the
 * REST API, so the server authenticates the connection and assigns rooms.
 */
export function createSocket(): Socket {
  return io(API_BASE || undefined, {
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    autoConnect: true,
  });
}
