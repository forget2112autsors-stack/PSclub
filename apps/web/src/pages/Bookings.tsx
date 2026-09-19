import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { api, ApiError } from '../lib/api.ts';
import { Field, Modal, inputClass } from '../components/Modal.tsx';
import { isManager, useAuth } from '../store/auth.ts';

export interface Booking {
  id: string;
  stationId: string;
  customerId: string | null;
  startsAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'FULFILLED' | 'NO_SHOW';
  note: string | null;
  station: { id: string; number: number; name?: string | null; type: { name: string } };
  customer: { id: string; fullName: string; phone: string | null } | null;
}

interface Station {
  id: string;
  number: number;
  type: string;
  status: string;
}

interface CustomerOption {
  id: string;
  fullName: string;
  phone: string | null;
}

const STATUS_LABELS: Record<Booking['status'], { text: string; badge: string }> = {
  PENDING: { text: 'Kutilmoqda', badge: 'bg-amber-950/60 text-amber-300 border border-amber-800/60' },
  CONFIRMED: { text: 'Tasdiqlangan', badge: 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60' },
  FULFILLED: { text: 'Bajarilgan', badge: 'bg-sky-950/60 text-sky-300 border border-sky-800/60' },
  CANCELLED: { text: 'Bekor qilingan', badge: 'bg-red-950/60 text-red-300 border border-red-800/60' },
  NO_SHOW: { text: 'Kelmadi', badge: 'bg-slate-800 text-slate-400 border border-slate-700' },
};

export function Bookings() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const manager = isManager(useAuth((s) => s.user));

  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL' | 'FULFILLED' | 'CANCELLED'>('ACTIVE');
  const [datePreset, setDatePreset] = useState<'today' | 'tomorrow' | 'all' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [activating, setActivating] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [stationId, setStationId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('18:00');
  const [note, setNote] = useState('');

  // Activate session form states
  const [paymentMode, setPaymentMode] = useState<'PREPAID' | 'POSTPAID'>('POSTPAID');
  const [gamepads, setGamepads] = useState(2);

  const getQueryDate = () => {
    if (datePreset === 'all') return undefined;
    if (datePreset === 'today') return new Date().toISOString().slice(0, 10);
    if (datePreset === 'tomorrow') {
      const tom = new Date();
      tom.setDate(tom.getDate() + 1);
      return tom.toISOString().slice(0, 10);
    }
    return customDate;
  };

  const queryDate = getQueryDate();

  const bookingsQuery = useQuery({
    queryKey: ['bookings', statusFilter, queryDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      else params.set('status', 'ALL');
      if (queryDate) params.set('date', queryDate);
      return api<Booking[]>(`/api/bookings?${params.toString()}`);
    },
    refetchInterval: 15_000,
  });

  const stationsQuery = useQuery({
    queryKey: ['map'],
    queryFn: () => api<{ stations: Station[] }>('/api/map'),
  });

  const customersQuery = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => api<CustomerOption[]>('/api/customers'),
  });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['bookings'] });
    void client.invalidateQueries({ queryKey: ['map'] });
  };

  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : 'Kutilmagan xatolik.');

  const createBookingMutation = useMutation({
    mutationFn: () => {
      const dt = new Date(`${startDate}T${startTime}:00`);
      return api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          stationId,
          customerId: customerId || null,
          startsAt: dt.toISOString(),
          note: note.trim() || null,
        }),
      });
    },
    onSuccess: () => {
      setCreating(false);
      resetForm();
      refresh();
    },
    onError,
  });

  const updateBookingMutation = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('Tahrirlanayotgan bron yo\'q');
      const dt = new Date(`${startDate}T${startTime}:00`);
      return api(`/api/bookings/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          stationId,
          customerId: customerId || null,
          startsAt: dt.toISOString(),
          note: note.trim() || null,
        }),
      });
    },
    onSuccess: () => {
      setEditing(null);
      resetForm();
      refresh();
    },
    onError,
  });

  const activateMutation = useMutation({
    mutationFn: () => {
      if (!activating) throw new Error('Faollashtirilayotgan bron yo\'q');
      return api<{ id: string }>(`/api/bookings/${activating.id}/activate`, {
        method: 'POST',
        body: JSON.stringify({
          paymentMode,
          gamepads,
        }),
      });
    },
    onSuccess: () => {
      setActivating(null);
      refresh();
      navigate('/');
    },
    onError,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api(`/api/bookings/${id}`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
    onError,
  });

  const deletePermanentMutation = useMutation({
    mutationFn: (id: string) => api(`/api/bookings/${id}?permanent=true`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
    onError,
  });

  const resetForm = () => {
    setStationId('');
    setCustomerId('');
    setStartDate(new Date().toISOString().slice(0, 10));
    setStartTime('18:00');
    setNote('');
    setError(null);
  };

  const openCreate = () => {
    resetForm();
    if (stationsQuery.data?.stations && stationsQuery.data.stations.length > 0) {
      setStationId(stationsQuery.data.stations[0].id);
    }
    setCreating(true);
  };

  const openEdit = (b: Booking) => {
    setEditing(b);
    setStationId(b.stationId);
    setCustomerId(b.customerId || '');
    const dt = new Date(b.startsAt);
    setStartDate(dt.toISOString().slice(0, 10));
    setStartTime(`${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`);
    setNote(b.note || '');
    setError(null);
  };

  const openActivate = (b: Booking) => {
    setActivating(b);
    setPaymentMode('POSTPAID');
    setGamepads(2);
    setError(null);
  };

  const list = (bookingsQuery.data ?? []).filter((b) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const stNum = String(b.station.number);
    const custName = b.customer?.fullName.toLowerCase() || '';
    const custPhone = b.customer?.phone || '';
    const bNote = b.note?.toLowerCase() || '';
    return stNum.includes(term) || custName.includes(term) || custPhone.includes(term) || bNote.includes(term);
  });

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white md:text-2xl">
              Bronlar va Buyurtmalar
            </h1>
            <p className="text-xs text-slate-400">
              O'yin joylarini oldindan band qilish va boshqarish
            </p>
          </div>

          <button
            type="button"
            onClick={openCreate}
            className="tap flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Yangi bron qilish
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Status Tabs */}
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setStatusFilter('ACTIVE')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === 'ACTIVE'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Faol bronlar
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === 'ALL'
                    ? 'bg-slate-800 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Barchasi
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('FULFILLED')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === 'FULFILLED'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Bajarilgan
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('CANCELLED')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === 'CANCELLED'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Bekor qilingan
              </button>
            </div>

            {/* Date Presets */}
            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setDatePreset('today')}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  datePreset === 'today'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Bugun
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('tomorrow')}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  datePreset === 'tomorrow'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Ertaga
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('all')}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  datePreset === 'all'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Barcha sanalar
              </button>
              {datePreset === 'custom' ? (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setDatePreset('custom')}
                  className="rounded-lg bg-slate-950 px-2.5 py-1.5 font-medium text-slate-400 transition hover:text-white"
                >
                  📅 Boshqa sana
                </button>
              )}
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Qidiruv: mijoz ismi, telefon raqami, joy raqami yoki izoh..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-slate-600"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center justify-between rounded-xl border border-red-800/80 bg-red-950/60 px-4 py-3 text-xs text-red-200">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {/* Bookings List */}
        {bookingsQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 text-sm text-slate-400">
            Yuklanmoqda…
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
            <div className="mb-3 rounded-full bg-slate-800/80 p-3 text-slate-400">
              📅
            </div>
            <p className="text-sm font-semibold text-slate-300">Bronlar topilmadi</p>
            <p className="mt-1 text-xs text-slate-500">
              Tanlangan filtrlar bo'yicha hech qanday bron mavjud emas.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="tap mt-4 rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-emerald-400 transition hover:bg-slate-700"
            >
              + Yangi bron qo'shish
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((b) => {
              const dt = new Date(b.startsAt);
              const now = new Date();
              const diffMinutes = Math.round((dt.getTime() - now.getTime()) / 60000);
              const isToday = dt.toDateString() === now.toDateString();
              const isPast = diffMinutes < -15;

              let relativeTime = '';
              if (b.status === 'PENDING' || b.status === 'CONFIRMED') {
                if (diffMinutes > 0 && diffMinutes <= 60) {
                  relativeTime = `(${diffMinutes} daqiqadan so'ng)`;
                } else if (diffMinutes <= 0 && diffMinutes >= -15) {
                  relativeTime = '(Vaqti keldi)';
                } else if (diffMinutes < -15) {
                  relativeTime = '(Kechikdi)';
                }
              }

              return (
                <div
                  key={b.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg transition hover:border-slate-700"
                >
                  <div className="space-y-3">
                    {/* Top row: Station and Status Badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-sm font-bold text-white shadow-inner">
                          {b.station.number}
                        </span>
                        <div>
                          <div className="text-sm font-bold text-white">
                            {b.station.number}-joy
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {b.station.name ?? b.station.type.name}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          STATUS_LABELS[b.status]?.badge ?? 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {STATUS_LABELS[b.status]?.text ?? b.status}
                      </span>
                    </div>

                    {/* Customer Info */}
                    <div className="rounded-xl bg-slate-950/50 p-2.5 border border-slate-800/60 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Mijoz:</span>
                        <span className="font-semibold text-slate-200">
                          {b.customer ? b.customer.fullName : 'Mehmon'}
                        </span>
                      </div>
                      {b.customer?.phone && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Telefon:</span>
                          <a
                            href={`tel:${b.customer.phone}`}
                            className="font-mono text-emerald-400 hover:underline"
                          >
                            {b.customer.phone}
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Time info */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Vaqt:</span>
                      <div className="text-right">
                        <span className="font-medium text-white">
                          {isToday ? 'Bugun' : dt.toLocaleDateString('uz-UZ')},{' '}
                          {dt.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {relativeTime && (
                          <span className={`ml-1 text-[11px] font-semibold ${isPast ? 'text-red-400' : 'text-amber-400'}`}>
                            {relativeTime}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Note if any */}
                    {b.note && (
                      <div className="rounded-lg bg-slate-800/40 px-2.5 py-1.5 text-[11px] italic text-slate-300">
                        "{b.note}"
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-1.5 justify-end">
                    {(b.status === 'PENDING' || b.status === 'CONFIRMED') ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openActivate(b)}
                          className="tap flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow transition hover:bg-emerald-500"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Seansni boshlash
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(b)}
                          title="Tahrirlash"
                          className="tap rounded-lg bg-slate-800 p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white"
                        >
                          ✏
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Haqiqatan ham bu bronni bekor qilmoqchimisiz?')) {
                              cancelMutation.mutate(b.id);
                            }
                          }}
                          title="Bekor qilish"
                          className="tap rounded-lg bg-red-950/50 p-2 text-red-300 transition hover:bg-red-900/70"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      manager && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Bu bron butunlay o\'chirilsinmi?')) {
                              deletePermanentMutation.mutate(b.id);
                            }
                          }}
                          className="tap text-xs text-red-400 transition hover:text-red-300"
                        >
                          Butunlay o'chirish
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: New Booking */}
      {creating && (
        <Modal title="Yangi bron qilish" onClose={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createBookingMutation.mutate();
            }}
            className="space-y-4"
          >
            <Field label="Joyni tanlang *">
              <select
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                required
                className={inputClass}
              >
                {(stationsQuery.data?.stations ?? []).map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900">
                    {s.number}-joy ({s.type}) {s.status === 'OUT_OF_SERVICE' ? '(Xizmatda emas)' : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Mijoz (ixtiyoriy)">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className={inputClass}
              >
                <option value="" className="bg-slate-900">
                  Tanlanmagan (Mehmon)
                </option>
                {(customersQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id} className="bg-slate-900">
                    {c.fullName} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Sana *">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Boshlanish vaqti *">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Izoh (ixtiyoriy)">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Masalan: 4 kishi, PS5 turniri..."
                className={inputClass}
              />
            </Field>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="tap rounded-lg bg-slate-800 px-4 py-2.5 text-sm transition hover:bg-slate-700"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={!stationId || createBookingMutation.isPending}
                className="tap flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {createBookingMutation.isPending ? 'Saqlanmoqda…' : 'Bron qilish'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Booking */}
      {editing && (
        <Modal title={`${editing.station.number}-joy bronini tahrirlash`} onClose={() => setEditing(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateBookingMutation.mutate();
            }}
            className="space-y-4"
          >
            <Field label="Joyni tanlang *">
              <select
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                required
                className={inputClass}
              >
                {(stationsQuery.data?.stations ?? []).map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900">
                    {s.number}-joy ({s.type})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Mijoz">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className={inputClass}
              >
                <option value="" className="bg-slate-900">
                  Tanlanmagan (Mehmon)
                </option>
                {(customersQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id} className="bg-slate-900">
                    {c.fullName} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Sana *">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Boshlanish vaqti *">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Izoh">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={inputClass}
              />
            </Field>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="tap rounded-lg bg-slate-800 px-4 py-2.5 text-sm transition hover:bg-slate-700"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={updateBookingMutation.isPending}
                className="tap flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {updateBookingMutation.isPending ? 'Saqlanmoqda…' : 'O\'zgarishlarni saqlash'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Activate Session */}
      {activating && (
        <Modal
          title={`${activating.station.number}-joy: Seansni boshlash`}
          onClose={() => setActivating(null)}
        >
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-950/60 p-3.5 border border-slate-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Joy:</span>
                <span className="font-bold text-white">
                  {activating.station.number}-joy ({activating.station.type.name})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Mijoz:</span>
                <span className="font-semibold text-slate-200">
                  {activating.customer ? activating.customer.fullName : 'Mehmon'}
                </span>
              </div>
              {activating.note && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Izoh:</span>
                  <span className="italic text-slate-300">{activating.note}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="To'lov tartibi">
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as 'PREPAID' | 'POSTPAID')}
                  className={inputClass}
                >
                  <option value="POSTPAID" className="bg-slate-900">
                    Keyin to'lov (Postpaid)
                  </option>
                  <option value="PREPAID" className="bg-slate-900">
                    Oldindan to'lov (Prepaid)
                  </option>
                </select>
              </Field>

              <Field label="Pultlar soni">
                <select
                  value={gamepads}
                  onChange={(e) => setGamepads(Number(e.target.value))}
                  className={inputClass}
                >
                  {[1, 2, 3, 4, 6, 8].map((n) => (
                    <option key={n} value={n} className="bg-slate-900">
                      {n} ta pult
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActivating(null)}
                className="tap rounded-lg bg-slate-800 px-4 py-2.5 text-sm transition hover:bg-slate-700"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={activateMutation.isPending}
                onClick={() => activateMutation.mutate()}
                className="tap flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {activateMutation.isPending ? 'Boshlanmoqda…' : 'Seansni ochish'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}
