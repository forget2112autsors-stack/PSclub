import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

function getSocket(): Socket {
  socket ??= io({ path: '/socket.io', transports: ['websocket', 'polling'] });
  return socket;
}

/**
 * Serverdan "yangilan" signalini kutadi va aloqa holatini qaytaradi.
 *
 * Aloqa uzilganini ko'rsatish TZ 7.3 va QM-7 talabi: operator ekrandagi
 * raqamlar eskirganini bilib turishi kerak.
 */
export function useRealtime(onRefresh: () => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();
    const refresh = () => onRefresh();
    const up = () => setConnected(true);
    const down = () => setConnected(false);

    s.on('refresh', refresh);
    s.on('connect', up);
    s.on('disconnect', down);
    setConnected(s.connected);

    return () => {
      s.off('refresh', refresh);
      s.off('connect', up);
      s.off('disconnect', down);
    };
  }, [onRefresh]);

  return { connected };
}
