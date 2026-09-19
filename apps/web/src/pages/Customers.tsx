import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '../lib/api.ts';
import { Field, Modal, inputClass } from '../components/Modal.tsx';
import { isManager, useAuth } from '../store/auth.ts';

export interface Customer {
  id: string;
  fullName: string;
  phone: string | null;
  balance: number;
  bonusPoints: number;
  isBlocked: boolean;
  note: string | null;
  telegramId: string | null;
}

interface Summary {
  customer: Customer;
  packages: { id: string; name: string; remainingMinutes: number; expiresAt: string | null }[];
  recentSessions: {
    endedAt: string | null;
    totalAmount: number;
    station: { number: number; type: { name: string } };
  }[];
  totalSpent: number;
  sessionCount: number;
}

const summa = (v: number) => v.toLocaleString('uz-UZ');
const sana = (iso: string) => new Date(iso).toLocaleDateString('uz-UZ');

export function Customers() {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();

  const query = useQuery({
    queryKey: ['customers', q],
    queryFn: () => api<Customer[]>(`/api/customers?q=${encodeURIComponent(q)}`),
  });

  const refresh = () => void client.invalidateQueries({ queryKey: ['customers'] });
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : 'Kutilmagan xatolik.');

  const list = query.data ?? [];
  const qarzdorlar = list.filter((c) => c.balance < 0);

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Mijozlar</h1>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="tap rounded-lg bg-emerald-600 px-4 py-2 text-sm transition hover:bg-emerald-500"
        >
          Mijoz qo'shish
        </button>
      </header>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ism yoki telefon bo'yicha qidirish…"
        className={`${inputClass} max-w-sm`}
      />

      {qarzdorlar.length > 0 && (
        <p className="rounded-lg bg-amber-950/60 px-4 py-3 text-sm text-amber-300">
          Qarzdor: {qarzdorlar.map((c) => `${c.fullName} (${summa(-c.balance)})`).join(', ')}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="py-2">Ism</th>
              <th className="py-2">Telefon</th>
              <th className="py-2 text-right">Balans</th>
              <th className="py-2">Holat</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr
                key={c.id}
                onClick={() => setOpen(c)}
                className="cursor-pointer border-t border-slate-800 transition hover:bg-slate-900"
              >
                <td className="py-2.5">
                  {c.fullName}
                  {c.telegramId && <span className="ml-2 text-xs text-sky-400">Telegram</span>}
                </td>
                <td className="py-2.5 text-slate-400">{c.phone ?? '—'}</td>
                <td
                  className={`py-2.5 text-right tabular-nums ${c.balance < 0 ? 'text-amber-400' : 'text-slate-300'}`}
                >
                  {summa(c.balance)}
                </td>
                <td className="py-2.5">
                  {c.isBlocked && <span className="text-xs text-red-400">qora ro'yxat</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <p className="py-6 text-sm text-slate-500">
            {q ? 'Topilmadi.' : 'Mijoz yo\'q. Qo\'shsangiz, seans ochishda tanlash mumkin bo\'ladi.'}
          </p>
        )}
      </div>

      {adding && <AddCustomer onClose={() => setAdding(false)} onDone={refresh} onError={onError} />}
      {open && (
        <CustomerDetail customer={open} onClose={() => setOpen(null)} onDone={refresh} onError={onError} />
      )}
    </div>
  );
}

function AddCustomer({
  onClose,
  onDone,
  onError,
}: {
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [form, setForm] = useState({ fullName: '', phone: '', note: '' });

  const save = useMutation({
    mutationFn: () =>
      api('/api/customers', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          note: form.note.trim() || null,
        }),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError,
  });

  return (
    <Modal title="Yangi mijoz" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Ism">
          <input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Telefon">
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+998 90 123 45 67"
            className={inputClass}
          />
        </Field>
        <Field label="Izoh">
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className={inputClass}
          />
        </Field>
        <button
          type="button"
          disabled={!form.fullName.trim() || !form.phone.trim() || save.isPending}
          onClick={() => save.mutate()}
          className="tap w-full rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-40"
        >
          Saqlash
        </button>
      </div>
    </Modal>
  );
}

