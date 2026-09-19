import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api.ts';
import { TariffEditor, type Tariff } from '../components/TariffEditor.tsx';

interface StationType {
  id: string;
  name: string;
}

const KUNLAR = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];

const ROUNDING: Record<Tariff['rounding'], string> = {
  MINUTE: 'daqiqa',
  QUARTER: '15 daq',
  HOUR: 'soat',
};

const summa = (v: number) => v.toLocaleString('uz-UZ');
const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function scheduleText(t: Tariff): string {
  if (t.schedules.length === 0) return 'oraliq yo\'q';
  return t.schedules
    .map((s) => {
      const days = s.daysOfWeek.length === 0 ? '' : ` (${s.daysOfWeek.map((d) => KUNLAR[d]).join(',')})`;
      return `${toTime(s.startMinute)}–${toTime(s.endMinute)}${days}`;
    })
    .join(' · ');
}

function pultText(t: Tariff): string {
  const entries = Object.entries(t.gamepadMultipliers)
    .map(([k, v]) => [Number(k), v] as const)
    .filter(([, v]) => v !== 100)
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return '—';
  return entries.map(([n, v]) => `${n} pult ${v > 100 ? '+' : ''}${v - 100}%`).join(', ');
}

/**
 * Tariflarni qo'lda kiritish va tahrirlash.
 *
 * Bu ekran tarif mantiqidagi bo'shliqlarni ham ko'rsatadi: joy turi uchun
 * kun davomida qoplanmagan soat qolsa, o'sha vaqtda seans ochilsa hisob
 * nol chiqadi — shuning uchun ogohlantirish yuqorida turadi.
 */
export function Tariffs() {
  const [editing, setEditing] = useState<{ tariff: Tariff | null } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'HOURLY' | 'PACKAGE'>('all');

  const types = useQuery({ queryKey: ['station-types'], queryFn: () => api<StationType[]>('/api/station-types') });
  const tariffs = useQuery({
    queryKey: ['tariffs', showArchived],
    queryFn: () => api<Tariff[]>(`/api/tariffs${showArchived ? '?all=1' : ''}`),
  });

  const list = tariffs.data ?? [];
  const gaps = findGaps(list, types.data ?? []);

  const filteredList = list.filter((t) => {
    if (search.trim() && !t.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (typeFilter && t.typeId !== typeFilter) return false;
    if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
    return true;
  });

  return (
    <div className="max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tariflar</h1>
          <p className="text-sm text-slate-400">Narx, vaqt oralig'i va pult koeffitsienti shu yerda kiritiladi.</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ tariff: null })}
          className="tap rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500"
        >
          Tarif qo'shish
        </button>
      </header>

      {gaps.length > 0 && (
        <div role="alert" className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">
          <p className="font-medium">Tarif qoplamagan vaqt bor — o'sha paytda seans 0 so'm chiqadi:</p>
          <ul className="mt-1 space-y-0.5">
            {gaps.map((g) => (
              <li key={g.type}>
                · <span className="font-medium">{g.type}</span> — {g.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tarif nomi bo'yicha qidirish..."
          className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 flex-1 min-w-[200px]"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Joy turi bo'yicha filter"
          className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Barcha joy turlari</option>
          {(types.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as 'all' | 'HOURLY' | 'PACKAGE')}
          aria-label="Tarif turi bo'yicha filter"
          className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="all">Barcha turlar</option>
          <option value="HOURLY">Soatbay</option>
          <option value="PACKAGE">Paket</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="py-2">Nomi</th>
              <th className="py-2">Joy turi</th>
              <th className="py-2 text-right">Narx</th>
              <th className="py-2 text-right">Min</th>
              <th className="py-2">Yaxlitlash</th>
              <th className="py-2">Vaqt oralig'i</th>
              <th className="py-2">Pult</th>
              <th className="py-2 text-right">Ustuvorlik</th>
            </tr>
          </thead>
          <tbody>
            {filteredList.map((t) => (
              <tr
                key={t.id}
                onClick={() => setEditing({ tariff: t })}
                className="cursor-pointer border-t border-slate-800 transition hover:bg-slate-900"
              >
                <td className="py-2.5">
                  {t.name}
                  {t.kind === 'PACKAGE' && (
                    <span className="ml-2 rounded bg-sky-900/60 px-1.5 py-0.5 text-xs text-sky-300">paket</span>
                  )}
                </td>
                <td className="py-2.5 text-slate-400">
                  {types.data?.find((x) => x.id === t.typeId)?.name ?? 'barchasi'}
                </td>
                <td className="py-2.5 text-right tabular-nums">
                  {t.kind === 'PACKAGE'
                    ? `${summa(t.packagePrice ?? 0)} / ${Math.round((t.packageMinutes ?? 0) / 60)} soat`
                    : `${summa(t.pricePerHour)} / soat`}
                </td>
                <td className="py-2.5 text-right tabular-nums text-slate-400">
                  {t.kind === 'PACKAGE' ? '—' : `${t.minMinutes} daq`}
                </td>
                <td className="py-2.5 text-slate-400">{t.kind === 'PACKAGE' ? '—' : ROUNDING[t.rounding]}</td>
                <td className="py-2.5 text-slate-300">{scheduleText(t)}</td>
                <td className="py-2.5 text-xs text-slate-400">{pultText(t)}</td>
                <td className="py-2.5 text-right tabular-nums text-slate-400">{t.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredList.length === 0 && (
          <p className="py-6 text-sm text-slate-500">
            {list.length === 0
              ? 'Hali tarif yo\'q. "Tarif qo\'shish" bilan klubdagi haqiqiy narxlarni kiriting.'
              : 'Filtrga mos tarif topilmadi.'}
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-400">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Arxivlangan tariflarni ham ko'rsatish
      </label>

      {editing && (
        <TariffEditor
          tariff={editing.tariff}
          stationTypes={types.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * Har bir joy turi uchun sutkaning qoplanmagan soatlarini topadi.
 * Paket tariflar hisobga olinmaydi — ular operator ataylab tanlaganda ishlaydi.
 */
function findGaps(
  tariffs: Tariff[],
  types: StationType[],
): { type: string; text: string }[] {
  const result: { type: string; text: string }[] = [];

  for (const type of types) {
    const applicable = tariffs.filter(
      (t) => t.kind === 'HOURLY' && (t.typeId === null || t.typeId === type.id),
    );
    if (applicable.length === 0) {
      result.push({ type: type.name, text: 'umuman tarif yo\'q' });
      continue;
    }

    const covered = new Array<boolean>(1440).fill(false);
    for (const t of applicable) {
      for (const s of t.schedules) {
        if (s.startMinute < s.endMinute) {
          for (let m = s.startMinute; m < s.endMinute; m++) covered[m] = true;
        } else {
          for (let m = s.startMinute; m < 1440; m++) covered[m] = true;
          for (let m = 0; m < s.endMinute; m++) covered[m] = true;
        }
      }
    }

    const holes: string[] = [];
    let start: number | null = null;
    for (let m = 0; m <= 1440; m++) {
      const open = m < 1440 && !covered[m];
      if (open && start === null) start = m;
      if (!open && start !== null) {
        holes.push(`${toTime(start)}–${toTime(m % 1440)}`);
        start = null;
      }
    }
    if (holes.length > 0) result.push({ type: type.name, text: holes.join(', ') });
  }

  return result;
}
