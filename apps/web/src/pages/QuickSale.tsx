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

interface Customer {
  id: string;
  fullName: string;
  phone: string;
  balance: number;
  isBlocked: boolean;
}

const summa = (v: number) => v.toLocaleString('uz-UZ');

export function QuickSale() {
  const client = useQueryClient();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [balance, setBalance] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') });
  const shift = useQuery({ queryKey: ['shift'], queryFn: () => api<{ shift: unknown }>('/api/shifts/current') });
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => api<Customer[]>('/api/customers') });

  const list = products.data ?? [];
  const selectedCustomer = (customers.data ?? []).find((c) => c.id === customerId);

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: list.find((p) => p.id === id), qty }))
    .filter((l): l is { product: Product; qty: number } => Boolean(l.product));
  const total = lines.reduce((s, l) => s + l.product.salePrice * l.qty, 0);

  const paidCash = Number(cash) || 0;
  const paidCard = Number(card) || 0;
  const paidBalance = Number(balance) || 0;
  const totalPaid = paidCash + paidCard + paidBalance;
  const remaining = total - totalPaid;
  const canSell = lines.length > 0 && total > 0 && totalPaid >= total;

  const sell = useMutation({
    mutationFn: () => {
      const payments = [
        { method: 'CASH', amount: paidCash },
        { method: 'CARD', amount: paidCard },
        { method: 'BALANCE', amount: paidBalance },
      ].filter((p) => p.amount > 0);

      return api('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customerId || null,
          items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
          payments,
        }),
      });
    },
    onSuccess: () => {
      setCart({});
      setCash('');
      setCard('');
      setBalance('');
      setCustomerId('');
      setError(null);
      setDone(true);
      setTimeout(() => setDone(false), 2500);
      void client.invalidateQueries({ queryKey: ['products'] });
      void client.invalidateQueries({ queryKey: ['shift'] });
      void client.invalidateQueries({ queryKey: ['customers'] });
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

        <div className="space-y-2 border-t border-slate-800 pt-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400">Jami to'lov:</span>
            <span className="text-base font-semibold text-emerald-400">{summa(total)} so'm</span>
          </div>
          {total > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Kiritildi:</span>
              <span className={`font-medium ${totalPaid >= total ? 'text-emerald-400' : 'text-amber-400'}`}>
                {summa(totalPaid)} so'm
              </span>
            </div>
          )}
        </div>

        <Field label="Mijoz (ixtiyoriy)">
          <select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setBalance('');
            }}
            className={inputClass}
          >
            <option value="">Oddiy mehmon</option>
            {(customers.data ?? []).map((c) => (
              <option key={c.id} value={c.id} className="bg-slate-900">
                {c.fullName} ({c.phone}) — {summa(c.balance)} so'm
              </option>
            ))}
          </select>
        </Field>

        {selectedCustomer && (
          <div className="space-y-1 rounded-lg bg-slate-950/50 p-2.5">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Balans: <strong className="text-slate-200">{summa(selectedCustomer.balance)} so'm</strong></span>
              {selectedCustomer.balance > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const canPay = Math.min(selectedCustomer.balance, total);
                    setBalance(String(canPay));
                    const rest = Math.max(0, total - canPay);
                    setCash(String(rest));
                    setCard('0');
                  }}
                  className="text-emerald-400 underline hover:text-emerald-300"
                >
                  Balansdan to'lash
                </button>
              )}
            </div>
            <Field label="Balansdan">
              <input
                value={balance}
                onChange={(e) => setBalance(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
          </div>
        )}

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
          onClick={() => {
            setCash(String(total));
            setCard('0');
            setBalance('0');
          }}
          className="tap w-full rounded-lg bg-slate-800 py-2 text-xs transition hover:bg-slate-700"
        >
          Hammasi naqd
        </button>

        {lines.length > 0 && remaining > 0 && (
          <p className="rounded-lg bg-amber-950/40 p-2.5 text-xs text-amber-300 border border-amber-900/50">
            To'lov yetarli emas: <strong className="tabular-nums">{summa(remaining)}</strong> so'm kerak.
          </p>
        )}

        {lines.length > 0 && remaining < 0 && (
          <p className="rounded-lg bg-emerald-950/40 p-2.5 text-xs text-emerald-300 border border-emerald-900/50">
            Qaytim: <strong className="tabular-nums">{summa(-remaining)}</strong> so'm.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        {done && <p className="rounded-lg bg-emerald-950/60 px-3 py-2 text-sm text-emerald-300">Sotildi.</p>}

        <button
          type="button"
          disabled={!canSell || sell.isPending}
          onClick={() => sell.mutate()}
          className="tap w-full rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-40"
        >
          {sell.isPending ? 'Sotilmoqda…' : 'Sotish'}
        </button>
      </aside>
    </div>
  );
}
