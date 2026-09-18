import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '../lib/api.ts';
import { useRealtime } from '../lib/realtime.ts';
import { Field, inputClass } from '../components/Modal.tsx';

interface Summary {
  shift: {
    id: string;
    openedAt: string;
    openingCash: number;
    status: 'OPEN' | 'CLOSED';
  } | null;
  byMethod?: Record<string, number>;
  cashPayments?: number;
  cashExpenses?: number;
  openSessions?: number;
  sessions?: number;
  expectedCash?: number;
  gamepadsMissing?: number;
  gamepadsUnchecked?: number;
  gamepadIssues?: { station: number; issued: number; returned: number; missing: number }[];
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Naqd',
  CARD: 'Karta',
  BALANCE: 'Mijoz balansi',
  PACKAGE: 'Paket',
  ONLINE: 'Onlayn',
};

const summa = (v: number) => v.toLocaleString('uz-UZ');

const vaqt = (iso: string) =>
  new Date(iso).toLocaleString('uz-UZ', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

export function Shift() {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [openingCash, setOpeningCash] = useState('0');
  const [countedCash, setCountedCash] = useState('');
  const [note, setNote] = useState('');
  const [expense, setExpense] = useState({ category: 'Tovar', amount: '', note: '' });

  const query = useQuery({ queryKey: ['shift'], queryFn: () => api<Summary>('/api/shifts/current') });

  const onRefresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: ['shift'] });
  }, [client]);
  useRealtime(onRefresh);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['shift'] });
    void client.invalidateQueries({ queryKey: ['map'] });
  };
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : 'Kutilmagan xatolik.');

  const open = useMutation({
    mutationFn: () =>
      api('/api/shifts/open', { method: 'POST', body: JSON.stringify({ openingCash: Number(openingCash) || 0 }) }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError,
  });

  const close = useMutation({
    mutationFn: () =>
      api('/api/shifts/close', {
        method: 'POST',
        body: JSON.stringify({ countedCash: Number(countedCash) || 0, note: note.trim() || null }),
      }),
    onSuccess: () => {
      setError(null);
      setCountedCash('');
      setNote('');
      refresh();
    },
    onError,
  });

  const addExpense = useMutation({
    mutationFn: () =>
      api('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: expense.category,
          amount: Number(expense.amount) || 0,
          note: expense.note.trim() || null,
        }),
      }),
    onSuccess: () => {
      setError(null);
      setExpense({ category: 'Tovar', amount: '', note: '' });
      refresh();
    },
    onError,
  });

  const s = query.data;
  const expected = s?.expectedCash ?? 0;
  const diff = countedCash === '' ? 0 : Number(countedCash) - expected;

  if (!s?.shift) {
    return (
      <div className="max-w-md">
        <h1 className="mb-1 text-xl font-semibold">Smena</h1>
        <p className="mb-6 text-sm text-slate-400">Ochiq smena yo'q.</p>

        <div className="space-y-4 rounded-xl bg-slate-900 p-5">
          <Field label="Kassadagi boshlang'ich naqd pul">
            <input
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
          {error && (
            <p role="alert" className="rounded-lg bg-red-950/60 px-4 py-2.5 text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={open.isPending}
            onClick={() => open.mutate()}
            className="tap w-full rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-50"
          >
            Smenani ochish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Smena</h1>
        <p className="text-sm text-slate-400">
          {vaqt(s.shift.openedAt)} dan beri · {s.sessions ?? 0} ta seans
          {(s.openSessions ?? 0) > 0 && (
            <span className="text-amber-400"> · {s.openSessions} tasi hali ochiq</span>
          )}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['Boshlang\'ich naqd', s.shift.openingCash],
          ['Naqd tushum', s.cashPayments ?? 0],
          ['Chiqim', -(s.cashExpenses ?? 0)],
          ['Kassada bo\'lishi kerak', expected],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-slate-900 p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-1 font-medium">{summa(Number(value))}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">To'lov turlari bo'yicha</h2>
        <ul className="space-y-1 text-sm">
          {Object.entries(s.byMethod ?? {}).map(([method, amount]) => (
            <li key={method} className="flex justify-between rounded-lg bg-slate-900 px-4 py-2.5">
              <span>{METHOD_LABEL[method] ?? method}</span>
              <span>{summa(amount)}</span>
            </li>
          ))}
          {Object.keys(s.byMethod ?? {}).length === 0 && (
            <li className="text-slate-500">Hali to'lov bo'lmagan.</li>
          )}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Karta to'lovi kassaga tushmaydi — sverkada hisobga olinmaydi.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">Pult sverkasi</h2>
        {(s.gamepadsMissing ?? 0) > 0 ? (
          <div className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">
            <p className="font-medium">{s.gamepadsMissing} ta pult qaytarilmagan:</p>
            <ul className="mt-1 space-y-0.5">
              {s.gamepadIssues?.map((g) => (
                <li key={g.station}>
                  · {g.station}-joy: {g.issued} berilgan, {g.returned} qaytgan
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-slate-400">
            Hamma pult qaytgan.
            {(s.gamepadsUnchecked ?? 0) > 0 &&
              ` Lekin ${s.gamepadsUnchecked} ta seansda pult tekshirilmagan.`}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">Chiqim qo'shish</h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={expense.category}
            onChange={(e) => setExpense({ ...expense, category: e.target.value })}
            className={`${inputClass} w-40`}
          >
            {['Tovar', 'Ta\'mirlash', 'Kommunal', 'Boshqa'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            value={expense.amount}
            onChange={(e) => setExpense({ ...expense, amount: e.target.value.replace(/\D/g, '') })}
            inputMode="numeric"
            placeholder="Summa"
            className={`${inputClass} w-32`}
          />
          <input
            value={expense.note}
            onChange={(e) => setExpense({ ...expense, note: e.target.value })}
            placeholder="Izoh"
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            disabled={!expense.amount || addExpense.isPending}
            onClick={() => addExpense.mutate()}
            className="tap rounded-lg bg-slate-800 px-4 py-2 text-sm transition hover:bg-slate-700 disabled:opacity-40"
          >
            Qo'shish
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-xl bg-slate-900 p-5">
        <h2 className="text-sm font-medium text-slate-300">Smenani yopish</h2>
        <Field label="Kassadagi haqiqiy naqd pul (sanang)">
          <input
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>

        {countedCash !== '' && diff !== 0 && (
          <>
            <p className={`text-sm ${diff < 0 ? 'text-red-300' : 'text-amber-300'}`}>
              Farq: {diff > 0 ? '+' : ''}
              {summa(diff)} so'm — {diff < 0 ? 'kassada kam' : 'kassada ortiqcha'}
            </p>
            <Field label="Farq sababi (majburiy)">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
            </Field>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-950/60 px-4 py-2.5 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={countedCash === '' || close.isPending || (diff !== 0 && !note.trim())}
          onClick={() => close.mutate()}
          className="tap w-full rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-40"
        >
          {close.isPending ? 'Yopilmoqda…' : 'Smenani yopish'}
        </button>
      </section>
    </div>
  );
}
