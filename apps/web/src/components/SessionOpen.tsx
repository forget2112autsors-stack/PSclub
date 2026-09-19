import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '../lib/api.ts';
import { Field, Modal, inputClass } from './Modal.tsx';
import { isManager, useAuth } from '../store/auth.ts';

interface Tariff {
  id: string;
  name: string;
  kind: 'HOURLY' | 'PACKAGE';
  packagePrice: number | null;
}

interface Customer {
  id: string;
  fullName: string;
  phone: string | null;
  balance: number;
  isBlocked: boolean;
}

interface Props {
  stationId: string;
  stationNumber: number;
  gamepadCount: number;
  onClose: () => void;
}

export function SessionOpen({ stationId, stationNumber, gamepadCount, onClose }: Props) {
  const client = useQueryClient();
  const user = useAuth((s) => s.user);
  const isMgr = isManager(user);
  const [mode, setMode] = useState<'PREPAID' | 'POSTPAID'>('POSTPAID');
  const [gamepads, setGamepads] = useState(2);
  const [minutes, setMinutes] = useState('60');
  const [packageId, setPackageId] = useState('');
  const [startedAtStr, setStartedAtStr] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [qidiruv, setQidiruv] = useState('');

  const customers = useQuery({
    queryKey: ['customers', qidiruv],
    queryFn: () => api<Customer[]>(`/api/customers?q=${encodeURIComponent(qidiruv)}`),
  });
  const tanlangan = (customers.data ?? []).find((c) => c.id === customerId) ?? null;

  const customerDetail = useQuery({
    queryKey: ['customer-open-detail', customerId],
    queryFn: () =>
      api<{ packages: { id: string; name: string; remainingMinutes: number; expiresAt: string | null }[] }>(
        `/api/customers/${customerId}`,
      ),
    enabled: !!customerId,
  });

  const tariffs = useQuery({ queryKey: ['tariffs'], queryFn: () => api<Tariff[]>('/api/tariffs') });
  const packages = (tariffs.data ?? []).filter((t) => t.kind === 'PACKAGE');

  const open = useMutation({
    mutationFn: () =>
      api('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          stationId,
          paymentMode: mode,
          gamepads,
          tariffId: packageId || null,
          customerId: customerId || null,
          prepaidMinutes: mode === 'PREPAID' ? Number(minutes) || null : null,
          note: note.trim() || null,
          startedAt: startedAtStr ? new Date(startedAtStr).toISOString() : undefined,
        }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['map'] });
      onClose();
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Kutilmagan xatolik.'),
  });

  return (
    <Modal title={`${stationNumber}-joyda seans ochish`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-xs text-slate-400">To'lov rejimi</span>
          <div className="grid grid-cols-2 gap-2">
            {(['POSTPAID', 'PREPAID'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`tap rounded-lg py-2.5 text-sm transition ${
                  mode === value ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {value === 'POSTPAID' ? 'Ishdan keyin' : 'Oldindan'}
              </button>
            ))}
          </div>
        </div>

        {mode === 'PREPAID' && (
          <Field label="Necha daqiqaga">
            <input
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
        )}

        <div>
          <span className="mb-1 block text-xs text-slate-400">Pult soni</span>
          <div className="flex gap-2">
            {Array.from({ length: Math.max(1, gamepadCount) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setGamepads(n)}
                className={`tap flex-1 rounded-lg py-2.5 text-sm transition ${
                  gamepads === n ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {packages.length > 0 && (
          <Field label="Paket tarif (ixtiyoriy)">
            <select value={packageId} onChange={(e) => setPackageId(e.target.value)} className={inputClass}>
              <option value="">Paketsiz — soatlik tarif</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {(p.packagePrice ?? 0).toLocaleString('uz-UZ')} so'm
                </option>
              ))}
            </select>
          </Field>
        )}

        <div>
          <span className="mb-1 block text-xs text-slate-400">
            Mijoz {mode === 'POSTPAID' && <span className="text-amber-400">— qarz yozish uchun kerak</span>}
          </span>

          {tanlangan ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2.5 text-sm">
                <span>
                  {tanlangan.fullName}
                  <span className={`ml-2 text-xs ${tanlangan.balance < 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    balans {tanlangan.balance.toLocaleString('uz-UZ')}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setCustomerId('')}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  bekor qilish
                </button>
              </div>

              {customerDetail.data?.packages && customerDetail.data.packages.length > 0 && (
                <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 p-2.5 text-xs text-emerald-300">
                  <p className="mb-1 font-semibold">Mijozning faol abonement paketlari:</p>
                  <ul className="space-y-0.5">
                    {customerDetail.data.packages.map((p) => (
                      <li key={p.id}>
                        • {p.name}: {Math.floor(p.remainingMinutes / 60)} soat {p.remainingMinutes % 60} daq qoldi
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              <input
                value={qidiruv}
                onChange={(e) => setQidiruv(e.target.value)}
                placeholder="Ism yoki telefon — bo'sh qoldirsangiz mehmon"
                className={inputClass}
              />
              {qidiruv.trim().length > 0 && (
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg bg-slate-950/60">
                  {(customers.data ?? []).slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={c.isBlocked}
                        onClick={() => {
                          setCustomerId(c.id);
                          setQidiruv('');
                        }}
                        className="tap w-full px-3 py-2 text-left text-sm transition hover:bg-slate-800 disabled:opacity-40"
                      >
                        {c.fullName}
                        <span className="ml-2 text-xs text-slate-500">{c.phone}</span>
                        {c.isBlocked && <span className="ml-2 text-xs text-red-400">qora ro'yxat</span>}
                      </button>
                    </li>
                  ))}
                  {customers.data?.length === 0 && (
                    <li className="px-3 py-2 text-sm text-slate-500">Topilmadi.</li>
                  )}
                </ul>
              )}
            </>
          )}
        </div>

        {mode === 'POSTPAID' && !customerId && (
          <p className="rounded-lg bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
            Mijoz tanlanmasa seans mehmon nomiga ochiladi va qarz bilan yopib bo'lmaydi —
            yopishda to'liq to'lov olinadi.
          </p>
        )}

        {isMgr && (
          <Field label="O'tgan vaqt bilan kiritish (ixtiyoriy — masalan, aloqa uzilgandagi seans)">
            <input
              type="datetime-local"
              value={startedAtStr}
              onChange={(e) => setStartedAtStr(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        <Field label="Izoh (ixtiyoriy)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>

        {error && (
          <p role="alert" className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={open.isPending}
          onClick={() => open.mutate()}
          className="tap w-full rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {open.isPending ? 'Ochilmoqda…' : 'Seansni boshlash'}
        </button>
      </div>
    </Modal>
  );
}
