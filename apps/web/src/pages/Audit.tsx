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
  const query = useQuery({ queryKey: ['audit'], queryFn: () => api<Entry[]>('/api/audit') });

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">Audit jurnali</h1>
      <p className="mb-6 text-sm text-slate-400">
        Har bir amal kim tomonidan va qachon bajarilgani. Yozuvlar o'chirilmaydi.
      </p>

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
                {e.isCritical && <span className="ml-2 text-xs text-red-400">kritik</span>}
              </span>
              <span className="text-xs tabular-nums text-slate-500">{vaqt(e.createdAt)}</span>
            </div>
            {Boolean(e.newValue) && (
              <p className="mt-1 truncate text-xs text-slate-500">{JSON.stringify(e.newValue)}</p>
            )}
          </li>
        ))}
      </ul>

      {query.data?.length === 0 && <p className="text-sm text-slate-500">Jurnal bo'sh.</p>}
    </div>
  );
}
