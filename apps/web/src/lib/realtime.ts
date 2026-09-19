import { useEffect, useRef, useState } from 'react';
import { getToken } from './api.ts';

/**
 * Yangilanishni kuzatish.
 *
 * Ilgari SSE (EventSource) ishlatilardi — server o'zgarish bo'lganda darhol
 * signal yuborardi. Vercel serversiz muhitida uzun ulanish ushlab turib
 * bo'lmaydi (funksiya bir necha soniyada o'chadi), shuning uchun davriy
 * so'rovga o'tildi.
 *
 * Buning narxi: yangilanish darhol emas, bir necha soniyadan keyin
 * ko'rinadi. TZ 9-bo'limidagi "≤ 2 soniya kechikish" chegarasiga sig'ishi
 * uchun oraliq 2 soniya qilingan. Sahifa ko'rinmayotganda so'rov
 * yuborilmaydi — bekorga trafik sarflanmaydi.
 */
const INTERVAL_MS = 2_000;

export function useRealtime(onRefresh: () => void): { connected: boolean } {
  const [connected, setConnected] = useState(true);
  const saqlangan = useRef(onRefresh);
  saqlangan.current = onRefresh;
  const oxirgiRev = useRef<string | null>(null);

  useEffect(() => {
    let toxtatilgan = false;

    const tekshir = async () => {
      if (document.hidden) return;
      const token = getToken();
      if (!token) return;

      try {
        const r = await fetch('/api/revision', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (toxtatilgan) return;
        setConnected(r.ok);
        if (!r.ok) return;

        const { rev } = (await r.json()) as { rev: string };
        // Faqat haqiqatan o'zgarish bo'lganda yangilaymiz — aks holda
        // xarita har 2 soniyada bekorga qayta yuklanardi.
        if (oxirgiRev.current !== null && oxirgiRev.current !== rev) saqlangan.current();
        oxirgiRev.current = rev;
      } catch {
        if (!toxtatilgan) setConnected(false);
      }
    };

    const id = setInterval(() => void tekshir(), INTERVAL_MS);
    // Sahifaga qaytilganda darhol yangilanadi, 2 soniya kutilmaydi.
    const onVisible = () => {
      if (!document.hidden) void tekshir();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      toxtatilgan = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { connected };
}
