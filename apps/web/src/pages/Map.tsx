import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api.ts';
import { useRealtime } from '../lib/realtime.ts';
import { SessionDetail } from '../components/SessionDetail.tsx';
import { SessionOpen } from '../components/SessionOpen.tsx';

interface MapSession {
  id: string;
  startedAt: string;
  paused: boolean;
  gamepads: number;
  customer: string | null;
  tariffName: string | null;
  activeMinutes: number;
  prepaidMinutes: number | null;
  paymentMode: 'PREPAID' | 'POSTPAID';
  totalAmount: number;
  debt: number;
  creditExceeded: boolean;
}

interface MapStation {
  id: string;
  number: number;
  type: string;
  status: 'FREE' | 'BUSY' | 'OUT_OF_SERVICE';
  note: string | null;
  gamepadCount?: number;
  session: MapSession | null;
}

interface MapResponse {
  stations: MapStation[];
  shift: { id: string } | null;
  serverTime: string;
}

type Look = 'free' | 'busy' | 'soon' | 'over' | 'paused' | 'off';

const LOOK: Record<Look, { card: string; label: string }> = {
  free: { card: 'bg-slate-800/60 border-slate-700', label: 'Bo\'sh' },
  busy: { card: 'bg-emerald-900/40 border-emerald-700', label: 'Band' },
  soon: { card: 'bg-amber-900/40 border-amber-600', label: 'Tugashiga oz qoldi' },
  over: { card: 'bg-red-900/50 border-red-600', label: 'Diqqat' },
  paused: { card: 'bg-sky-900/40 border-sky-700', label: 'Pauza' },
  off: { card: 'bg-black/60 border-slate-800', label: 'Xizmatda emas' },
};

const SCHEME_LOOK: Record<
  Look,
  {
    border: string;
    glow: string;
    screenBg: string;
    screenText: string;
    sofaBg: string;
    badge: string;
    dot: string;
    label: string;
  }
> = {
  free: {
    border: 'border-slate-700/80 hover:border-emerald-500/80',
    glow: 'group-hover:shadow-[0_0_25px_rgba(16,185,129,0.2)]',
    screenBg: 'bg-slate-950/90 border-slate-700',
    screenText: 'text-slate-400',
    sofaBg: 'bg-slate-800/70 border-slate-700',
    badge: 'bg-slate-800 text-slate-300 border-slate-700',
    dot: 'bg-slate-500',
    label: 'Bo\'sh',
  },
  busy: {
    border: 'border-emerald-500/70 shadow-[0_0_20px_rgba(16,185,129,0.25)]',
    glow: 'shadow-[0_0_30px_rgba(16,185,129,0.35)]',
    screenBg: 'bg-gradient-to-b from-emerald-950/80 to-slate-950 border-emerald-600/60',
    screenText: 'text-emerald-300',
    sofaBg: 'bg-emerald-950/80 border-emerald-600/70 shadow-[0_0_12px_rgba(16,185,129,0.25)]',
    badge: 'bg-emerald-900/80 text-emerald-200 border-emerald-500/60',
    dot: 'bg-emerald-400 animate-pulse',
    label: 'Band',
  },
  soon: {
    border: 'border-amber-500/90 shadow-[0_0_25px_rgba(245,158,11,0.35)]',
    glow: 'shadow-[0_0_35px_rgba(245,158,11,0.45)]',
    screenBg: 'bg-gradient-to-b from-amber-950/80 to-slate-950 border-amber-500/70',
    screenText: 'text-amber-300',
    sofaBg: 'bg-amber-950/80 border-amber-600/70 shadow-[0_0_15px_rgba(245,158,11,0.3)]',
    badge: 'bg-amber-900/80 text-amber-200 border-amber-500/70',
    dot: 'bg-amber-400 animate-ping',
    label: 'Tugashiga oz qoldi',
  },
  over: {
    border: 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.45)]',
    glow: 'shadow-[0_0_40px_rgba(239,68,68,0.55)]',
    screenBg: 'bg-gradient-to-b from-red-950/90 to-slate-950 border-red-500/80',
    screenText: 'text-red-300',
    sofaBg: 'bg-red-950/90 border-red-600/80 shadow-[0_0_18px_rgba(239,68,68,0.35)]',
    badge: 'bg-red-900/90 text-red-200 border-red-500/80',
    dot: 'bg-red-500 animate-ping',
    label: 'Diqqat (Limit)',
  },
  paused: {
    border: 'border-sky-500/80 shadow-[0_0_20px_rgba(14,165,233,0.3)]',
    glow: 'shadow-[0_0_30px_rgba(14,165,233,0.35)]',
    screenBg: 'bg-gradient-to-b from-sky-950/80 to-slate-950 border-sky-500/70',
    screenText: 'text-sky-300',
    sofaBg: 'bg-sky-950/80 border-sky-600/70 shadow-[0_0_12px_rgba(14,165,233,0.25)]',
    badge: 'bg-sky-900/80 text-sky-200 border-sky-500/70',
    dot: 'bg-sky-400',
    label: 'Pauza',
  },
  off: {
    border: 'border-slate-800 opacity-60',
    glow: '',
    screenBg: 'bg-black/90 border-slate-800',
    screenText: 'text-slate-600',
    sofaBg: 'bg-slate-950 border-slate-900',
    badge: 'bg-slate-900 text-slate-500 border-slate-800',
    dot: 'bg-slate-700',
    label: 'Xizmatda emas',
  },
};

