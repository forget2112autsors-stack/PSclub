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

const METHOD_CONFIG: Record<string, { label: string; color: string }> = {
  CASH: { label: 'Naqd pul', color: 'bg-emerald-500 text-emerald-400' },
  CARD: { label: 'Plastik karta', color: 'bg-sky-500 text-sky-400' },
  BALANCE: { label: 'Mijoz balansi', color: 'bg-amber-500 text-amber-400' },
  PACKAGE: { label: 'Paket vaqti', color: 'bg-purple-500 text-purple-400' },
  ONLINE: { label: 'Onlayn to\'lov', color: 'bg-indigo-500 text-indigo-400' },
};

const summa = (v: number) => v.toLocaleString('uz-UZ');
const bugun = () => new Date().toISOString().slice(0, 10);
const kecha = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

export function Reports() {
  const user = useAuth((s) => s.user);
  const [date, setDate] = useState(bugun);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ['report', date],
    queryFn: () => api<Report>(`/api/reports/daily?date=${date}`),
  });

  async function download() {
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

  // Analytics computations
  const totalBarRevenue = (r?.itemsRevenue ?? 0) + (r?.quickSales ?? 0);
  const gameShare = r && r.totalRevenue > 0 ? Math.round((r.gameRevenue / r.totalRevenue) * 100) : 0;
  const barShare = r && r.totalRevenue > 0 ? Math.round((totalBarRevenue / r.totalRevenue) * 100) : 0;
  const avgSession = r && r.sessionCount > 0 ? Math.round(r.totalRevenue / r.sessionCount) : 0;
  const profitMargin = r && r.totalRevenue > 0 ? Math.round((r.net / r.totalRevenue) * 100) : 0;

  // Hourly chart peak
  const peak = Math.max(1, ...(r?.hourly ?? []).map((h) => h.amount));
  const peakHour = (r?.hourly ?? []).reduce(
    (max, h) => (h.amount > max.amount ? h : max),
    { hour: 0, amount: 0, sessions: 0 },
  );

  // Method payments total
  const methodTotal = Object.values(r?.byMethod ?? {}).reduce((acc, v) => acc + v, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2 sm:p-4 md:p-6">
      {/* Header & Date Controls */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white md:text-2xl">
            Tahlil va Kunlik Hisobot
          </h1>
          <p className="text-xs text-slate-400">
            Klub moliyaviy oqimi, soatlik yuklama va statistik ko'rsatkichlar
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          {/* Quick Date Pills */}
          <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setDate(bugun())}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                date === bugun()
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Bugun
            </button>
            <button
              type="button"
              onClick={() => setDate(kecha())}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                date === kecha()
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Kecha
            </button>
          </div>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="tap rounded-xl bg-slate-900 px-3 py-2 text-xs text-white outline-none ring-1 ring-slate-800 focus:ring-emerald-600"
          />

          <button
            type="button"
            onClick={() => window.print()}
            className="tap flex items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Chop etish
          </button>

          {isManager(user) && (
            <button
              type="button"
              onClick={() => void download()}
              className="tap flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Excel
            </button>
          )}
        </div>
      </header>

      {query.isLoading && (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 text-sm text-slate-400">
          Yuklanmoqda…
        </div>
      )}

      {r && (
        <>
          {/* KPI Summary Cards */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Jami Tushum */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-sm shadow-xl">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Jami Tushum</span>
                <span className="rounded-md bg-emerald-950/80 border border-emerald-800/40 px-1.5 py-0.5 text-[10px] text-emerald-400">
                  {r.sessionCount} seans
                </span>
              </div>
              <p className="mt-2 font-mono text-xl font-bold tracking-tight text-white md:text-2xl">
                {summa(r.totalRevenue)}
                <span className="ml-1 text-xs font-normal text-slate-400">so'm</span>
              </p>
              {r.discounts > 0 && (
                <p className="mt-1 text-[11px] text-amber-400/90">
                  Chegirmalar: -{summa(r.discounts)} so'm
                </p>
              )}
            </div>

            {/* Sof Foyda */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-800/50 bg-gradient-to-br from-emerald-950/40 to-slate-900/90 p-4 shadow-xl">
              <div className="flex items-center justify-between text-xs text-emerald-300/80">
                <span>Sof Natija</span>
                <span className="rounded-md bg-emerald-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {profitMargin}% marja
                </span>
              </div>
              <p className="mt-2 font-mono text-xl font-bold tracking-tight text-emerald-400 md:text-2xl">
                {summa(r.net)}
                <span className="ml-1 text-xs font-normal text-emerald-300/70">so'm</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Tushum minus chiqimlar
              </p>
            </div>

            {/* Chiqimlar */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-sm shadow-xl">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Jami Chiqim</span>
                <span className="rounded-md bg-red-950/80 border border-red-800/40 px-1.5 py-0.5 text-[10px] text-red-400">
                  {r.expenses.length} modda
                </span>
              </div>
              <p className="mt-2 font-mono text-xl font-bold tracking-tight text-red-400 md:text-2xl">
                -{summa(r.totalExpenses)}
                <span className="ml-1 text-xs font-normal text-slate-400">so'm</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Xarajatlar va to'lovlar
              </p>
            </div>

            {/* O'rtacha hisob */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-sm shadow-xl">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>O'rtacha Seans</span>
                <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                  Har mijozga
                </span>
              </div>
              <p className="mt-2 font-mono text-xl font-bold tracking-tight text-white md:text-2xl">
                {summa(avgSession)}
                <span className="ml-1 text-xs font-normal text-slate-400">so'm</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                O'rtacha chek miqdori
              </p>
            </div>
          </section>

          {/* Revenue Split: O'yin vs Bufet */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">
                Daromad Manbalari Taqsimoti
              </h2>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-emerald-500" />
                  <span className="text-slate-300">O'yin: <strong>{summa(r.gameRevenue)} so'm</strong> ({gameShare}%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-sky-500" />
                  <span className="text-slate-300">Bufet / Kassa: <strong>{summa(totalBarRevenue)} so'm</strong> ({barShare}%)</span>
                </div>
              </div>
            </div>

            {/* Progress split bar */}
            <div className="h-4 w-full overflow-hidden rounded-full bg-slate-950 p-0.5 flex gap-0.5">
              <div
                style={{ width: `${gameShare}%` }}
                className="h-full rounded-l-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                title={`O'yin: ${gameShare}%`}
              />
              <div
                style={{ width: `${barShare}%` }}
                className="h-full rounded-r-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-500"
                title={`Bufet: ${barShare}%`}
              />
            </div>
          </section>

          {/* 24-Hour Timeline / Hourly Bar Chart */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Soatlik Yuklama va Tushum Dinamikasi</h2>
                <p className="text-xs text-slate-400">Kun davomida mijozlar faolligi va pik vaqtlari</p>
              </div>

              {peakHour.amount > 0 && (
                <div className="rounded-xl bg-amber-950/60 border border-amber-800/50 px-3 py-1.5 text-xs text-amber-300">
                  ⭐ Eng gavjum vaqt: <strong>{String(peakHour.hour).padStart(2, '0')}:00</strong> ({summa(peakHour.amount)} so'm · {peakHour.sessions} seans)
                </div>
              )}
            </div>

            {/* Interactive Visual Bar Chart */}
            <div className="flex h-44 items-end gap-1.5 pt-6 pb-2 px-2 overflow-x-auto">
              {r.hourly.map((h) => {
                const heightPct = peak > 0 ? Math.max(4, Math.round((h.amount / peak) * 100)) : 4;
                const isSelected = selectedHour === h.hour;
                const isPeak = h.hour === peakHour.hour && h.amount > 0;

                return (
                  <div
                    key={h.hour}
                    onClick={() => setSelectedHour(isSelected ? null : h.hour)}
                    className="group relative flex flex-1 flex-col items-center justify-end h-full cursor-pointer min-w-[20px]"
                  >
                    {/* Tooltip on hover / selected */}
                    <div
                      className={`pointer-events-none absolute -top-10 z-20 whitespace-nowrap rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-[10px] text-white shadow-xl transition-all ${
                        isSelected ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100'
                      }`}
                    >
                      <span className="font-bold">{String(h.hour).padStart(2, '0')}:00</span> — {summa(h.amount)} so'm ({h.sessions} seans)
                    </div>

                    {/* Column bar */}
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-t-md transition-all duration-300 ${
                        isPeak
                          ? 'bg-gradient-to-t from-amber-600 to-amber-400'
                          : h.amount > 0
                          ? 'bg-gradient-to-t from-emerald-600 to-teal-400 group-hover:brightness-125'
                          : 'bg-slate-800/40'
                      } ${isSelected ? 'ring-2 ring-white' : ''}`}
                    />

                    {/* Hour label below */}
                    <span className="mt-2 text-[10px] text-slate-400">
                      {h.hour % 2 === 0 ? String(h.hour).padStart(2, '0') : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Dual Column Distribution */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* To'lov Turlari */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
              <h2 className="text-sm font-semibold text-white mb-3">To'lov Turlari Bo'yicha</h2>
              <div className="space-y-3">
                {Object.entries(r.byMethod).map(([m, v]) => {
                  const cfg = METHOD_CONFIG[m] ?? { label: m, color: 'bg-slate-500 text-slate-400' };
                  const pct = methodTotal > 0 ? Math.round((v / methodTotal) * 100) : 0;
                  return (
                    <div key={m} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${cfg.color.split(' ')[0]}`} />
                          <span className="font-medium text-slate-200">{cfg.label}</span>
                        </span>
                        <div className="text-right">
                          <span className="font-bold text-white">{summa(v)} so'm</span>
                          <span className="ml-1.5 text-slate-400">({pct}%)</span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950">
                        <div
                          style={{ width: `${pct}%` }}
                          className={`h-full rounded-full ${cfg.color.split(' ')[0]}`}
                        />
                      </div>
                    </div>
                  );
                })}
                {Object.keys(r.byMethod).length === 0 && (
                  <p className="text-xs text-slate-500 py-4 text-center">To'lovlar qayd etilmagan.</p>
                )}
              </div>
            </section>

            {/* Joy Turlari */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
              <h2 className="text-sm font-semibold text-white mb-3">Joy Turlari Bo'yicha Tushum</h2>
              <div className="space-y-3">
                {r.byType.map((t) => {
                  const pct = r.totalRevenue > 0 ? Math.round((t.revenue / r.totalRevenue) * 100) : 0;
                  return (
                    <div key={t.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-slate-200">
                          {t.name} <span className="text-slate-400 font-normal">({t.sessions} seans)</span>
                        </span>
                        <div className="text-right">
                          <span className="font-bold text-white">{summa(t.revenue)} so'm</span>
                          <span className="ml-1.5 text-slate-400">({pct}%)</span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950">
                        <div
                          style={{ width: `${pct}%` }}
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                        />
                      </div>
                    </div>
                  );
                })}
                {r.byType.length === 0 && (
                  <p className="text-xs text-slate-500 py-4 text-center">Joylar bo'yicha ma'lumot yo'q.</p>
                )}
              </div>
            </section>
          </div>

          {/* Top Mahsulotlar (Bufet) */}
          {r.topProducts.length > 0 && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
              <h2 className="text-sm font-semibold text-white mb-3">Eng Ko'p Sotilgan Mahsulotlar</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">O'rin</th>
                      <th className="py-2.5 px-3">Mahsulot nomi</th>
                      <th className="py-2.5 px-3 text-right">Sotilgan miqdor</th>
                      <th className="py-2.5 px-3 text-right">Savdo summasi</th>
                      <th className="py-2.5 px-3 text-right">Foyda (Marja)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {r.topProducts.map((p, idx) => (
                      <tr key={p.name} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3">
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full font-bold text-[10px] ${
                              idx === 0
                                ? 'bg-amber-500 text-black'
                                : idx === 1
                                ? 'bg-slate-300 text-black'
                                : idx === 2
                                ? 'bg-amber-700 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-200">{p.name}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                          {p.qty} dona
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-white">
                          {summa(p.revenue)} so'm
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-400">
                          +{summa(p.margin)} so'm
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Pul Harakati va Chiqimlar */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
            <h2 className="text-sm font-semibold text-white mb-3">Kassa va Pul Harakati Tafsilotlari</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800/80 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Kassaga tushgan jami to'lovlar:</span>
                  <span className="font-bold text-white">{summa(r.totalPaid)} so'm</span>
                </div>
                {r.prepayments > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Shundan avans (balans/paket):</span>
                    <span className="font-mono text-amber-400">+{summa(r.prepayments)} so'm</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400">
                  <span>Chiqimlar (xarajatlar):</span>
                  <span className="font-mono text-red-400">−{summa(r.totalExpenses)} so'm</span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-2 font-bold">
                  <span className="text-slate-200">Kassa sof harakati:</span>
                  <span className={`font-mono ${r.cashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {summa(r.cashFlow)} so'm
                  </span>
                </div>
              </div>

              {/* Chiqimlar ro'yxati */}
              <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800/80 text-xs">
                <div className="font-semibold text-slate-300 mb-2">Chiqim moddalari:</div>
                {r.expenses.length > 0 ? (
                  <ul className="space-y-1.5">
                    {r.expenses.map((e, idx) => (
                      <li key={idx} className="flex justify-between text-slate-300">
                        <span>{e.category}</span>
                        <span className="font-mono text-red-400">−{summa(e.amount)} so'm</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500">Bu kunda chiqimlar bo'lmagan.</p>
                )}
              </div>
            </div>
          </section>

          {/* Smenalar Ro'yxati */}
          {r.shifts.length > 0 && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
              <h2 className="text-sm font-semibold text-white mb-3">Kun Smenalari</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {r.shifts.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col justify-between rounded-xl bg-slate-950/60 p-3.5 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{s.operator.fullName}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                          s.cashDiff === null
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : Math.abs(s.cashDiff) > 0
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {s.cashDiff === null
                          ? 'Ochiq smena'
                          : s.cashDiff === 0
                          ? 'Kassa to\'g\'ri'
                          : `Farq: ${summa(s.cashDiff)} so'm`}
                      </span>
                    </div>
                    <div className="mt-2 text-slate-400">
                      Boshlang'ich naqd: <strong className="text-slate-200">{summa(s.openingCash)} so'm</strong>
                    </div>
                    {s.note && <p className="mt-1 italic text-slate-400">"{s.note}"</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
