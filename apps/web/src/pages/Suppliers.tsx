import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '../lib/api.ts';
import { Field, Modal, inputClass } from '../components/Modal.tsx';

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  isActive: boolean;
  kelgan: number;
  tolangan: number;
  qarz: number;
}

interface Detail {
  supplier: Supplier;
  kelgan: number;
  tolangan: number;
  qarz: number;
  intakes: {
    id: string;
    createdAt: string;
    product: string;
    qty: number;
    unitCost: number | null;
    amount: number;
    note: string | null;
  }[];
  payments: { id: string; createdAt: string; amount: number; note: string | null }[];
}

const summa = (v: number) => v.toLocaleString('uz-UZ');
const vaqt = (iso: string) =>
  new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function Suppliers() {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Supplier | null>(null);

  const query = useQuery({ queryKey: ['suppliers'], queryFn: () => api<Supplier[]>('/api/suppliers') });

  const refresh = () => void client.invalidateQueries({ queryKey: ['suppliers'] });
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : 'Kutilmagan xatolik.');

  const list = query.data ?? [];
  const jamiQarz = list.reduce((s, x) => s + Math.max(0, x.qarz), 0);

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Ta'minotchilar</h1>
          <p className="text-sm text-slate-400">Kelgan tovar, to'langan pul va qarz.</p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="tap rounded-lg bg-emerald-600 px-4 py-2 text-sm transition hover:bg-emerald-500"
        >
          Ta'minotchi qo'shish
        </button>
      </header>

      {jamiQarz > 0 && (
        <p className="rounded-lg bg-amber-950/60 px-4 py-3 text-sm text-amber-300">
          Jami qarz: <span className="font-medium">{summa(jamiQarz)}</span> so'm
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
              <th className="py-2">Nomi</th>
              <th className="py-2">Telefon</th>
              <th className="py-2 text-right">Kelgan tovar</th>
              <th className="py-2 text-right">To'langan</th>
              <th className="py-2 text-right">Qarz</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr
                key={s.id}
                onClick={() => setOpen(s)}
                className="cursor-pointer border-t border-slate-800 transition hover:bg-slate-900"
              >
                <td className="py-2.5">{s.name}</td>
                <td className="py-2.5 text-slate-400">{s.phone ?? '—'}</td>
                <td className="py-2.5 text-right tabular-nums">{summa(s.kelgan)}</td>
                <td className="py-2.5 text-right tabular-nums text-slate-400">{summa(s.tolangan)}</td>
                <td className={`py-2.5 text-right tabular-nums ${s.qarz > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                  {summa(s.qarz)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <p className="py-6 text-sm text-slate-500">
            Ta'minotchi yo'q. Qo'shsangiz, ombor kirimida uni tanlash mumkin bo'ladi.
          </p>
        )}
        {list.length > 0 && <p className="mt-2 text-xs text-slate-500">Batafsil ko'rish uchun qatorni bosing.</p>}
      </div>

      {adding && <AddSupplier onClose={() => setAdding(false)} onDone={refresh} onError={onError} />}
      {open && (
        <SupplierDetail
          supplier={open}
          onClose={() => setOpen(null)}
          onDone={refresh}
          onError={onError}
        />
      )}
    </div>
  );
}

function AddSupplier({
  onClose,
  onDone,
  onError,
}: {
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [form, setForm] = useState({ name: '', phone: '', note: '' });

  const save = useMutation({
    mutationFn: () =>
      api('/api/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
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
    <Modal title="Yangi ta'minotchi" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nomi">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Masalan: Coca-Cola distribyutor"
            className={inputClass}
          />
        </Field>
        <Field label="Telefon">
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
          disabled={!form.name.trim() || save.isPending}
          onClick={() => save.mutate()}
          className="tap w-full rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-40"
        >
          Saqlash
        </button>
      </div>
    </Modal>
  );
}

function SupplierDetail({
  supplier,
  onClose,
  onDone,
  onError,
}: {
  supplier: Supplier;
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const client = useQueryClient();
  const [amount, setAmount] = useState('');

  const query = useQuery({
    queryKey: ['supplier', supplier.id],
    queryFn: () => api<Detail>(`/api/suppliers/${supplier.id}`),
  });

  const pay = useMutation({
    mutationFn: () =>
      api(`/api/suppliers/${supplier.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount) || 0, note: null }),
      }),
    onSuccess: () => {
      setAmount('');
      onDone();
      void client.invalidateQueries({ queryKey: ['supplier', supplier.id] });
      void client.invalidateQueries({ queryKey: ['shift'] });
    },
    onError,
  });

  const d = query.data;

  return (
    <Modal title={supplier.name} onClose={onClose} wide>
      {!d ? (
        <p className="text-sm text-slate-400">Yuklanmoqda…</p>
      ) : (
        <div className="space-y-5">
          <section className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-400">Kelgan tovar</p>
              <p className="font-medium">{summa(d.kelgan)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">To'langan</p>
              <p className="font-medium">{summa(d.tolangan)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Qarz</p>
              <p className={`font-medium ${d.qarz > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {summa(d.qarz)}
              </p>
            </div>
          </section>

          <section className="space-y-2 rounded-xl bg-slate-950/60 p-4">
            <Field label="To'lov summasi">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
            {d.qarz > 0 && (
              <button
                type="button"
                onClick={() => setAmount(String(d.qarz))}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                Qarzni to'liq to'lash ({summa(d.qarz)})
              </button>
            )}
            <button
              type="button"
              disabled={!amount || pay.isPending}
              onClick={() => pay.mutate()}
              className="tap w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-40"
            >
              To'lovni yozish
            </button>
            <p className="text-xs text-slate-500">
              To'lov chiqim sifatida yoziladi va smena kassasidan chiqadi. Smena ochiq bo'lishi kerak.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-xs text-slate-400">Kelgan tovarlar</h3>
            {d.intakes.length === 0 ? (
              <p className="text-sm text-slate-500">Hali kirim yo'q.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {d.intakes.map((i) => (
                  <li key={i.id} className="flex justify-between rounded-lg bg-slate-900 px-3 py-2">
                    <span>
                      {vaqt(i.createdAt)} · {i.product} × {i.qty}
                    </span>
                    <span className="tabular-nums">{summa(i.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {d.payments.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs text-slate-400">To'lovlar</h3>
              <ul className="space-y-1 text-sm">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex justify-between rounded-lg bg-slate-900 px-3 py-2">
                    <span>{vaqt(p.createdAt)}</span>
                    <span className="tabular-nums text-emerald-400">{summa(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