const summa = (v: number) => v.toLocaleString('uz-UZ');

function clock(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(totalMinutes));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Oxirgi yangilanishdan beri o'tgan vaqtni qo'shib, taymerni oldinga suradi. */
function liveMinutes(session: MapSession, fetchedAt: number, tick: number): number {
  if (session.paused) return session.activeMinutes;
  return session.activeMinutes + (tick - fetchedAt) / 60_000;
}

function lookOf(station: MapStation, minutes: number): Look {
  if (station.status === 'OUT_OF_SERVICE') return 'off';
  if (!station.session) return 'free';
  if (station.session.paused) return 'paused';
  if (station.session.creditExceeded) return 'over';

  const limit = station.session.prepaidMinutes;
  if (limit !== null) {
    if (minutes >= limit) return 'over';
    if (limit - minutes <= 10) return 'soon';
  }
  return 'busy';
}

export function StationMap() {
  const client = useQueryClient();
  const [tick, setTick] = useState(() => Date.now());
  const [opening, setOpening] = useState<MapStation | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'scheme' | 'cards'>(() => {
    return (localStorage.getItem('psklub_map_view') as 'scheme' | 'cards') || 'scheme';
  });

  const handleViewModeChange = (mode: 'scheme' | 'cards') => {
    setViewMode(mode);
    localStorage.setItem('psklub_map_view', mode);
  };

  const query = useQuery({
    queryKey: ['map'],
    queryFn: () => api<MapResponse>('/api/map'),
    refetchInterval: 30_000,
  });

  const bookingsQuery = useQuery({
    queryKey: ['active-bookings-map'],
    queryFn: () =>
      api<
        {
          id: string;
          stationId: string;
          startsAt: string;
          customer: { fullName: string } | null;
        }[]
      >('/api/bookings?status=ACTIVE'),
    refetchInterval: 30_000,
  });

  const onRefresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: ['map'] });
    void client.invalidateQueries({ queryKey: ['active-bookings-map'] });
  }, [client]);
  const { connected } = useRealtime(onRefresh);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchedAt = query.dataUpdatedAt || Date.now();
  const stations = query.data?.stations ?? [];
  const types = Array.from(new Set(stations.map((s) => s.type)));

  const nextBookingByStation = new Map<string, { time: string; customer: string }>();
  if (bookingsQuery.data) {
    const now = new Date();
    for (const b of bookingsQuery.data) {
      const bTime = new Date(b.startsAt);
      if (bTime.getTime() > now.getTime() - 15 * 60_000 && bTime.getTime() < now.getTime() + 12 * 3600_000) {
        if (!nextBookingByStation.has(b.stationId)) {
          nextBookingByStation.set(b.stationId, {
            time: bTime.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
            customer: b.customer?.fullName ?? 'Mehmon',
          });
        }
      }
    }
  }

  const filteredStations = stations.filter((station) => {
    if (search.trim() && !String(station.number).includes(search.trim())) {
      return false;
    }
    if (typeFilter !== 'all' && station.type !== typeFilter) {
      return false;
    }
    if (statusFilter !== 'all') {
      const minutes = station.session ? liveMinutes(station.session, fetchedAt, tick) : 0;
      const look = lookOf(station, minutes);
      if (statusFilter === 'free' && look !== 'free') return false;
      if (statusFilter === 'busy' && (look !== 'busy' && look !== 'soon' && look !== 'over')) return false;
      if (statusFilter === 'paused' && look !== 'paused') return false;
      if (statusFilter === 'off' && look !== 'off') return false;
    }
    return true;
  });

  const alerts = stations.filter(
    (s) => s.session && (s.session.creditExceeded || lookOf(s, liveMinutes(s.session, fetchedAt, tick)) === 'over'),
  );

  // Zonalar bo'yicha ajratish:
  // VIP xonalar: Alohida qulay kabinalar (masalan: 14-VIP va boshqalar)
  const isVipStation = (s: MapStation) => {
    const t = s.type.toUpperCase();
    const n = (s.note || '').toUpperCase();
    return t.includes('VIP') || n.includes('VIP') || s.number === 14;
  };

  // Retro va Standart zonasi (PS-3)
  const isRetroStation = (s: MapStation) => {
    const t = s.type.toUpperCase();
    const n = (s.note || '').toUpperCase();
    return !isVipStation(s) && (t.includes('PS-3') || t.includes('PS3') || t.includes('RETRO') || n.includes('RETRO'));
  };

  // Umumiy zal (PS-5 / PS-4): Markaziy zaldagi qator stollar
  const isMainHallStation = (s: MapStation) => !isVipStation(s) && !isRetroStation(s);

  const vipStations = filteredStations.filter(isVipStation);
  const retroStations = filteredStations.filter(isRetroStation);
  const mainHallStations = filteredStations.filter(isMainHallStation);

  // Markaziy zal stollarini qatorlarga ajratish (har bir qatorda 4 tadan)
  const mainHallChunkSize = 4;
  const mainHallRows: MapStation[][] = [];
  for (let i = 0; i < mainHallStations.length; i += mainHallChunkSize) {
    mainHallRows.push(mainHallStations.slice(i, i + mainHallChunkSize));
  }

  // Umumiy statistika
  const totalStations = stations.length;
  const busyCount = stations.filter((s) => s.session && !s.session.paused).length;
  const freeCount = stations.filter((s) => !s.session && s.status === 'FREE').length;
  const occupancyRate = totalStations > 0 ? Math.round((busyCount / totalStations) * 100) : 0;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Joylar xaritasi</span>
            <span className="text-xs font-normal text-slate-400">
              ({totalStations} ta joy · {busyCount} band · {freeCount} bo'sh)
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Ko'rinish rejimi: Sxema vs Kartochkalar */}
          <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-1">
            <button
              type="button"
              onClick={() => handleViewModeChange('scheme')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition ${
                viewMode === 'scheme'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🗺</span>
              <span>Zal sxemasi</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition ${
                viewMode === 'cards'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🗂</span>
              <span>Kartochkalar</span>
            </button>
          </div>

          {!query.data?.shift && (
            <span className="rounded-lg bg-amber-950/70 px-3 py-1.5 text-xs font-medium text-amber-300 border border-amber-800/50">
              Smena ochilmagan
            </span>
          )}
          <span className={`text-xs ${connected ? 'text-slate-500' : 'text-red-400'}`}>
            {connected ? '● Jonli aloqa bor' : '○ Aloqa yo\'q'}
          </span>
        </div>
      </header>

      {/* Filtrlar paneli */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Joy raqami..."
          className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-36"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`px-2.5 py-1 text-xs rounded-lg transition ${
              typeFilter === 'all'
                ? 'bg-emerald-600 text-white font-medium'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Barcha turlar
          </button>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-2.5 py-1 text-xs rounded-lg transition ${
                typeFilter === t
                  ? 'bg-emerald-600 text-white font-medium'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-slate-700 mx-1 hidden sm:block" />
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'Barchasi' },
            { id: 'free', label: 'Bo\'sh' },
            { id: 'busy', label: 'Band' },
            { id: 'paused', label: 'Pauza' },
            { id: 'off', label: 'Xizmatda emas' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              className={`px-2.5 py-1 text-xs rounded-lg transition ${
                statusFilter === item.id
                  ? 'bg-emerald-600 text-white font-medium'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {alerts.length > 0 && (
        <p role="alert" className="mb-4 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300 border border-red-800/60">
          Diqqat: {alerts.map((s) => `${s.number}-joy`).join(', ')} — vaqt tugadi yoki limit oshdi.
        </p>
      )}

      {query.isError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">
          Ma'lumot olinmadi. Aloqani tekshiring.
        </p>
      )}

      {/* ========================================================= */}
      {/* 1. INTERAKTIV ZAL SXEMASI (FLOOR PLAN / XONA KO'RINISHI)  */}
      {/* ========================================================= */}
      {viewMode === 'scheme' ? (
        <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 sm:p-6 shadow-2xl relative overflow-hidden">
          {/* Blueprint grid foni */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b18_1px,transparent_1px),linear-gradient(to_bottom,#1e293b18_1px,transparent_1px)] bg-[size:28px_28px] pointer-events-none" />

          {/* Sxema sarlavhasi va mini-afsona (Legend) */}
          <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Klub Zallari Plan-Sxemasi
                </h2>
                <p className="text-xs text-slate-400">
                  Stol yoki ekranning ustiga bosib seansni boshqarishingiz mumkin
                </p>
              </div>
            </div>

            {/* Ranglar afsonasi */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Bo'sh
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Band
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Oz qoldi
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Limit oshdi
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Pauza
              </span>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* ZONA 1: VIP XONALAR — ALOHIDA QULAY KABINALAR                 */}
          {/* (Masalan: 14-VIP va boshqalar)                                */}
          {/* ------------------------------------------------------------- */}
          {vipStations.length > 0 && (
            <section className="relative rounded-3xl border border-amber-500/40 bg-gradient-to-br from-amber-950/25 via-slate-900/80 to-slate-950 p-4 sm:p-6 shadow-2xl">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-lg border border-amber-500/40">
                    👑
                  </span>
                  <div>
                    <h3 className="font-extrabold text-amber-300 tracking-wide text-sm sm:text-base uppercase flex items-center gap-2">
                      <span>VIP Xonalar — Alohida Qulay Kabinalar</span>
                      <span className="text-[11px] font-normal text-amber-400/80 lowercase">
                        (masalan: 14-VIP va boshqalar)
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Ovoz o'tkazmaydigan alohida xonalar, 65" 4K TV va katta burchak divanlar
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 border border-amber-500/40">
                  {vipStations.length} ta VIP Kabina
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {vipStations.map((station) => (
                  <VipCabinScheme
                    key={station.id}
                    station={station}
                    liveMinutes={station.session ? liveMinutes(station.session, fetchedAt, tick) : 0}
                    booking={nextBookingByStation.get(station.id)}
                    hasShift={!!query.data?.shift}
                    onOpen={() => setOpening(station)}
                    onView={(id) => setViewing(id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ------------------------------------------------------------- */}
          {/* ZONA 2: UMUMIY ZAL (PS-5 / PS-4) — MARKAZIY QATOR STOLLAR     */}
          {/* ------------------------------------------------------------- */}
          {mainHallStations.length > 0 && (
            <section className="relative rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-900/60 p-4 sm:p-6 shadow-2xl">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-lg border border-emerald-500/40">
                    🎮
                  </span>
                  <div>
                    <h3 className="font-extrabold text-emerald-300 tracking-wide text-sm sm:text-base uppercase flex items-center gap-2">
                      <span>Umumiy Zal (PS-5 / PS-4) — Markaziy Zaldagi Qator Stollar</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Asosiy zaldagi tartibli o'yin stollari, pultlar va qulay divanlar
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/40">
                  {mainHallStations.length} ta o'yin stoli
                </span>
              </div>

              <div className="space-y-6">
                {mainHallRows.map((row, rowIdx) => (
                  <div key={rowIdx} className="space-y-2.5">
                    <div className="flex items-center gap-2 px-1">
                      <span className="rounded-md bg-slate-800/90 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30">
                        ━━ {rowIdx + 1}-Qator stollar
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/30 via-slate-800 to-transparent" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {row.map((station) => (
                        <StationDeskScheme
                          key={station.id}
                          station={station}
                          liveMinutes={station.session ? liveMinutes(station.session, fetchedAt, tick) : 0}
                          booking={nextBookingByStation.get(station.id)}
                          hasShift={!!query.data?.shift}
                          onOpen={() => setOpening(station)}
                          onView={(id) => setViewing(id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ------------------------------------------------------------- */}
          {/* ZONA 3: RETRO VA STANDART ZONASI (PS-3)                       */}
          {/* ------------------------------------------------------------- */}
          {retroStations.length > 0 && (
            <section className="relative rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/25 via-slate-900/80 to-slate-950 p-4 sm:p-6 shadow-2xl">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-indigo-500/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-lg border border-indigo-500/40">
                    🕹
                  </span>
                  <div>
                    <h3 className="font-extrabold text-indigo-300 tracking-wide text-sm sm:text-base uppercase">
                      Retro va Standart Zonasi (PS-3)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Klassik PlayStation 3 o'yinlari burchagi
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-300 border border-indigo-500/40">
                  {retroStations.length} ta retro joy
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {retroStations.map((station) => (
                  <StationDeskScheme
                    key={station.id}
                    station={station}
                    liveMinutes={station.session ? liveMinutes(station.session, fetchedAt, tick) : 0}
                    booking={nextBookingByStation.get(station.id)}
                    hasShift={!!query.data?.shift}
                    onOpen={() => setOpening(station)}
                    onView={(id) => setViewing(id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ------------------------------------------------------------- */}
          {/* ZONA 4: QOLGAN HAMMASI — KLUB INFRATUZILMASI                  */}
          {/* (Kassa, Bar, Kirish, Aksessuarlar)                            */}
          {/* ------------------------------------------------------------- */}
          <div className="relative border-t border-slate-800/80 pt-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                🏢 Klub Infratuzilmasi va Xizmatlar
              </span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Kassa & Boshqaruv */}
              <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 to-slate-900/80 p-4 flex items-center gap-3 shadow-lg">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-2xl">
                  💻
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Kassa & Reception
                  </p>
                  <p className="text-xs text-slate-400">
                    Smena: {query.data?.shift ? <span className="text-emerald-400 font-semibold">Ochiq</span> : <span className="text-amber-400 font-semibold">Yopiq</span>}
                  </p>
                  <p className="text-[11px] text-emerald-400/90 font-medium">
                    Bandlik: {occupancyRate}% ({busyCount}/{totalStations})
                  </p>
                </div>
              </div>

              {/* 2. Snack Bar */}
              <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/20 to-slate-900/80 p-4 flex items-center gap-3 shadow-lg">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/40 text-2xl">
                  🍿
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Bufet & Snack Bar
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    Pepsi, Red Bull, Flash, Suv
                  </p>
                  <p className="text-[11px] text-amber-400/90 font-medium">
                    Chiptslar, qarsildoq, kofe
                  </p>
                </div>
              </div>

              {/* 3. Asosiy Kirish */}
              <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-950/20 to-slate-900/80 p-4 flex items-center gap-3 shadow-lg">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 border border-sky-500/40 text-2xl">
                  🚪
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Asosiy Kirish Eshigi
                  </p>
                  <p className="text-xs text-slate-400">
                    Kutish zali & Garderob
                  </p>
                  <p className="text-[11px] text-sky-400/90 font-medium">
                    Wi-Fi: PSKLUB-5G
                  </p>
                </div>
              </div>

              {/* 4. Aksessuarlar va Zaxira Pultlar */}
              <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-950/20 to-slate-900/80 p-4 flex items-center gap-3 shadow-lg">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-500/20 border border-purple-500/40 text-2xl">
                  🎮
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Pultlar & Quvvatlash
                  </p>
                  <p className="text-xs text-slate-400">
                    DualSense Charging Dock
                  </p>
                  <p className="text-[11px] text-purple-400/90 font-medium">
                    Zaxira pultlar va garnitura
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================= */
        /* 2. STANDART KARTOCHKALAR RO'YXATI                         */
        /* ========================================================= */
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {filteredStations.map((station) => {
            const session = station.session;
            const minutes = session ? liveMinutes(session, fetchedAt, tick) : 0;
            const look = LOOK[lookOf(station, minutes)];

            return (
              <article
                key={station.id}
                onClick={session ? () => setViewing(session.id) : undefined}
                className={`tap rounded-xl border p-4 transition ${look.card} ${
                  session ? 'cursor-pointer hover:brightness-125' : ''
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-semibold">{station.number}</span>
                  <span className="text-xs text-slate-400">{station.type}</span>
                </div>

                {nextBookingByStation.get(station.id) && (
                  <div className="mt-1.5 flex items-center gap-1 rounded bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 text-[10px] text-amber-300">
                    <span>📅</span>
                    <span className="font-semibold">{nextBookingByStation.get(station.id)!.time}</span>
                    <span className="truncate text-amber-400/80">({nextBookingByStation.get(station.id)!.customer})</span>
                  </div>
                )}

                {!session ? (
                  <>
                    <p className="mt-3 text-sm text-slate-400">{look.label}</p>
                    {station.note && <p className="mt-1 text-xs text-slate-500">{station.note}</p>}
                    {station.status === 'FREE' && (
                      <button
                        type="button"
                        disabled={!query.data?.shift}
                        title={query.data?.shift ? undefined : 'Avval smenani oching'}
                        onClick={() => setOpening(station)}
                        className="tap mt-3 w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-40"
                      >
                        Boshlash
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-2 font-mono text-2xl tabular-nums">{clock(minutes)}</p>
                    <p className="text-sm text-slate-300">{summa(session.totalAmount)} so'm</p>
                    <dl className="mt-2 space-y-0.5 text-xs text-slate-400">
                      <div className="flex justify-between">
                        <dt>{session.tariffName ?? 'Tarif yo\'q'}</dt>
                        <dd>{session.gamepads} pult</dd>
                      </div>
                      {session.customer && <div>{session.customer}</div>}
                      {session.paused && <div className="text-sky-300">Pauzada</div>}
                      {session.creditExceeded && <div className="text-red-300">Limit oshdi</div>}
                    </dl>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}

      {!query.isLoading && stations.length === 0 && (
        <p className="text-sm text-slate-500">
          Joylar hali qo'shilmagan — Sozlamalar oynasidan kiriting.
        </p>
      )}

      {opening && (
        <SessionOpen
          stationId={opening.id}
          stationNumber={opening.number}
          gamepadCount={opening.gamepadCount ?? 4}
          onClose={() => setOpening(null)}
        />
      )}

      {viewing && <SessionDetail sessionId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/**
 * VIP Xonalar — Alohida qulay kabina ko'rinishidagi maxsus sxema elementi
 */
function VipCabinScheme({
  station,
  liveMinutes,
  booking,
  hasShift,
  onOpen,
  onView,
}: {
  station: MapStation;
  liveMinutes: number;
  booking?: { time: string; customer: string };
  hasShift: boolean;
  onOpen: () => void;
  onView: (id: string) => void;
}) {
  const session = station.session;
  const look = SCHEME_LOOK[lookOf(station, liveMinutes)];

  return (
    <div
      onClick={session ? () => onView(session.id) : undefined}
      className={`group relative flex flex-col rounded-3xl border-2 ${look.border} ${look.glow} bg-gradient-to-b from-amber-950/25 via-slate-900/90 to-slate-950 p-4 transition-all duration-200 ${
        session ? 'cursor-pointer hover:scale-[1.015]' : ''
      }`}
    >
      {/* Kabina devorining tepa ramkasi va xona raqami */}
      <div className="mb-3 flex items-center justify-between border-b border-amber-500/20 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-sm font-black text-amber-300 border border-amber-500/40 shadow-sm">
            👑
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm font-extrabold text-white">
                {station.number}-VIP
              </span>
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300 border border-amber-500/30">
                Kabina
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Alohida qulay xona</p>
          </div>
        </div>

        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border ${look.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${look.dot}`} />
          {look.label}
        </span>
      </div>

      {/* 1. MONITOR (65' 4K OLED KATTA EKRAN) */}
      <div className={`w-full rounded-2xl border p-3.5 transition-all ${look.screenBg} ${session ? 'shadow-inner' : ''}`}>
        <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/80 pb-1.5 mb-2">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            65" 4K Curved TV
          </span>
          <span className="font-mono text-[10px] text-slate-400">{station.type}</span>
        </div>

        {session ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-2xl font-black tabular-nums text-white tracking-tight">
                {clock(liveMinutes)}
              </span>
              <span className="text-sm font-bold text-emerald-400">
                {summa(session.totalAmount)} so'm
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="truncate max-w-[130px] font-medium">
                {session.customer ? `👤 ${session.customer}` : 'Mehmon'}
              </span>
              <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">
                🎮 {session.gamepads} ta pult
              </span>
            </div>

            {session.tariffName && (
              <p className="text-[10px] text-slate-400 truncate">
                Tarif: <span className="text-slate-300">{session.tariffName}</span>
              </p>
            )}
          </div>
        ) : (
          <div className="py-2 text-center">
            <p className="text-xs font-medium text-slate-300">Xona bo'sh va tayyor</p>
            {station.note && (
              <p className="text-[10px] text-slate-400 truncate mt-0.5">{station.note}</p>
            )}
            {station.status === 'FREE' && (
              <button
                type="button"
                disabled={!hasShift}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
                className="tap mt-2.5 w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:from-amber-500 hover:to-amber-400 disabled:opacity-40"
              >
                Xonani band qilish
              </button>
            )}
          </div>
        )}

        {/* Bron ogohlantirishi */}
        {booking && (
          <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-amber-950/80 border border-amber-700/60 px-2.5 py-1 text-[11px] text-amber-300">
            <span>📅</span>
            <span className="font-bold">{booking.time}</span>
            <span className="truncate text-amber-300/90 font-medium">({booking.customer})</span>
          </div>
        )}
      </div>

      {/* Monitor osti va Kofe stoli */}
      <div className="my-1.5 flex flex-col items-center">
        <div className="h-1.5 w-10 bg-slate-700 rounded-b-sm" />
        <div className="h-0.5 w-16 bg-slate-600 rounded-full mb-1" />

        {/* Kofe stoli / Konsol stendi */}
        <div className="w-[94%] h-3.5 rounded-lg bg-gradient-to-r from-amber-950/60 via-slate-800 to-amber-950/60 border border-amber-600/30 flex items-center justify-between px-3 shadow-inner">
          <span className="text-[7px] text-amber-400/80 font-mono tracking-wider">PS5 CONSOLE</span>
          <span className="h-1 w-6 rounded-full bg-amber-500/40" />
          <span className="text-[7px] text-amber-400/80 font-mono tracking-wider">DUALSENSE DOCK</span>
        </div>
      </div>

      {/* 2. KATTA CHARM BURCHAK DIVAN (L-SHAPED SOFA) */}
      <div className={`mt-1 w-full rounded-2xl border p-2 ${look.sofaBg} transition-all duration-200 shadow-sm`}>
        <div className="flex items-center justify-between text-[8px] uppercase tracking-widest text-slate-400 px-1 mb-1 font-mono">
          <span>🛋 Burchak Divan</span>
          <span>Premium Charm</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="h-5 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-[9px] text-white/50">
            ▪
          </div>
          <div className="h-5 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-[9px] text-white/50">
            ▪
          </div>
          <div className="h-5 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-[9px] text-white/50">
            ▪
          </div>
        </div>
      </div>

      {/* Xona afzalliklari (Qulayliklar) */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">❄️ A/C</span>
        <span className="flex items-center gap-1">🔊 Hi-Fi Akustika</span>
        <span className="flex items-center gap-1">🚪 Shaxsiy xona</span>
      </div>
    </div>
  );
}

/**
 * Umumiy Zal va Retro — Markaziy Qator Stollar ko'rinishidagi sxema elementi
 */
function StationDeskScheme({
  station,
  liveMinutes,
  booking,
  hasShift,
  onOpen,
  onView,
}: {
  station: MapStation;
  liveMinutes: number;
  booking?: { time: string; customer: string };
  hasShift: boolean;
  onOpen: () => void;
  onView: (id: string) => void;
}) {
  const session = station.session;
  const look = SCHEME_LOOK[lookOf(station, liveMinutes)];

  return (
    <div
      onClick={session ? () => onView(session.id) : undefined}
      className={`group relative flex flex-col items-center rounded-2xl border ${look.border} ${look.glow} bg-slate-900/70 p-3.5 transition-all duration-200 ${
        session ? 'cursor-pointer hover:scale-[1.02]' : ''
      }`}
    >
      {/* 1. MONITOR (TV EKRANI) */}
      <div
        className={`w-full rounded-xl border p-3 transition-all ${look.screenBg} ${
          session ? 'shadow-inner' : ''
        }`}
      >
        {/* Ekran tepasi: Raqam va Holat */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full ring-2 ring-slate-800" />
            <span className="font-mono text-sm font-bold text-white">
              № {station.number}
            </span>
            <span className="rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
              {station.type}
            </span>
          </div>

          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${look.badge}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${look.dot}`} />
            {look.label}
          </span>
        </div>

        {/* Ekran markazi: O'yin ma'lumotlari */}
        <div className="pt-2">
          {session ? (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xl font-bold tabular-nums text-white">
                  {clock(liveMinutes)}
                </span>
                <span className="text-xs font-semibold text-emerald-400">
                  {summa(session.totalAmount)} so'm
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate max-w-[110px]">
                  {session.customer ? `👤 ${session.customer}` : 'Mehmon'}
                </span>
                <span>🎮 {session.gamepads} ta pult</span>
              </div>

              {session.tariffName && (
                <p className="text-[10px] text-slate-500 truncate">
                  Tarif: {session.tariffName}
                </p>
              )}
            </div>
          ) : (
            <div className="py-1.5 text-center">
              <p className="text-xs text-slate-400">Bo'sh joy</p>
              {station.note && (
                <p className="text-[10px] text-slate-500 truncate">{station.note}</p>
              )}
              {station.status === 'FREE' && (
                <button
                  type="button"
                  disabled={!hasShift}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                  }}
                  className="tap mt-2 w-full rounded-lg bg-emerald-600/90 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                >
                  Boshlash
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bron haqida ogohlantirish */}
        {booking && (
          <div className="mt-2 flex items-center gap-1 rounded bg-amber-950/70 border border-amber-800/50 px-2 py-0.5 text-[10px] text-amber-300">
            <span>📅</span>
            <span className="font-semibold">{booking.time}</span>
            <span className="truncate text-amber-400/90">({booking.customer})</span>
          </div>
        )}
      </div>

      {/* Monitor oyog'i (TV Stand) */}
      <div className="h-2 w-8 bg-slate-700/80 rounded-b-sm" />
      <div className="h-0.5 w-14 bg-slate-600/60 rounded-full mb-1" />

      {/* 2. O'YIN STOLI (GAMING DESK) */}
      <div className="w-[88%] h-3 rounded-lg bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 border border-slate-600/40 shadow-md flex items-center justify-between px-2">
        <span className="h-1 w-2 rounded-full bg-slate-500" />
        <span className="text-[8px] tracking-widest text-slate-400/80 uppercase font-mono">
          STOL
        </span>
        <span className="h-1 w-2 rounded-full bg-slate-500" />
      </div>

      {/* 3. DIVAN / O'RINDIQ (GAMING SOFA) */}
      <div
        className={`mt-2 w-[92%] h-7 rounded-xl border ${look.sofaBg} transition-all duration-200 flex items-center justify-around px-2 shadow-sm`}
      >
        {/* Chap yostiq */}
        <div className="h-4 w-7 rounded-md bg-white/5 border border-white/10" />
        {/* O'rta ajratkich */}
        <div className="h-3 w-px bg-white/10" />
        {/* O'ng yostiq */}
        <div className="h-4 w-7 rounded-md bg-white/5 border border-white/10" />
      </div>
    </div>
  );
}
