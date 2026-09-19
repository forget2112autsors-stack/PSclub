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

interface HeatmapData {
  totalStations: number;
  daysAnalyzed: number;
  peakDay: string;
  peakHour: string;
  maxOccupancy: number;
  days: string[];
  matrix: { day: number; hour: number; occupancy: number; busyCount: number }[][];
}

interface OperatorStat {
  id: string;
  fullName: string;
  role: string;
  shiftCount: number;
  sessionCount: number;
  totalRevenue: number;
  avgCheck: number;
  totalCashDiff: number;
  cancelledCount: number;
}

interface CustomerAnalytics {
  totalCustomers: number;
  regularCount: number;
  newCount: number;
  atRiskCount: number;
  totalSpentAll: number;
  topCustomers: {
    id: string;
    fullName: string;
    phone: string | null;
    balance: number;
    bonusPoints: number;
    totalSpent: number;
    sessionCount: number;
    avgSpent: number;
    lastVisit: string | null;
    segment: 'REGULAR' | 'NEW' | 'AT_RISK' | 'OCCASIONAL';
  }[];
}

interface ComparisonData {
  period: 'week' | 'month';
  days: number;
  current: { revenue: number; sessions: number; expenses: number; net: number };
  previous: { revenue: number; sessions: number; expenses: number; net: number };
  growth: { revenue: number; sessions: number; net: number };
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

type ReportTab = 'daily' | 'heatmap' | 'operators' | 'customers' | 'comparison';

export function Reports() {
  const user = useAuth((s) => s.user);
  const manager = isManager(user);
  const [activeTab, setActiveTab] = useState<ReportTab>('daily');
  const [date, setDate] = useState(bugun);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  // Comparison period
  const [comparePeriod, setComparePeriod] = useState<'week' | 'month'>('week');

  // Daily report query
  const dailyQuery = useQuery({
    queryKey: ['report', date],
    queryFn: () => api<Report>(`/api/reports/daily?date=${date}`),
    enabled: activeTab === 'daily',
  });

  // Heatmap query
  const heatmapQuery = useQuery({
    queryKey: ['heatmap'],
    queryFn: () => api<HeatmapData>('/api/reports/heatmap?days=14'),
    enabled: activeTab === 'heatmap',
  });

  // Operators query
  const operatorsQuery = useQuery({
    queryKey: ['operator-stats'],
    queryFn: () => api<OperatorStat[]>('/api/reports/operators?days=30'),
    enabled: activeTab === 'operators' && manager,
  });

  // Customer analytics query
  const customerAnalyticsQuery = useQuery({
    queryKey: ['customer-analytics'],
    queryFn: () => api<CustomerAnalytics>('/api/reports/customers-analytics'),
    enabled: activeTab === 'customers' && manager,
  });

  // Period comparison query
  const comparisonQuery = useQuery({
    queryKey: ['comparison', comparePeriod],
    queryFn: () => api<ComparisonData>(`/api/reports/comparison?period=${comparePeriod}`),
    enabled: activeTab === 'comparison',
  });

  async function downloadExcel() {
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

  const r = dailyQuery.data;

  // Daily computations
  const totalBarRevenue = (r?.itemsRevenue ?? 0) + (r?.quickSales ?? 0);
  const gameShare = r && r.totalRevenue > 0 ? Math.round((r.gameRevenue / r.totalRevenue) * 100) : 0;
  const barShare = r && r.totalRevenue > 0 ? Math.round((totalBarRevenue / r.totalRevenue) * 100) : 0;
  const avgSession = r && r.sessionCount > 0 ? Math.round(r.totalRevenue / r.sessionCount) : 0;
  const profitMargin = r && r.totalRevenue > 0 ? Math.round((r.net / r.totalRevenue) * 100) : 0;
  const peak = Math.max(1, ...(r?.hourly ?? []).map((h) => h.amount));
  const peakHour = (r?.hourly ?? []).reduce(
    (max, h) => (h.amount > max.amount ? h : max),
    { hour: 0, amount: 0, sessions: 0 },
  );
  const methodTotal = Object.values(r?.byMethod ?? {}).reduce((acc, v) => acc + v, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2 sm:p-4 md:p-6">
      {/* Top Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white md:text-2xl">
            Tahlil va Hisobotlar
          </h1>
          <p className="text-xs text-slate-400">
            Klub moliyaviy oqimi, xodimlar samaradorligi va mijozlar statistikasi
          </p>
        </div>

        {/* Global actions for Daily tab */}
        {activeTab === 'daily' && (
          <div className="no-print flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setDate(bugun())}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  date === bugun() ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Bugun
              </button>
              <button
                type="button"
                onClick={() => setDate(kecha())}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  date === kecha() ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
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

            {manager && (
              <button
                type="button"
                onClick={() => void downloadExcel()}
                className="tap flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Excel
              </button>
            )}
          </div>
        )}
      </header>

      {/* Navigation Tabs */}
      <div className="no-print flex flex-wrap gap-1 rounded-2xl bg-slate-900/80 p-1.5 border border-slate-800 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setActiveTab('daily')}
          className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === 'daily'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          📊 Kunlik Tushum
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('heatmap')}
          className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === 'heatmap'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          🔥 Bandlik Xaritasi (Heatmap)
        </button>
        {manager && (
          <button
            type="button"
            onClick={() => setActiveTab('operators')}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'operators'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            👥 Xodimlar Kesimi
          </button>
        )}
        {manager && (
          <button
            type="button"
            onClick={() => setActiveTab('customers')}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'customers'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            ⭐ Mijozlar Segmentatsiyasi
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('comparison')}
          className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === 'comparison'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          📈 Davriy Taqqoslash
        </button>
      </div>

      {/* TAB 1: KUNLIK TUSHUM */}
      {activeTab === 'daily' && (
        <>
          {dailyQuery.isLoading && (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 text-sm text-slate-400">
              Yuklanmoqda…
            </div>
          )}

          {r && (
            <div className="space-y-6">
              {/* KPI Summary Cards */}
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

              {/* 24-Hour Timeline */}
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
                        <div
                          className={`pointer-events-none absolute -top-10 z-20 whitespace-nowrap rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-[10px] text-white shadow-xl transition-all ${
                            isSelected ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100'
                          }`}
                        >
                          <span className="font-bold">{String(h.hour).padStart(2, '0')}:00</span> — {summa(h.amount)} so'm ({h.sessions} seans)
                        </div>

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

                        <span className="mt-2 text-[10px] text-slate-400">
                          {h.hour % 2 === 0 ? String(h.hour).padStart(2, '0') : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Distribution Grid */}
              <div className="grid gap-6 md:grid-cols-2">
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
                  </div>
                </section>

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
                  </div>
                </section>
              </div>

              {/* Top Products */}
              {r.topProducts.length > 0 && (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
                  <h2 className="text-sm font-semibold text-white mb-3">Eng Ko'p Sotilgan Mahsulotlar (Bufet)</h2>
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
            </div>
          )}
        </>
      )}

      {/* TAB 2: BANDLIK ISSIQLIK XARITASI (HEATMAP) */}
      {activeTab === 'heatmap' && (
        <div className="space-y-6">
          {heatmapQuery.isLoading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 text-sm text-slate-400">
              Issiqlik xaritasi hisoblanmoqda…
            </div>
          ) : heatmapQuery.data ? (
            <>
              {/* Heatmap summary cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
                  <span className="text-xs text-slate-400">Faol Joylar</span>
                  <p className="mt-1 font-mono text-xl font-bold text-white">
                    {heatmapQuery.data.totalStations} ta stansiya
                  </p>
                  <p className="text-[11px] text-slate-500">Tahlil: oxirgi 14 kun</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
                  <span className="text-xs text-slate-400">Eng Gavjum Kun</span>
                  <p className="mt-1 font-mono text-xl font-bold text-emerald-400">
                    {heatmapQuery.data.peakDay}
                  </p>
                  <p className="text-[11px] text-slate-500">Haftalik eng yuqori yuklama</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
                  <span className="text-xs text-slate-400">Pik Soat Oralig'i</span>
                  <p className="mt-1 font-mono text-xl font-bold text-amber-400">
                    {heatmapQuery.data.peakHour}
                  </p>
                  <p className="text-[11px] text-slate-500">Kunlik eng qizg'in payt</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
                  <span className="text-xs text-slate-400">Maksimal Bandlik</span>
                  <p className="mt-1 font-mono text-xl font-bold text-white">
                    {heatmapQuery.data.maxOccupancy}%
                  </p>
                  <p className="text-[11px] text-slate-500">Imkoniyatdan foydalanish</p>
                </div>
              </div>

              {/* Heatmap Matrix Table */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      Hafta Kunlari va Soatlar Kesimida Joylar Bandligi (00:00 – 23:00)
                    </h2>
                    <p className="text-xs text-slate-400">
                      Har bir katak stansiyalarning o'rtacha bandlik foizini ko'rsatadi
                    </p>
                  </div>

                  {/* Heatmap Legend */}
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="h-3 w-3 rounded bg-slate-800 border border-slate-700" /> Bo'sh (0-20%)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-3 w-3 rounded bg-emerald-700" /> 21-50%
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-3 w-3 rounded bg-amber-600" /> 51-75%
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-3 w-3 rounded bg-red-600" /> 76-100%
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto pb-2">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr>
                        <th className="py-2 px-2 text-left text-xs text-slate-400 font-medium min-w-[100px]">Kun</th>
                        {Array.from({ length: 24 }).map((_, h) => (
                          <th key={h} className="p-1 text-[10px] text-slate-500 font-mono">
                            {String(h).padStart(2, '0')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {heatmapQuery.data.days.map((dayName, dayIdx) => (
                        <tr key={dayName} className="hover:bg-slate-800/20">
                          <td className="py-2 px-2 text-left text-xs font-medium text-slate-300 whitespace-nowrap">
                            {dayName}
                          </td>
                          {heatmapQuery.data.matrix[dayIdx].map((cell) => {
                            let bgClass = 'bg-slate-900/60 text-slate-500';
                            if (cell.occupancy > 75) {
                              bgClass = 'bg-red-600 text-white font-bold shadow-sm';
                            } else if (cell.occupancy > 50) {
                              bgClass = 'bg-amber-600 text-white font-semibold';
                            } else if (cell.occupancy > 20) {
                              bgClass = 'bg-emerald-700 text-emerald-100 font-medium';
                            } else if (cell.occupancy > 0) {
                              bgClass = 'bg-emerald-950 text-emerald-400';
                            }

                            return (
                              <td key={cell.hour} className="p-0.5">
                                <div
                                  title={`${dayName} ${String(cell.hour).padStart(2, '0')}:00 — Bandlik: ${cell.occupancy}% (~${cell.busyCount} joy)`}
                                  className={`h-7 w-7 rounded flex items-center justify-center text-[10px] cursor-default transition hover:scale-110 hover:ring-2 hover:ring-white ${bgClass}`}
                                >
                                  {cell.occupancy > 0 ? `${cell.occupancy}%` : '—'}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* TAB 3: XODIMLAR KESIMI */}
      {activeTab === 'operators' && manager && (
        <div className="space-y-6">
          {operatorsQuery.isLoading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 text-sm text-slate-400">
              Xodimlar statistikasi yuklanmoqda…
            </div>
          ) : operatorsQuery.data ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-white">
                  Xodimlar (Operatorlar) Ish Faoliyati va Samaradorligi
                </h2>
                <p className="text-xs text-slate-400">Oxirgi 30 kunlik smenalar, aylanmalar va intizom ko'rsatkichlari</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">Xodim</th>
                      <th className="py-2.5 px-3">Roli</th>
                      <th className="py-2.5 px-3 text-right">Smenalar</th>
                      <th className="py-2.5 px-3 text-right">Seanslar</th>
                      <th className="py-2.5 px-3 text-right">Jami Aylanma</th>
                      <th className="py-2.5 px-3 text-right">O'rtacha Chek</th>
                      <th className="py-2.5 px-3 text-right">Kassa Farqi</th>
                      <th className="py-2.5 px-3 text-right">Bekor qilingan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {operatorsQuery.data.map((op) => (
                      <tr key={op.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3 font-semibold text-white">{op.fullName}</td>
                        <td className="py-3 px-3">
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                            {op.role}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                          {op.shiftCount} ta
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                          {op.sessionCount} ta
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-emerald-400">
                          {summa(op.totalRevenue)} so'm
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                          {summa(op.avgCheck)} so'm
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          <span className={op.totalCashDiff > 0 ? 'text-amber-400 font-semibold' : 'text-emerald-400'}>
                            {op.totalCashDiff === 0 ? '0 (to\'liq)' : `${summa(op.totalCashDiff)} so'm`}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          <span className={op.cancelledCount > 0 ? 'text-red-400 font-semibold' : 'text-slate-400'}>
                            {op.cancelledCount} ta
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 4: MIJOZLAR SEGMENTATSIYASI */}
      {activeTab === 'customers' && manager && (
        <div className="space-y-6">
          {customerAnalyticsQuery.isLoading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 text-sm text-slate-400">
              Mijozlar tahlili hisoblanmoqda…
            </div>
          ) : customerAnalyticsQuery.data ? (
            <>
              {/* Segments Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
                  <span className="text-xs text-slate-400">Barcha Mijozlar</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-white">
                    {customerAnalyticsQuery.data.totalCustomers} nafar
                  </p>
                  <p className="text-[11px] text-slate-500">Ro'yxatga olinganlar</p>
                </div>
                <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/30 p-4 shadow-xl">
                  <span className="text-xs text-emerald-400">Doimiy Mijozlar</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-emerald-400">
                    {customerAnalyticsQuery.data.regularCount} nafar
                  </p>
                  <p className="text-[11px] text-emerald-400/70">Haftalik faol tashrifchilar</p>
                </div>
                <div className="rounded-2xl border border-sky-800/40 bg-sky-950/30 p-4 shadow-xl">
                  <span className="text-xs text-sky-400">Yangi Mijozlar</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-sky-400">
                    {customerAnalyticsQuery.data.newCount} nafar
                  </p>
                  <p className="text-[11px] text-sky-400/70">Oxirgi 30 kunda qo'shilgan</p>
                </div>
                <div className="rounded-2xl border border-amber-800/40 bg-amber-950/30 p-4 shadow-xl">
                  <span className="text-xs text-amber-400">Xavfli / Yo'qolgan</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-amber-400">
                    {customerAnalyticsQuery.data.atRiskCount} nafar
                  </p>
                  <p className="text-[11px] text-amber-400/70">30+ kundan beri kelmagan</p>
                </div>
              </div>

              {/* Top 20 Customers */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-white">
                    Top-20 Eng Faol va Ko'p Sarflagan Mijozlar
                  </h2>
                  <p className="text-xs text-slate-400">Klub daromadiga eng katta hissa qo'shayotgan mehmonlar</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="py-2.5 px-3">O'rin</th>
                        <th className="py-2.5 px-3">F.I.Sh.</th>
                        <th className="py-2.5 px-3">Telefon</th>
                        <th className="py-2.5 px-3">Segment</th>
                        <th className="py-2.5 px-3 text-right">Jami Xarajat</th>
                        <th className="py-2.5 px-3 text-right">Seanslar</th>
                        <th className="py-2.5 px-3 text-right">O'rtacha Chek</th>
                        <th className="py-2.5 px-3 text-right">Bonus Ballar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {customerAnalyticsQuery.data.topCustomers.map((c, idx) => (
                        <tr key={c.id} className="hover:bg-slate-800/40 transition">
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
                          <td className="py-2.5 px-3 font-semibold text-white">{c.fullName}</td>
                          <td className="py-2.5 px-3 text-slate-400 font-mono">{c.phone ?? '—'}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                c.segment === 'REGULAR'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : c.segment === 'NEW'
                                  ? 'bg-sky-950 text-sky-400 border border-sky-800'
                                  : c.segment === 'AT_RISK'
                                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {c.segment === 'REGULAR'
                                ? 'Doimiy'
                                : c.segment === 'NEW'
                                ? 'Yangi'
                                : c.segment === 'AT_RISK'
                                ? 'Qaytmaslik xavfi'
                                : 'Davriy'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                            {summa(c.totalSpent)} so'm
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            {c.sessionCount} ta
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            {summa(c.avgSpent)} so'm
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                            {c.bonusPoints > 0 ? `${summa(c.bonusPoints)} b` : '0'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* TAB 5: DAVRIY TAQQOSLASH */}
      {activeTab === 'comparison' && (
        <div className="space-y-6">
          {/* Period Toggle */}
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-white">Davrlar Bo'yicha Taqqoslash va O'sish</h2>
            <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setComparePeriod('week')}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  comparePeriod === 'week' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Haftalik (7 kun)
              </button>
              <button
                type="button"
                onClick={() => setComparePeriod('month')}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  comparePeriod === 'month' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Oylik (30 kun)
              </button>
            </div>
          </div>

          {comparisonQuery.isLoading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 text-sm text-slate-400">
              Taqqoslash hisoblanmoqda…
            </div>
          ) : comparisonQuery.data ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Tushum taqqoslash */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Jami Tushum</span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      comparisonQuery.data.growth.revenue >= 0
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-red-950 text-red-400 border border-red-800'
                    }`}
                  >
                    {comparisonQuery.data.growth.revenue >= 0 ? '+' : ''}
                    {comparisonQuery.data.growth.revenue}%
                  </span>
                </div>
                <p className="font-mono text-2xl font-bold text-white">
                  {summa(comparisonQuery.data.current.revenue)} so'm
                </p>
                <div className="text-xs text-slate-400 pt-2 border-t border-slate-800 flex justify-between">
                  <span>Oldingi davr:</span>
                  <span className="font-mono text-slate-300">{summa(comparisonQuery.data.previous.revenue)} so'm</span>
                </div>
              </div>

              {/* Seanslar taqqoslash */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Seanslar Soni</span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      comparisonQuery.data.growth.sessions >= 0
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-red-950 text-red-400 border border-red-800'
                    }`}
                  >
                    {comparisonQuery.data.growth.sessions >= 0 ? '+' : ''}
                    {comparisonQuery.data.growth.sessions}%
                  </span>
                </div>
                <p className="font-mono text-2xl font-bold text-white">
                  {comparisonQuery.data.current.sessions} ta
                </p>
                <div className="text-xs text-slate-400 pt-2 border-t border-slate-800 flex justify-between">
                  <span>Oldingi davr:</span>
                  <span className="font-mono text-slate-300">{comparisonQuery.data.previous.sessions} ta</span>
                </div>
              </div>

              {/* Sof foyda taqqoslash */}
              <div className="rounded-2xl border border-emerald-800/40 bg-gradient-to-br from-emerald-950/40 to-slate-900/90 p-5 shadow-xl space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-emerald-300 font-medium">Sof Foyda</span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      comparisonQuery.data.growth.net >= 0
                        ? 'bg-emerald-900 text-emerald-300'
                        : 'bg-red-900 text-red-300'
                    }`}
                  >
                    {comparisonQuery.data.growth.net >= 0 ? '+' : ''}
                    {comparisonQuery.data.growth.net}%
                  </span>
                </div>
                <p className="font-mono text-2xl font-bold text-emerald-400">
                  {summa(comparisonQuery.data.current.net)} so'm
                </p>
                <div className="text-xs text-slate-400 pt-2 border-t border-slate-800 flex justify-between">
                  <span>Oldingi davr:</span>
                  <span className="font-mono text-slate-300">{summa(comparisonQuery.data.previous.net)} so'm</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
