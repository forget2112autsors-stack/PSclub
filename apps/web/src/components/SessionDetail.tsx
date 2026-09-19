import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '../lib/api.ts';
import { isManager, useAuth } from '../store/auth.ts';
import { Field, Modal, inputClass } from './Modal.tsx';

interface Detail {
  id: string;
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'CANCELLED';
  cancelReason?: string | null;
  startedAt: string;
  station: { id: string; number: number; type: string };
  customer: { id: string; fullName: string; balance: number } | null;
  gamepads: number;
  paymentMode: 'PREPAID' | 'POSTPAID';
  creditLimit: number;
  items: { id: string; name: string; qty: number; unitPrice: number; amount: number }[];
  payments: { method: string; amount: number }[];
  segments: { tariffName: string; billedMinutes: number; amount: number }[];
  totals: {
    gameAmount: number;
    itemsAmount: number;
    discount: number;
    totalAmount: number;
    paidAmount: number;
    debt: number;
    creditExceeded: boolean;
    canAddService: boolean;
    addBlockReason: string | null;
    closeBlockReason: string | null;
  };
  warnings: string[];
}

interface Split {
  totalAmount: number;
  paidAmount: number;
  remaining: number;
  shares: number[];
}

interface Product {
  id: string;
  name: string;
  salePrice: number;
  stockQty: number;
  isQuickKey: boolean;
}

interface MapStation {
  id: string;
  number: number;
  type: string;
  status: 'FREE' | 'BUSY' | 'OUT_OF_SERVICE';
}

const summa = (v: number) => v.toLocaleString('uz-UZ');