function CustomerDetail({
  customer,
  onClose,
  onDone,
  onError,
}: {
  customer: Customer;
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const client = useQueryClient();
  const user = useAuth((s) => s.user);
  const [amount, setAmount] = useState('');

  const query = useQuery({
    queryKey: ['customer', customer.id],
    queryFn: () => api<Summary>(`/api/customers/${customer.id}`),
  });

  const after = () => {
    onDone();
    void client.invalidateQueries({ queryKey: ['customer', customer.id] });
    void client.invalidateQueries({ queryKey: ['shift'] });
  };

  const topup = useMutation({
    mutationFn: () =>
      api(`/api/customers/${customer.id}/topup`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount) || 0, method: 'CASH' }),
      }),
    onSuccess: () => {
      setAmount('');
      after();
    },
    onError,
  });

  const block = useMutation({
    mutationFn: (isBlocked: boolean) =>
      api(`/api/customers/${customer.id}`, { method: 'PATCH', body: JSON.stringify({ isBlocked }) }),
    onSuccess: after,
    onError,
  });

  const d = query.data;

  return (
    <Modal title={customer.fullName} onClose={onClose} wide>
      {!d ? (
        <p className="text-sm text-slate-400">Yuklanmoqda…</p>
      ) : (
        <div className="space-y-5">
          {d.customer.isBlocked && (
            <p role="alert" className="rounded-lg bg-red-950/60 px-4 py-2.5 text-sm text-red-300">
              Mijoz qora ro'yxatda — unga seans ochib bo'lmaydi.
            </p>
          )}

          <section className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-400">Balans</p>
              <p className={`font-medium ${d.customer.balance < 0 ? 'text-amber-400' : ''}`}>
                {summa(d.customer.balance)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Telefon</p>
              <p className="font-medium">{d.customer.phone ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Tashriflar</p>
              <p className="font-medium">{d.sessionCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Jami sarflangan</p>
              <p className="font-medium">{summa(d.totalSpent)}</p>
            </div>
          </section>

          <section className="space-y-2 rounded-xl bg-slate-950/60 p-4">
            <Field label="Balansni to'ldirish (naqd)">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
            {d.customer.balance < 0 && (
              <button
                type="button"
                onClick={() => setAmount(String(-d.customer.balance))}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                Qarzni yopish ({summa(-d.customer.balance)})
              </button>
            )}
            <button
              type="button"
              disabled={!amount || topup.isPending}
              onClick={() => topup.mutate()}
              className="tap w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-40"
            >
              To'ldirish
            </button>
            <p className="text-xs text-slate-500">Pul kassaga tushadi. Smena ochiq bo'lishi kerak.</p>
          </section>

          {d.packages.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs text-slate-400">Paketlar</h3>
              <ul className="space-y-1 text-sm">
                {d.packages.map((p) => (
                  <li key={p.id} className="flex justify-between rounded-lg bg-slate-900 px-3 py-2">
                    <span>{p.name}</span>
                    <span className="text-slate-400">
                      {Math.floor(p.remainingMinutes / 60)} soat {p.remainingMinutes % 60} daq
                      {p.expiresAt && ` · ${sana(p.expiresAt)} gacha`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs text-slate-400">Oxirgi seanslar</h3>
            {d.recentSessions.length === 0 ? (
              <p className="text-sm text-slate-500">Hali seans yo'q.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {d.recentSessions.map((s, i) => (
                  <li key={i} className="flex justify-between rounded-lg bg-slate-900 px-3 py-2">
                    <span>
                      {s.endedAt ? sana(s.endedAt) : '—'} · {s.station.number}-joy ({s.station.type.name})
                    </span>
                    <span className="tabular-nums">{summa(s.totalAmount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isManager(user) && (
            <button
              type="button"
              onClick={() => block.mutate(!d.customer.isBlocked)}
              className={`tap rounded-lg px-4 py-2.5 text-sm transition ${
                d.customer.isBlocked
                  ? 'bg-slate-800 hover:bg-slate-700'
                  : 'bg-slate-800 text-red-400 hover:bg-slate-700'
              }`}
            >
              {d.customer.isBlocked ? 'Qora ro\'yxatdan chiqarish' : 'Qora ro\'yxatga qo\'yish'}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
