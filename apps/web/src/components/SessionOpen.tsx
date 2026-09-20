import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '../lib/api.ts';
import { Field, Modal, inputClass } from './Modal.tsx';
import { isManager, useAuth } from '../store/auth.ts';

interface Tariff {
  id: string;
  name: string;
  kind: 'HOURLY' | 'PACKAGE';
  packagePrice: number | null;
}

interface Customer {
  id: string;
  fullName: string;
  phone: string | null;
  balance: number;
  isBlocked: boolean;
}

interface Props {
  stationId: string;
  stationNumber: number;
  gamepadCount: number;
  onClose: () => void;
}

export function SessionOpen({ stationId, stationNumber, gamepadCount, onClose }: Props) {
  const client = useQueryClient();
  const user = useAuth((s) => s.user);
  const isMgr = isManager(user);
  const [mode, setMode] = useState<'PREPAID' | 'POSTPAID'>('POSTPAID');
  const [gamepads, setGamepads] = useState(2);
  const [minutes, setMinutes] = useState('60');
  const [packageId, setPackageId] = useState('');
  const [startedAtStr, setStartedAtStr] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Mijoz ma'lumotlari: birinchi telefon, keyin ism
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Qidiruv so'rovi: telefon raqami yoki ism bo'yicha
  const searchQ = customerPhone.trim() || customerName.trim();
  const customers = useQuery({
    queryKey: ['customers', searchQ],
    queryFn: () => api<Customer[]>(`/api/customers?q=${encodeURIComponent(searchQ)}`),
    enabled: searchQ.length >= 2,
  });

  // Telefon raqami bo'yicha bazadagi mijozni aniqlash
  const phoneDigits = customerPhone.replace(/\D/g, '');
  const existingCustomerByPhone = (customers.data ?? []).find((c) => {
    if (!c.phone) return false;
    const cDigits = c.phone.replace(/\D/g, '');
    return phoneDigits.length >= 7 && cDigits.length >= 7 && cDigits.slice(-9) === phoneDigits.slice(-9);
  });

  // Raqam kiritilganda bazadagi mijoz bilan mos kelsa, ismini avtomatik o'rnatamiz va qulflaymiz
  useEffect(() => {
    if (existingCustomerByPhone) {
      if (selectedCustomer?.id !== existingCustomerByPhone.id) {
        setSelectedCustomer(existingCustomerByPhone);
        setCustomerName(existingCustomerByPhone.fullName);
        setShowSuggestions(false);
      }
    } else if (selectedCustomer && phoneDigits.length >= 7) {
      const selDigits = (selectedCustomer.phone ?? '').replace(/\D/g, '');
      if (selDigits.slice(-9) !== phoneDigits.slice(-9)) {
        setSelectedCustomer(null);
      }
    }
  }, [existingCustomerByPhone, phoneDigits, selectedCustomer]);

  const matchingCustomers =
    !selectedCustomer && showSuggestions && searchQ.length >= 2 ? (customers.data ?? []).slice(0, 6) : [];

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerPhone(c.phone ?? '');
    setCustomerName(c.fullName);
    setShowSuggestions(false);
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerPhone('');
    setCustomerName('');
    setShowSuggestions(false);
  };

  const handlePhoneChange = (val: string) => {
    setCustomerPhone(val);
    setShowSuggestions(true);
  };

  const handleNameChange = (val: string) => {
    if (selectedCustomer) return;
    setCustomerName(val);
  };

  const customerDetail = useQuery({
    queryKey: ['customer-open-detail', selectedCustomer?.id],
    queryFn: () =>
      api<{ packages: { id: string; name: string; remainingMinutes: number; expiresAt: string | null }[] }>(
        `/api/customers/${selectedCustomer!.id}`,
      ),
    enabled: !!selectedCustomer?.id,
  });

  const tariffs = useQuery({ queryKey: ['tariffs'], queryFn: () => api<Tariff[]>('/api/tariffs') });
  const packages = (tariffs.data ?? []).filter((t) => t.kind === 'PACKAGE');

  const open = useMutation({
    mutationFn: () => {
      const digits = customerPhone.replace(/\D/g, '');
      if (customerPhone.trim() && digits.length > 0 && digits.length < 7) {
        throw new Error("Telefon raqami kamida 7 ta raqamdan iborat bo'lishi kerak.");
      }

      return api('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          stationId,
          paymentMode: mode,
          gamepads,
          tariffId: packageId || null,
          customerId: selectedCustomer?.id || null,
          customerName: customerName.trim() || null,
          customerPhone: customerPhone.trim() || null,
          prepaidMinutes: mode === 'PREPAID' ? Number(minutes) || null : null,
          note: note.trim() || null,
          startedAt: startedAtStr ? new Date(startedAtStr).toISOString() : undefined,
        }),
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['map'] });
      void client.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) setError(err.message);
      else if (err instanceof Error) setError(err.message);
      else setError('Kutilmagan xatolik.');
    },
  });

  return (
    <Modal title={`${stationNumber}-joyda seans ochish`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-xs text-slate-400">To'lov rejimi</span>
          <div className="grid grid-cols-2 gap-2">
            {(['POSTPAID', 'PREPAID'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`tap rounded-lg py-2.5 text-sm transition ${
                  mode === value ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {value === 'POSTPAID' ? 'Ishdan keyin' : 'Oldindan'}
              </button>
            ))}
          </div>
        </div>

        {mode === 'PREPAID' && (
          <Field label="Necha daqiqaga">
            <input
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
        )}

        <div>
          <span className="mb-1 block text-xs text-slate-400">Pult soni</span>
          <div className="flex gap-2">
            {Array.from({ length: Math.max(1, gamepadCount) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setGamepads(n)}
                className={`tap flex-1 rounded-lg py-2.5 text-sm transition ${
                  gamepads === n ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {packages.length > 0 && (
          <Field label="Paket tarif (ixtiyoriy)">
            <select value={packageId} onChange={(e) => setPackageId(e.target.value)} className={inputClass}>
              <option value="">Paketsiz — soatlik tarif</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {(p.packagePrice ?? 0).toLocaleString('uz-UZ')} so'm
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              Mijoz ma'lumotlari{' '}
              {mode === 'POSTPAID' && (
                <span className="font-normal text-amber-400">— qarz yozish uchun kerak</span>
              )}
            </span>
            {(customerPhone || customerName || selectedCustomer) && (
              <button
                type="button"
                onClick={handleClearCustomer}
                className="text-xs text-rose-400 transition hover:text-rose-300"
              >
                Tozalash
              </button>
            )}
          </div>

          {/* 1-QATOR: Telefon raqami */}
          <Field label="1. Telefon raqami (ixtiyoriy)">
            <div className="relative">
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="+998 90 123 45 67"
                className={`${inputClass} ${
                  selectedCustomer ? 'border border-emerald-500/50 focus:ring-emerald-500' : ''
                }`}
              />
              {selectedCustomer && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-emerald-950/80 px-2 py-0.5 text-[11px] font-medium text-emerald-300 border border-emerald-700/50">
                  ✓ Mavjud mijoz
                </span>
              )}
            </div>
          </Field>

          {/* Qidiruv takliflari */}
          {matchingCustomers.length > 0 && !selectedCustomer && (
            <div className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 shadow-xl">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Mavjud mijozlar (tanlash uchun bosing):
              </div>
              <ul className="max-h-36 space-y-1 overflow-y-auto">
                {matchingCustomers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={c.isBlocked}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectCustomer(c);
                      }}
                      className="tap flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-slate-800 disabled:opacity-40"
                    >
                      <div>
                        <span className="font-medium text-slate-200">{c.fullName}</span>
                        {c.phone && <span className="ml-2 font-mono text-xs text-emerald-400">{c.phone}</span>}
                        {c.isBlocked && <span className="ml-2 text-xs text-red-400">qora ro'yxat</span>}
                      </div>
                      <span
                        className={`text-xs ${
                          c.balance < 0 ? 'font-medium text-amber-400' : 'text-slate-400'
                        }`}
                      >
                        balans: {c.balance.toLocaleString('uz-UZ')} so'm
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 2-QATOR: Mijoz ismi */}
          <Field label="2. Mijoz ismi (ixtiyoriy)">
            <input
              type="text"
              value={selectedCustomer ? selectedCustomer.fullName : customerName}
              onChange={(e) => handleNameChange(e.target.value)}
              disabled={!!selectedCustomer}
              placeholder={selectedCustomer ? selectedCustomer.fullName : 'Masalan: Sardor'}
              className={`${inputClass} ${
                selectedCustomer
                  ? 'cursor-not-allowed bg-slate-900/90 text-emerald-300 font-semibold border border-emerald-600/40'
                  : ''
              }`}
            />
          </Field>

          {/* Holat bildirishnomasi */}
          {selectedCustomer ? (
            <div className="space-y-1.5 rounded-lg border border-emerald-600/40 bg-emerald-950/30 p-2.5 text-xs text-emerald-300">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">
                  🔒 {selectedCustomer.fullName}
                  {selectedCustomer.isBlocked && (
                    <span className="ml-2 rounded bg-red-900/60 px-1.5 py-0.5 text-[10px] text-red-300">
                      qora ro'yxat
                    </span>
                  )}
                </span>
                <span
                  className={`font-mono text-xs ${
                    selectedCustomer.balance < 0 ? 'text-amber-400 font-semibold' : 'text-emerald-400'
                  }`}
                >
                  balans: {selectedCustomer.balance.toLocaleString('uz-UZ')} so'm
                </span>
              </div>
              <p className="text-[11px] text-emerald-400/80">
                Ushbu telefon raqamiga biriktirilgan mijoz topildi. Bitta raqamga bitta nom qoidasi bo'yicha ismni o'zgartirib bo'lmaydi.
              </p>

              {customerDetail.data?.packages && customerDetail.data.packages.length > 0 && (
                <div className="mt-1.5 border-t border-emerald-800/40 pt-1.5">
                  <p className="font-semibold">Faol abonement paketlari:</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {customerDetail.data.packages.map((p) => (
                      <li key={p.id}>
                        • {p.name}: {Math.floor(p.remainingMinutes / 60)} soat {p.remainingMinutes % 60} daq qoldi
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : customerPhone.trim() ? (
            <p className="text-[11px] text-sky-400">
              ℹ Yangi telefon raqami. Ushbu raqamga yuqorida kiritilgan ism biriktiriladi.
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">
              Bo'sh qoldirilsa seans "Mehmon" nomiga ochiladi.
            </p>
          )}
        </div>

        {mode === 'POSTPAID' && !selectedCustomer && !customerName.trim() && !customerPhone.trim() && (
          <p className="rounded-lg bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
            Mijoz kiritilmasa seans mehmon nomiga ochiladi va qarz bilan yopib bo'lmaydi —
            yopishda to'liq to'lov olinadi.
          </p>
        )}

        {isMgr && (
          <Field label="O'tgan vaqt bilan kiritish (ixtiyoriy — masalan, aloqa uzilgandagi seans)">
            <input
              type="datetime-local"
              value={startedAtStr}
              onChange={(e) => setStartedAtStr(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        <Field label="Izoh (ixtiyoriy)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>

        {error && (
          <p role="alert" className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={open.isPending}
          onClick={() => open.mutate()}
          className="tap w-full rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {open.isPending ? 'Ochilmoqda…' : 'Seansni boshlash'}
        </button>
      </div>
    </Modal>
  );
}
