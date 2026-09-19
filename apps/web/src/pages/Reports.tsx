import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, getToken } from '../lib/api.ts';
import { isManager, useAuth } from '../store/auth.ts';

interface Report {
  date: string;
  gameRevenue: number;
  itemsRevenue: number;
  quickSales: number;
  discounts: number;
  totalRevenue: number;
  prepayments: number;
  totalPaid: number;
  cashFlow: number;
  totalExpenses: number;
  net: number;
  sessionCount: number;
  byMethod: Record<string, number>;
  expenses: { category: string; amount: number }[];
  hourly: { hour: number; amount: number; sessions: number }[];
  byType: { name: string; revenue: number; sessions: number }[];
  topProducts: { name: string; qty: number; revenue: number; margin: number }[];
  shifts: {
    id: string;
    openedAt: string;
    openingCash: number;
    countedCash: number | null;
    cashDiff: number | null;
    note: string | null;
    operator: { fullName: string };
  }[];
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Naqd',
  CARD: 'Karta',
  BALANCE: 'Mijoz balansi',
  PACKAGE: 'Paket',
  ONLINE: 'Onlayn',
};

const summa = (v: number) => v.toLocaleString('uz-UZ');
const bugun = () => new Date().toISOString().slice(0, 10);

export function Reports() {
  const user = useAuth((s) => s.user);
  const [date, setDate] = useState(bugun);

  const query = useQuery({
    queryKey: ['report', date],
    queryFn: () => api<Report>(`/api/reports/daily?date=${date}`),
  });

  async function download() {
    // Yuklab olishda Authorization sarlavhasi kerak — oddiy havola ishlamaydi.
    const res = await fetch(`/api/reports/daily.xlsx?date=${date}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `psklub-${date}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const r = query.data;
  const peak = Math.max(1, ...(r?.hourly ?? []).map((h) => h.amount));

  return (
    <div className="max-w-4xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Kunlik hisobot</h1>
        <div className="no-print flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="tap rounded-lg bg-slate-900 px-3 py-2 text-sm outline-none ring-1 ring-slate-700 focus:ring-emerald-600"
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="tap rounded-lg bg-slate-800 px-4 py-2 text-sm transition hover:bg-slate-700"
          >
            PDF / chop etish
          </button>
          {isManager(user) && (
            <button
              type="button"
              onClick={() => void download()}
              className="tap rounded-lg bg-slate-800 px-4 py-2 text-sm transition hover:bg-slate-700"
            >
              Excel
            </button>
          )}
        </div>
      </header>

      {query.isLoading && <p className="text-sm text-slate-400">Yuklanmoqda…</p>}

      {r && (
        <>
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['O\'yin', r.gameRevenue],
              ['Bufet', r.itemsRevenue + r.quickSales],
              ['Chiqim', -r.totalExpenses],
              ['Sof natija', r.net],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-slate-900 p-4">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="mt-1 text-lg font-medium">{summa(Number(value))}</p>
              </div>
            ))}
          </section>

          <p className="text-sm text-slate-400">
            {r.sessionCount} ta yopilgan seans · jami tushum {summa(r.totalRevenue)}
            {r.discounts > 0 && ` · chegirma ${summa(r.discounts)}`}
          </p>

          <section className="rounded-xl bg-slate-900 p-4 text-sm">
            <h2 className="mb-2 text-xs text-slate-400">Pul harakati</h2>
            <ul className="space-y-1">
              <li className="flex justify-between">
                <span>Kassaga tushgan (hammasi)</span>
                <span className="tabular-nums">{summa(r.totalPaid)}</span>
              </li>
              {r.prepayments > 0 && (
                <li className="flex justify-between text-slate-400">
                  <span>shundan avans (balans, paket)</span>
                  <span className="tabular-nums">{summa(r.prepayments)}</span>
                </li>
              )}
              <li className="flex justify-between">
                <span>Chiqim</span>
                <span className="tabular-nums">−{summa(r.totalExpenses)}</span>
              </li>
              <li className="flex justify-between border-t border-slate-800 pt-1 font-medium">
                <span>Kassa harakati</span>
                <span className="tabular-nums">{summa(r.cashFlow)}</span>
              </li>
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Avans — mijoz balansiga solgan pul. U hali ishlab topilmagan, shuning uchun sof
              natijaga kirmaydi: mijoz o'ynaganda daromad sifatida hisoblanadi.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-slate-300">To'lov turlari</h2>
            <ul className="space-y-1 text-sm">
              {Object.entries(r.byMethod).map(([m, v]) => (
                <li key={m} className="flex justify-between rounded-lg bg-slate-900 px-4 py-2.5">
                  <span>{METHOD_LABEL[m] ?? m}</span>
                  <span>{summa(v)}</span>
                </li>
              ))}
              {Object.keys(r.byMethod).length === 0 && <li className="text-slate-500">To'lov yo'q.</li>}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-slate-300">Soatlik taqsimot</h2>
            <div className="space-y-1">
              {r.hourly
                .filter((h) => h.sessions > 0)
                .map((h) => (
                  <div key={h.hour} className="flex items-center gap-3 text-xs">
                    <span className="w-12 tabular-nums text-slate-400">
                      {String(h.hour).padStart(2, '0')}:00
                    </span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-slate-900">
                      <div
                        className="h-full rounded bg-emerald-600"
                        style={{ width: `${Math.round((h.amount / peak) * 100)}%` }}
                      />
                    </div>
                    <span className="w-24 text-right tabular-nums text-slate-300">{summa(h.amount)}</span>
                  </div>
                ))}
              {r.hourly.every((h) => h.sessions === 0) && (
                <p className="text-sm text-slate-500">Bu kunda yopilgan seans yo'q.</p>
              )}
            </div>
          </section>

          {r.byType.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-slate-300">Joy turlari</h2>
              <ul className="space-y-1 text-sm">
                {r.byType.map((t) => (
                  <li key={t.name} className="flex justify-between rounded-lg bg-slate-900 px-4 py-2.5">
                    <span>
                      {t.name} · {t.sessions} seans
                    </span>
                    <span>{summa(t.revenue)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r.topProducts.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-slate-300">Mahsulotlar</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-slate-400">
                    <tr>
                      <th className="py-2">Nomi</th>
                      <th className="py-2 text-right">Soni</th>
                      <th className="py-2 text-right">Savdo</th>
                      <th className="py-2 text-right">Marja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.topProducts.map((p) => (
                      <tr key={p.name} className="border-t border-slate-800">
                        <td className="py-2">{p.name}</td>
                        <td className="py-2 text-right tabular-nums">{p.qty}</td>
                        <td className="py-2 text-right tabular-nums">{summa(p.revenue)}</td>
                        <td className="py-2 text-right tabular-nums text-slate-400">{summa(p.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {r.shifts.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-slate-300">Smenalar</h2>
              <ul className="space-y-1 text-sm">
                {r.shifts.map((s) => (
                  <li key={s.id} className="rounded-lg bg-slate-900 px-4 py-2.5">
                    <div className="flex justify-between">
                      <span>{s.operator.fullName}</span>
                      <span className={s.cashDiff ? 'text-amber-400' : 'text-slate-400'}>
                        {s.cashDiff === null ? 'ochiq' : `farq ${summa(s.cashDiff)}`}
                      </span>
                    </div>
                    {s.note && <p className="mt-1 text-xs text-slate-500">{s.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
