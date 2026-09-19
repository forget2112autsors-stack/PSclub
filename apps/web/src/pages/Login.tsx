import { useEffect, useState } from 'react';

import { api, ApiError } from '../lib/api.ts';
import { useAuth, type Role } from '../store/auth.ts';

interface StaffMember {
  id: string;
  fullName: string;
  role: Role;
}

const ROLE_LABEL: Record<Role, string> = {
  OPERATOR: 'Operator',
  ADMIN: 'Administrator',
  OWNER: 'Egasi',
};

const PIN_LENGTH_MAX = 8;

export function Login() {
  const login = useAuth((s) => s.login);
  const [club, setClub] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ club: string | null; users: StaffMember[] }>('/api/auth/users')
      .then((data) => {
        setClub(data.club);
        setStaff(data.users);
        if (data.users.length === 1) setSelected(data.users[0]);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Server javob bermadi.'));
  }, []);

  async function submit(value: string) {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(selected.id, value);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kutilmagan xatolik.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (pin.length >= PIN_LENGTH_MAX) return;
    const next = pin + digit;
    setPin(next);
    setError(null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!selected) return;
      if (event.key >= '0' && event.key <= '9') press(event.key);
      else if (event.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (event.key === 'Enter' && pin.length >= 4) void submit(pin);
      else if (event.key === 'Escape') setSelected(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, pin, busy]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-950 p-4 text-slate-100">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-semibold">{club ?? 'PS Klub'}</h1>
        <p className="mb-8 text-center text-sm text-slate-400">
          {selected ? `${selected.fullName} — PIN-kodni kiriting` : 'Kim kirmoqda?'}
        </p>

        {!selected ? (
          <div className="space-y-2">
            {staff.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => setSelected(person)}
                className="tap flex w-full items-center justify-between rounded-xl bg-slate-800 px-5 py-4 text-left transition hover:bg-slate-700"
              >
                <span className="font-medium">{person.fullName}</span>
                <span className="text-sm text-slate-400">{ROLE_LABEL[person.role]}</span>
              </button>
            ))}
            {staff.length === 0 && !error && (
              <p className="text-center text-sm text-slate-500">Yuklanmoqda…</p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-6 flex justify-center gap-3" aria-label="Kiritilgan raqamlar soni">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <span
                  key={i}
                  className={`h-3 w-3 rounded-full ${i < pin.length ? 'bg-emerald-400' : 'bg-slate-700'}`}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => press(digit)}
                  className="tap rounded-xl bg-slate-800 py-5 text-xl font-medium transition hover:bg-slate-700"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin((p) => p.slice(0, -1))}
                className="tap rounded-xl bg-slate-800/60 py-5 text-sm transition hover:bg-slate-700"
              >
                O'chirish
              </button>
              <button
                type="button"
                onClick={() => press('0')}
                className="tap rounded-xl bg-slate-800 py-5 text-xl font-medium transition hover:bg-slate-700"
              >
                0
              </button>
              <button
                type="button"
                disabled={pin.length < 4 || busy}
                onClick={() => void submit(pin)}
                className="tap rounded-xl bg-emerald-600 py-5 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-40"
              >
                Kirish
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setPin('');
                setError(null);
              }}
              className="tap mt-4 w-full text-sm text-slate-400 transition hover:text-slate-200"
            >
              Boshqa foydalanuvchi
            </button>
          </>
        )}

        {error && (
          <p role="alert" className="mt-6 rounded-lg bg-red-950/60 px-4 py-3 text-center text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
