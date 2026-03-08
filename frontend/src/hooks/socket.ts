import { io, Socket } from 'socket.io-client';

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    return window.location.origin;
  }

  return 'http://localhost:3000';
}

const API_BASE_URL = resolveApiBaseUrl();

let socketInstance: Socket | null = null;

export function getParserSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(`${API_BASE_URL}/parser`, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }

  return socketInstance;
}
