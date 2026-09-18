import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '../lib/api.ts';
import { Field, inputClass } from '../components/Modal.tsx';

interface Product {
  id: string;
  name: string;
  salePrice: number;
  stockQty: number;
  isQuickKey: boolean;
  category: { name: string } | null;
}

const summa = (v: number) => v.toLocaleString('uz-UZ');

export function QuickSale() {
  const client = useQueryClient();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') });
  const shift = useQuery({ queryKey: ['shift'], queryFn: () => api<{ shift: unknown }>('/api/shifts/current') });

  const list = products.data ?? [];
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: list.find((p) => p.id === id), qty }))
    .filter((l): l is { product: Product; qty: number } => Boolean(l.product));
  const total = lines.reduce((s, l) => s + l.product.salePrice * l.qty, 0);

  const sell = useMutation({
    mutationFn: () =>
      api('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
          payments: [
            { method: 'CASH', amount: Number(cash) || 0 },
            { method: 'CARD', amount: Number(card) || 0 },
          ].filter((p) => p.amount > 0),
        }),
      }),
    onSuccess: () => {
      setCart({});
      setCash('');
      setCard('');
      setError(null);
      setDone(true);
      setTimeout(() => setDone(false), 2500);
      void client.invalidateQueries({ queryKey: ['products'] });
      void client.invalidateQueries({ queryKey: ['shift'] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Kutilmagan xatolik.'),
  });

  const add = (id: string) => {
    setError(null);
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  };
  const drop = (id: string) =>
    setCart((c) => {
      const next = { ...c };
      if ((next[id] ?? 0) <= 1) delete next[id];
      else next[id] -= 1;
      return next;
    });

  if (!shift.data?.shift) {
    return (
      <div>
        <h1 className="mb-2 text-xl font-semibold">Tez kassa</h1>
        <p className="text-sm text-amber-400">Smena ochilmagan — avval Smena oynasidan oching.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section>
        <h1 className="mb-4 text-xl font-semibold">Tez kassa</h1>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={p.stockQty <= (cart[p.id] ?? 0)}
              onClick={() => add(p.id)}
              className="tap rounded-xl bg-slate-800 p-3 text-left transition hover:bg-slate-700 disabled:opacity-40"
            >
              <span className="block text-sm">{p.name}</span>
              <span className="block text-xs text-slate-400">{summa(p.salePrice)} so'm</span>
              <span className={`block text-xs ${p.stockQty <= 5 ? 'text-amber-400' : 'text-slate-500'}`}>
                qoldiq {p.stockQty}
              </span>
            </button>
          ))}
          {list.length === 0 && (
            <p className="text-sm text-slate-500">Mahsulot yo'q — Ombor oynasidan qo'shing.</p>
          )}
        </div>
      </section>

      <aside className="space-y-4 rounded-xl bg-slate-900 p-4">
        <h2 className="text-sm font-medium text-slate-300">Savat</h2>

        {lines.length === 0 ? (
          <p className="text-sm text-slate-500">Bo'sh. Mahsulotni bosing.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {lines.map((l) => (
              <li key={l.product.id} className="flex items-center justify-between gap-2">
                <span className="flex-1">{l.product.name}</span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => drop(l.product.id)}
                    className="tap rounded bg-slate-800 px-2 hover:bg-slate-700"
                  >
                    −
                  </button>
                  <span className="w-6 text-center tabular-nums">{l.qty}</span>
                  <button
                    type="button"
                    disabled={l.qty >= l.product.stockQty}
                    onClick={() => add(l.product.id)}
                    className="tap rounded bg-slate-800 px-2 hover:bg-slate-700 disabled:opacity-40"
                  >
                    +
                  </button>
                </span>
                <span className="w-20 text-right tabular-nums">{summa(l.product.salePrice * l.qty)}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="border-t border-slate-800 pt-3 text-right">
          Jami: <span className="font-medium text-emerald-400">{summa(total)}</span> so'm
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Naqd">
            <input
              value={cash}
              onChange={(e) => setCash(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
          <Field label="Karta">
            <input
              value={card}
              onChange={(e) => setCard(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={() => setCash(String(total))}
          className="tap w-full rounded-lg bg-slate-800 py-2 text-xs transition hover:bg-slate-700"
        >
          Hammasi naqd
        </button>

        {error && (
          <p role="alert" className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        {done && <p className="rounded-lg bg-emerald-950/60 px-3 py-2 text-sm text-emerald-300">Sotildi.</p>}

        <button
          type="button"
          disabled={lines.length === 0 || sell.isPending}
          onClick={() => sell.mutate()}
          className="tap w-full rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-40"
        >
          {sell.isPending ? 'Sotilmoqda…' : 'Sotish'}
        </button>
      </aside>
    </div>
  );
}
