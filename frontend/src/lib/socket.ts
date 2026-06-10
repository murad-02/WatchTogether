import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

let socket: Socket | null = null;

/**
 * Returns a singleton authenticated Socket.IO connection.
 * The JWT is sent in the handshake `auth` payload and validated server-side.
 */
export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket'],
    auth: { token: getToken() },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
  });

  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  // Refresh token in case it changed since the singleton was created.
  s.auth = { token: getToken() };
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
