import { useEffect, useState } from 'react';

let source: EventSource | null = null;
const listeners = new Set<() => void>();
const stateListeners = new Set<(up: boolean) => void>();

/** Bitta ulanish hamma sahifaga yetadi — har biri o'zinikini ochmaydi. */
function ensureSource(): EventSource {
  if (source) return source;

  const es = new EventSource('/api/stream');
  es.addEventListener('refresh', () => {
    for (const fn of listeners) fn();
  });
  es.onopen = () => {
    for (const fn of stateListeners) fn(true);
  };
  // EventSource uzilganda o'zi qayta ulanadi — qo'shimcha mantiq kerak emas.
  es.onerror = () => {
    for (const fn of stateListeners) fn(false);
  };
  source = es;
  return es;
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
    const es = ensureSource();
    setConnected(es.readyState === EventSource.OPEN);

    listeners.add(onRefresh);
    stateListeners.add(setConnected);
    return () => {
      listeners.delete(onRefresh);
      stateListeners.delete(setConnected);
    };
  }, [onRefresh]);

  return { connected };
}