export function SessionDetail({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [balance, setBalance] = useState('');
  const [discount, setDiscount] = useState('');
  const [returned, setReturned] = useState('');
  const [shares, setShares] = useState(0);
  const [moving, setMoving] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [canceling, setCanceling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const manager = isManager(useAuth((s) => s.user));

  const detail = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api<Detail>(`/api/sessions/${sessionId}`),
    refetchInterval: 15_000,
  });
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') });
  const mapQuery = useQuery({
    queryKey: ['map'],
    queryFn: () => api<{ stations: MapStation[] }>('/api/map'),
    enabled: moving,
  });

  const splitQuery = useQuery({
    queryKey: ['split', sessionId, shares],
    queryFn: () => api<Split>(`/api/sessions/${sessionId}/split?shares=${shares}`),
    enabled: shares > 1,
  });
  const split = shares > 1 ? splitQuery.data : null;

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['session', sessionId] });
    void client.invalidateQueries({ queryKey: ['map'] });
    void client.invalidateQueries({ queryKey: ['products'] });
  };
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : 'Kutilmagan xatolik.');

  const raiseLimit = useMutation({
    mutationFn: () =>
      api(`/api/sessions/${sessionId}/credit-limit`, {
        method: 'PATCH',
        body: JSON.stringify({ creditLimit: (detail.data?.creditLimit ?? 0) + 100_000 }),
      }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError,
  });

  const act = useMutation({
    mutationFn: (path: string) => api(`/api/sessions/${sessionId}/${path}`, { method: 'POST' }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError,
  });

  const move = useMutation({
    mutationFn: () =>
      api(`/api/sessions/${sessionId}/move`, {
        method: 'POST',
        body: JSON.stringify({ stationId: moveTarget }),
      }),
    onSuccess: () => {
      setMoving(false);
      setError(null);
      refresh();
    },
    onError,
  });

  const cancel = useMutation({
    mutationFn: () =>
      api(`/api/sessions/${sessionId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason }),
      }),
    onSuccess: () => {
      setCanceling(false);
      refresh();
      onClose();
    },
    onError,
  });

  const restore = useMutation({
    mutationFn: () =>
      api(`/api/sessions/${sessionId}/restore`, {
        method: 'POST',
      }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError,
  });

  const addItem = useMutation({
    mutationFn: (productId: string) =>
      api(`/api/sessions/${sessionId}/items`, {
        method: 'POST',
        body: JSON.stringify({ productId, qty: 1 }),
      }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError,
  });

  const dropItem = useMutation({
    mutationFn: (itemId: string) =>
      api(`/api/sessions/${sessionId}/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError,
  });

  const close = useMutation({
    mutationFn: () => {
      const payments = [
        { method: 'CASH' as const, amount: Number(cash) || 0 },
        { method: 'CARD' as const, amount: Number(card) || 0 },
        { method: 'BALANCE' as const, amount: Number(balance) || 0 },
      ].filter((p) => p.amount > 0);

      return api(`/api/sessions/${sessionId}/close`, {
        method: 'POST',
        body: JSON.stringify({
          payments,
          discount: Number(discount) || 0,
          gamepadsReturned: returned === '' ? null : Number(returned),
        }),
      });
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError,
  });

  const d = detail.data;
  const due = d ? d.totals.totalAmount - d.totals.paidAmount : 0;
  const quick = (products.data ?? []).filter((p) => p.isQuickKey && p.stockQty > 0).slice(0, 12);

  return (
    <Modal title={d ? `${d.station.number}-joy — seans` : 'Seans'} onClose={onClose} wide>
      {!d ? (
        <p className="text-sm text-slate-400">Yuklanmoqda…</p>
      ) : (
        <div className="space-y-5">
          {d.warnings.map((w) => (
            <p key={w} className="rounded-lg bg-amber-950/60 px-4 py-2.5 text-sm text-amber-300">
              {w}
            </p>
          ))}
          {[d.totals.addBlockReason, d.totals.closeBlockReason]
            .filter((x): x is string => Boolean(x))
            .map((reason) => (
              <p key={reason} role="alert" className="rounded-lg bg-red-950/60 px-4 py-2.5 text-sm text-red-300">
                {reason}
              </p>
            ))}

          <section className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-400">O'yin</p>
              <p className="font-medium">{summa(d.totals.gameAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Bufet</p>
              <p className="font-medium">{summa(d.totals.itemsAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Jami</p>
              <p className="font-medium text-emerald-400">{summa(d.totals.totalAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">To'langan</p>
              <p className="font-medium">{summa(d.totals.paidAmount)}</p>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs text-slate-400">Tarif bo'yicha</h3>
            <ul className="space-y-1 text-sm">
              {d.segments.map((s, i) => (
                <li key={i} className="flex justify-between text-slate-300">
                  <span>
                    {s.tariffName} · {s.billedMinutes} daq
                  </span>
                  <span>{summa(s.amount)}</span>
                </li>
              ))}
              {d.segments.length === 0 && <li className="text-slate-500">Hali hisoblanmadi.</li>}
            </ul>
          </section>

          {d.status !== 'CLOSED' && (
            <section>
              <h3 className="mb-2 text-xs text-slate-400">Bufet — tez tugmalar</h3>
              {quick.length === 0 ? (
                <p className="text-sm text-slate-500">Tez tugmali mahsulot yo'q.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {quick.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!d.totals.canAddService || addItem.isPending}
                      onClick={() => addItem.mutate(p.id)}
                      className="tap rounded-lg bg-slate-800 px-3 py-2 text-sm transition hover:bg-slate-700 disabled:opacity-40"
                    >
                      {p.name} · {summa(p.salePrice)}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {d.items.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs text-slate-400">Qo'shilgan</h3>
              <ul className="space-y-1 text-sm">
                {d.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between">
                    <span>
                      {item.name} × {item.qty}
                    </span>
                    <span className="flex items-center gap-3">
                      <span>{summa(item.amount)}</span>
                      {d.status !== 'CLOSED' && (
                        <button
                          type="button"
                          onClick={() => dropItem.mutate(item.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          olib tashlash
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-red-950/60 px-4 py-2.5 text-sm text-red-300">
              {error}
            </p>
          )}

          {split && (
            <section className="rounded-xl bg-slate-950/60 p-4 text-sm">
              <p className="mb-2 text-xs text-slate-400">
                Qoldiq {summa(split.remaining)} so'm — {split.shares.length} kishiga
              </p>
              <ul className="space-y-1">
                {split.shares.map((part, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{i + 1}-mijoz</span>
                    <span className="tabular-nums">{summa(part)} so'm</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {d.status === 'CANCELLED' && (
            <div className="rounded-xl border border-red-800/50 bg-red-950/40 p-4 text-sm text-red-200">
              <p className="font-semibold">Seans bekor qilingan</p>
              {d.cancelReason && <p className="mt-1 text-xs text-red-300">Sabab: {d.cancelReason}</p>}
              {manager && (
                <button
                  type="button"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate()}
                  className="tap mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {restore.isPending ? 'Tiklanmoqda…' : 'Bekor qilingan seansni qayta tiklash'}
                </button>
              )}
            </div>
          )}

          {d.status !== 'CLOSED' && d.status !== 'CANCELLED' && !closing && !moving && !canceling && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => act.mutate(d.status === 'PAUSED' ? 'resume' : 'pause')}
                className="tap rounded-lg bg-slate-800 px-4 py-2.5 text-sm transition hover:bg-slate-700"
              >
                {d.status === 'PAUSED' ? 'Davom ettirish' : 'To\'xtatish'}
              </button>

              <label className="tap flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2.5 text-sm">
                <span className="text-slate-400">Bo'lish:</span>
                <select
                  value={shares}
                  onChange={(e) => setShares(Number(e.target.value))}
                  className="bg-transparent outline-none"
                >
                  {[0, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n} className="bg-slate-900">
                      {n === 0 ? 'yo\'q' : `${n} kishi`}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setMoving(true)}
                className="tap rounded-lg bg-slate-800 px-4 py-2.5 text-sm transition hover:bg-slate-700"
              >
                Joyni ko'chirish
              </button>

              {manager && (
                <button
                  type="button"
                  onClick={() => setCanceling(true)}
                  className="tap rounded-lg border border-red-900/60 bg-red-950/60 px-4 py-2.5 text-sm text-red-300 transition hover:bg-red-900/80"
                >
                  Bekor qilish
                </button>
              )}

              {manager && d.totals.creditExceeded && (
                <button
                  type="button"
                  onClick={() => raiseLimit.mutate()}
                  className="tap rounded-lg bg-amber-700 px-4 py-2.5 text-sm transition hover:bg-amber-600"
                >
                  Limitni oshirish (+100 000)
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setCash(String(due > 0 ? due : 0));
                  setCard('0');
                  setBalance('0');
                  setDiscount('0');
                  setReturned(String(d.gamepads));
                  setClosing(true);
                }}
                className="tap rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium transition hover:bg-emerald-500"
              >
                Hisobni yopish
              </button>
            </div>
          )}

          {moving && (
            <section className="space-y-3 rounded-xl bg-slate-950/60 p-4">
              <h3 className="text-sm font-medium">Boshqa bo'sh joyga ko'chirish</h3>
              {(mapQuery.data?.stations ?? []).filter((s) => s.status === 'FREE' && s.id !== d.station.id).length ===
              0 ? (
                <p className="text-xs text-amber-400">Ko'chirish uchun bo'sh joylar yo'q.</p>
              ) : (
                <Field label="Yangi joy">
                  <select
                    value={moveTarget}
                    onChange={(e) => setMoveTarget(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Tanlang…</option>
                    {(mapQuery.data?.stations ?? [])
                      .filter((s) => s.status === 'FREE' && s.id !== d.station.id)
                      .map((st) => (
                        <option key={st.id} value={st.id} className="bg-slate-900">
                          {st.number}-joy ({st.type})
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMoving(false)}
                  className="tap rounded-lg bg-slate-800 px-4 py-2.5 text-sm transition hover:bg-slate-700"
                >
                  Orqaga
                </button>
                <button
                  type="button"
                  disabled={!moveTarget || move.isPending}
                  onClick={() => move.mutate()}
                  className="tap flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {move.isPending ? 'Ko\'chirilmoqda…' : 'Ko\'chirish'}
                </button>
              </div>
            </section>
          )}

          {canceling && (
            <section className="space-y-3 rounded-xl border border-red-900/60 bg-red-950/40 p-4">
              <h3 className="text-sm font-medium text-red-200">Seansni bekor qilish (Administrator)</h3>
              <p className="text-xs text-slate-400">
                Seans bekor qilinsa, bufet mahsulotlari omborga qaytariladi va qilingan to'lovlar qaytariladi.
              </p>
              <Field label="Bekor qilish sababi">
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Masalan: Mijoz adashib ochildi, chiroq o'chdi..."
                  className={inputClass}
                />
              </Field>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCanceling(false)}
                  className="tap rounded-lg bg-slate-800 px-4 py-2.5 text-sm transition hover:bg-slate-700"
                >
                  Orqaga
                </button>
                <button
                  type="button"
                  disabled={!cancelReason.trim() || cancel.isPending}
                  onClick={() => cancel.mutate()}
                  className="tap flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {cancel.isPending ? 'Bekor qilinmoqda…' : 'Bekor qilishni tasdiqlash'}
                </button>
              </div>
            </section>
          )}

          {closing && (
            <section className="space-y-3 rounded-xl bg-slate-950/60 p-4">
              <div className="flex items-center justify-between text-sm">
                <span>
                  To'lanishi kerak:{' '}
                  <span className="font-medium text-emerald-400">
                    {summa(Math.max(0, due - (Number(discount) || 0)))}
                  </span>{' '}
                  so'm
                </span>
                {(Number(discount) || 0) > 0 && (
                  <span className="text-xs text-amber-400">Chegirma: {summa(Number(discount) || 0)} so'm</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
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

              {d.customer && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>
                      Mijoz balansi: <strong className="text-slate-200">{summa(d.customer.balance)} so'm</strong>
                    </span>
                    {d.customer.balance > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const need = Math.max(0, due - (Number(discount) || 0));
                          const canPay = Math.min(d.customer!.balance, need);
                          setBalance(String(canPay));
                          const remaining = need - canPay;
                          setCash(String(remaining));
                          setCard('0');
                        }}
                        className="text-emerald-400 underline hover:text-emerald-300"
                      >
                        Balansdan to'lash
                      </button>
                    )}
                  </div>
                  <Field label="Balansdan to'lov">
                    <input
                      value={balance}
                      onChange={(e) => setBalance(e.target.value.replace(/\D/g, ''))}
                      inputMode="numeric"
                      className={inputClass}
                    />
                  </Field>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Chegirma (so'm)">
                  <input
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    className={inputClass}
                  />
                </Field>
                <Field label={`Qaytarilgan pult (berilgan: ${d.gamepads})`}>
                  <input
                    value={returned}
                    onChange={(e) => setReturned(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setClosing(false)}
                  className="tap rounded-lg bg-slate-800 px-4 py-2.5 text-sm transition hover:bg-slate-700"
                >
                  Orqaga
                </button>
                <button
                  type="button"
                  disabled={close.isPending}
                  onClick={() => close.mutate()}
                  className="tap flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {close.isPending ? 'Yopilmoqda…' : 'Tasdiqlash va yopish'}
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
