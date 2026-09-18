import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '../lib/api.ts';
import { Field, Modal, inputClass } from './Modal.tsx';

interface Tariff {
  id: string;
  name: string;
  kind: 'HOURLY' | 'PACKAGE';
  packagePrice: number | null;
}

interface Props {
  stationId: string;
  stationNumber: number;
  gamepadCount: number;
  onClose: () => void;
}

export function SessionOpen({ stationId, stationNumber, gamepadCount, onClose }: Props) {
  const client = useQueryClient();
  const [mode, setMode] = useState<'PREPAID' | 'POSTPAID'>('POSTPAID');
  const [gamepads, setGamepads] = useState(2);
  const [minutes, setMinutes] = useState('60');
  const [packageId, setPackageId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

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
          prepaidMinutes: mode === 'PREPAID' ? Number(minutes) || null : null,
          note: note.trim() || null,
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
