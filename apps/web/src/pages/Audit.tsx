import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api.ts';

interface Entry {
  id: string;
  createdAt: string;
  entity: string;
  entityId: string | null;
  action: string;
  isCritical: boolean;
  oldValue: unknown;
  newValue: unknown;
  user: { fullName: string } | null;
}

const ACTION: Record<string, string> = {
  login: 'tizimga kirdi',
  open: 'ochdi',
  close: 'yopdi',
  pause: 'to\'xtatdi',
  resume: 'davom ettirdi',
  move: 'joyini almashtirdi',
  cancel: 'bekor qildi',
  pay: 'to\'lov qabul qildi',
  create: 'yaratdi',
  update: 'o\'zgartirdi',
  delete: 'o\'chirdi',
  archive: 'arxivladi',
  'add-item': 'bufet qo\'shdi',
  'remove-item': 'bufetdan olib tashladi',
  'stock-in': 'ombor kirimi',
  status: 'holatini o\'zgartirdi',
};

const ENTITY: Record<string, string> = {
  Session: 'Seans',
  Shift: 'Smena',
  Station: 'Joy',
  StationType: 'Joy turi',
  Tariff: 'Tarif',
  Product: 'Mahsulot',
  ProductCategory: 'Kategoriya',
  OrderItem: 'Bufet',
  Expense: 'Chiqim',
  Customer: 'Mijoz',
  AppUser: 'Foydalanuvchi',
};

const vaqt = (iso: string) =>
  new Date(iso).toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export function Audit() {
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [onlyCritical, setOnlyCritical] = useState(false);

  const params = new URLSearchParams();
  if (search.trim()) params.set('q', search.trim());
  if (entityFilter) params.set('entity', entityFilter);
  if (actionFilter) params.set('action', actionFilter);
  if (onlyCritical) params.set('isCritical', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';

  const query = useQuery({ queryKey: ['audit', search, entityFilter, actionFilter, onlyCritical], queryFn: () => api<Entry[]>(`/api/audit${qs}`) });

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="mb-1 text-xl font-semibold">Audit jurnali</h1>
        <p className="text-sm text-slate-400">
          Har bir amal kim tomonidan va qachon bajarilgani. Yozuvlar o'chirilmaydi.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Qidiruv (xodim, ID)..."
          className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 flex-1 min-w-[150px]"
        />
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          aria-label="Bo'lim bo'yicha filter"
          className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Barcha bo'limlar</option>
          {Object.entries(ENTITY).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          aria-label="Amal turi bo'yicha filter"
          className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Barcha amallar</option>
          {Object.entries(ACTION).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyCritical}
            onChange={(e) => setOnlyCritical(e.target.checked)}
            className="rounded border-slate-700 bg-slate-800 text-red-500 focus:ring-red-400"
          />
          <span className="text-red-400 font-medium">Faqat kritik</span>
        </label>
      </div>

      {query.isLoading && <p className="text-sm text-slate-400">Yuklanmoqda…</p>}

      <ul className="space-y-1">
        {(query.data ?? []).map((e) => (
          <li
            key={e.id}
            className={`rounded-lg px-4 py-2.5 text-sm ${
              e.isCritical ? 'bg-red-950/40 ring-1 ring-red-900/60' : 'bg-slate-900'
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <span className="text-slate-300">{e.user?.fullName ?? 'tizim'}</span>{' '}
                <span className="text-slate-400">
                  {ENTITY[e.entity] ?? e.entity} {ACTION[e.action] ?? e.action}
                </span>
                {e.isCritical && <span className="ml-2 text-xs text-red-400 font-semibold">KRITIK</span>}
              </span>
              <span className="text-xs tabular-nums text-slate-500">{vaqt(e.createdAt)}</span>
            </div>
            {Boolean(e.newValue) && (
              <p className="mt-1 truncate text-xs text-slate-500">{JSON.stringify(e.newValue)}</p>
            )}
          </li>
        ))}
      </ul>

      {query.data?.length === 0 && <p className="text-sm text-slate-500">Jurnal bo'sh yoki mos yozuv topilmadi.</p>}
    </div>
  );
}
