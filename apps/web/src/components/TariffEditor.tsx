import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '../lib/api.ts';
import { Field, Modal, inputClass } from './Modal.tsx';

export interface TariffSchedule {
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
}

export interface Tariff {
  id: string;
  name: string;
  kind: 'HOURLY' | 'PACKAGE';
  typeId: string | null;
  priority: number;
  pricePerHour: number;
  minMinutes: number;
  rounding: 'MINUTE' | 'QUARTER' | 'HOUR';
  packagePrice: number | null;
  packageMinutes: number | null;
  gamepadMultipliers: Record<string, number>;
  schedules: TariffSchedule[];
}

const KUNLAR = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];

const ROUNDING_LABEL: Record<Tariff['rounding'], string> = {
  MINUTE: 'Daqiqama-daqiqa',
  QUARTER: 'Har 15 daqiqa (yuqoriga)',
  HOUR: 'Boshlangan soat to\'liq',
};

const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const toMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

interface Props {
  tariff: Tariff | null;
  stationTypes: { id: string; name: string }[];
  onClose: () => void;
}

export function TariffEditor({ tariff, stationTypes, onClose }: Props) {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Arxivlash ikki bosishda — tasodifan bosilib ketmasligi uchun.
  const [confirmed, setConfirmed] = useState(false);

  const [form, setForm] = useState({
    name: tariff?.name ?? '',
    kind: tariff?.kind ?? ('HOURLY' as const),
    typeId: tariff?.typeId ?? '',
    priority: String(tariff?.priority ?? 0),
    pricePerHour: String(tariff?.pricePerHour ?? ''),
    minMinutes: String(tariff?.minMinutes ?? 30),
    rounding: tariff?.rounding ?? ('MINUTE' as const),
    packagePrice: String(tariff?.packagePrice ?? ''),
    packageMinutes: String(tariff?.packageMinutes ?? ''),
  });

  const [pults, setPults] = useState<Record<string, string>>(() => {
    const src = tariff?.gamepadMultipliers ?? { '2': 100 };
    return Object.fromEntries(Object.entries(src).map(([k, v]) => [k, String(v)]));
  });

  const [schedules, setSchedules] = useState<TariffSchedule[]>(
    tariff?.schedules.length ? tariff.schedules : [{ daysOfWeek: [], startMinute: 9 * 60, endMinute: 22 * 60 }],
  );

  const archive = useMutation({
    mutationFn: () => api(`/api/tariffs/${tariff?.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['tariffs'] });
      onClose();
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Kutilmagan xatolik.'),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        kind: form.kind,
        typeId: form.typeId || null,
        priority: Number(form.priority) || 0,
        pricePerHour: Number(form.pricePerHour) || 0,
        minMinutes: Number(form.minMinutes) || 0,
        rounding: form.rounding,
        packagePrice: form.kind === 'PACKAGE' ? Number(form.packagePrice) || 0 : null,
        packageMinutes: form.kind === 'PACKAGE' ? Number(form.packageMinutes) || 0 : null,
        gamepadMultipliers: Object.fromEntries(
          Object.entries(pults)
            .filter(([k, v]) => k && v)
            .map(([k, v]) => [k, Number(v)]),
        ),
        schedules,
      };
      return tariff
        ? api(`/api/tariffs/${tariff.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api('/api/tariffs', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['tariffs'] });
      onClose();
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Kutilmagan xatolik.'),
  });

  const patchSchedule = (i: number, patch: Partial<TariffSchedule>) =>
    setSchedules((list) => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const toggleDay = (i: number, day: number) =>
    patchSchedule(i, {
      daysOfWeek: schedules[i].daysOfWeek.includes(day)
        ? schedules[i].daysOfWeek.filter((d) => d !== day)
        : [...schedules[i].daysOfWeek, day].sort(),
    });

  return (
    <Modal title={tariff ? `Tarif: ${tariff.name}` : 'Yangi tarif'} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nomi">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="PS-5 kunduzi"
              className={inputClass}
            />
          </Field>
          <Field label="Joy turi">
            <select
              value={form.typeId}
              onChange={(e) => setForm({ ...form, typeId: e.target.value })}
              className={inputClass}
            >
              <option value="">Barcha turlar</option>
              {stationTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-xs text-slate-400">Turi</span>
          <div className="grid grid-cols-2 gap-2">
            {(['HOURLY', 'PACKAGE'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setForm({ ...form, kind: k })}
                className={`tap rounded-lg py-2.5 text-sm transition ${
                  form.kind === k ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {k === 'HOURLY' ? 'Soatlik' : 'Paket'}
              </button>
            ))}
          </div>
        </div>

        {form.kind === 'HOURLY' ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Soatlik narx (so'm)">
              <input
                value={form.pricePerHour}
                onChange={(e) => setForm({ ...form, pricePerHour: e.target.value.replace(/\D/g, '') })}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
            <Field label="Minimal vaqt (daqiqa)">
              <input
                value={form.minMinutes}
                onChange={(e) => setForm({ ...form, minMinutes: e.target.value.replace(/\D/g, '') })}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
            <Field label="Yaxlitlash">
              <select
                value={form.rounding}
                onChange={(e) => setForm({ ...form, rounding: e.target.value as Tariff['rounding'] })}
                className={inputClass}
              >
                {Object.entries(ROUNDING_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Paket narxi (so'm)">
              <input
                value={form.packagePrice}
                onChange={(e) => setForm({ ...form, packagePrice: e.target.value.replace(/\D/g, '') })}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
            <Field label="Necha daqiqaga">
              <input
                value={form.packageMinutes}
                onChange={(e) => setForm({ ...form, packageMinutes: e.target.value.replace(/\D/g, '') })}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
            <Field label="Oshgan vaqt narxi (soatiga)">
              <input
                value={form.pricePerHour}
                onChange={(e) => setForm({ ...form, pricePerHour: e.target.value.replace(/\D/g, '') })}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
          </div>
        )}

        <section>
          <h3 className="mb-2 text-xs text-slate-400">
            Pult koeffitsienti — foizda. 2 pult odatda 100 (asosiy narx).
          </h3>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="flex items-center gap-1">
                <span className="text-xs text-slate-500">{n} pult</span>
                <input
                  value={pults[String(n)] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    setPults((p) => {
                      const next = { ...p };
                      if (v === '') delete next[String(n)];
                      else next[String(n)] = v;
                      return next;
                    });
                  }}
                  inputMode="numeric"
                  placeholder="—"
                  className="tap w-16 rounded-lg bg-slate-950 px-2 py-2 text-center text-sm outline-none ring-1 ring-slate-700 focus:ring-emerald-600"
                />
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Bo'sh qoldirilgan son uchun undan kichik eng yaqin qiymat ishlatiladi.
          </p>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs text-slate-400">Amal qilish vaqti</h3>
            <button
              type="button"
              onClick={() =>
                setSchedules((l) => [...l, { daysOfWeek: [], startMinute: 9 * 60, endMinute: 22 * 60 }])
              }
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              + oraliq qo'shish
            </button>
          </div>

          <div className="space-y-3">
            {schedules.map((s, i) => (
              <div key={i} className="rounded-lg bg-slate-950/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    value={toTime(s.startMinute)}
                    onChange={(e) => patchSchedule(i, { startMinute: toMinutes(e.target.value) })}
                    className="tap rounded-lg bg-slate-900 px-2 py-2 text-sm outline-none ring-1 ring-slate-700"
                  />
                  <span className="text-slate-500">—</span>
                  <input
                    type="time"
                    value={toTime(s.endMinute)}
                    onChange={(e) => patchSchedule(i, { endMinute: toMinutes(e.target.value) })}
                    className="tap rounded-lg bg-slate-900 px-2 py-2 text-sm outline-none ring-1 ring-slate-700"
                  />
                  {schedules.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSchedules((l) => l.filter((_, idx) => idx !== i))}
                      className="ml-auto text-xs text-red-400 hover:text-red-300"
                    >
                      o'chirish
                    </button>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {KUNLAR.map((label, day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(i, day)}
                      className={`rounded px-2.5 py-1.5 text-xs transition ${
                        s.daysOfWeek.includes(day)
                          ? 'bg-emerald-600'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="ml-2 self-center text-xs text-slate-500">
                    {s.daysOfWeek.length === 0 ? 'har kuni' : ''}
                  </span>
                </div>

                {s.endMinute <= s.startMinute && (
                  <p className="mt-2 text-xs text-sky-300">
                    Yarim tunni kesib o'tadi: {toTime(s.startMinute)} dan ertangi {toTime(s.endMinute)} gacha.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <Field label="Ustuvorlik — bir vaqtga bir nechta tarif to'g'ri kelsa, kattasi ishlaydi">
          <input
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value.replace(/\D/g, '') })}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-lg bg-red-950/60 px-4 py-2.5 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          {tariff && (
            <button
              type="button"
              disabled={archive.isPending}
              onClick={() => {
                if (confirmed) archive.mutate();
                else setConfirmed(true);
              }}
              className={`tap rounded-lg px-4 py-3 text-sm transition ${
                confirmed
                  ? 'bg-red-700 hover:bg-red-600'
                  : 'bg-slate-800 text-red-400 hover:bg-slate-700'
              }`}
            >
              {confirmed ? 'Aniqmi? Bosing' : 'Arxivlash'}
            </button>
          )}
          <button
            type="button"
            disabled={!form.name.trim() || save.isPending}
            onClick={() => save.mutate()}
            className="tap flex-1 rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {save.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>

        {tariff && (
          <p className="text-xs text-slate-500">
            Arxivlangan tarif o'chirilmaydi — eski seanslar unga bog'langan bo'lishi mumkin. U shunchaki
            yangi seanslarda ishlatilmaydi.
          </p>
        )}
      </div>
    </Modal>
  );
}
