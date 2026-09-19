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

  const query = useQuery({
    queryKey: ['map'],
    queryFn: () => api<MapResponse>('/api/map'),
    refetchInterval: 30_000,
  });

  const onRefresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: ['map'] });
  }, [client]);
  const { connected } = useRealtime(onRefresh);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchedAt = query.dataUpdatedAt || Date.now();
  const stations = query.data?.stations ?? [];
  const types = Array.from(new Set(stations.map((s) => s.type)));

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

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Joylar xaritasi</h1>
        <div className="flex items-center gap-4 text-sm">
          {!query.data?.shift && (
            <span className="rounded-lg bg-amber-950/70 px-3 py-1.5 text-amber-300">
              Smena ochilmagan
            </span>
          )}
          <span className={connected ? 'text-slate-500' : 'text-red-400'}>
            {connected ? 'Aloqa bor' : 'Aloqa yo\'q — raqamlar eskirgan bo\'lishi mumkin'}
          </span>
        </div>
      </header>

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
        <p role="alert" className="mb-4 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">
          Diqqat: {alerts.map((s) => `${s.number}-joy`).join(', ')} — vaqt tugadi yoki limit oshdi.
        </p>
      )}

      {query.isError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">
          Ma'lumot olinmadi. Aloqani tekshiring.
        </p>
      )}

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
