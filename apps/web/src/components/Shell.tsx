import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { isManager, useAuth } from '../store/auth.ts';

interface NavItem {
  to: string;
  label: string;
  managerOnly?: boolean;
}

// TZ 8-bo'lim. Seans oynasi alohida sahifa emas — xaritadan ochiladi.
const NAV: NavItem[] = [
  { to: '/', label: 'Joylar xaritasi' },
  { to: '/kassa', label: 'Tez kassa' },
  { to: '/smena', label: 'Smena' },
  { to: '/mijozlar', label: 'Mijozlar' },
  { to: '/ombor', label: 'Ombor' },
  { to: '/hisobotlar', label: 'Hisobotlar' },
  { to: '/audit', label: 'Audit jurnali', managerOnly: true },
  { to: '/sozlamalar', label: 'Sozlamalar', managerOnly: true },
];

export function Shell() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  const items = NAV.filter((item) => !item.managerOnly || isManager(user));

  // Klaviatura yorliqlari — TZ 8-bo'lim (tez ishlash uchun).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!event.altKey) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < items.length) {
        event.preventDefault();
        navigate(items[index].to);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, navigate]);

  return (
    <div className="flex min-h-dvh bg-slate-950 text-slate-100">
      <nav className="flex w-56 shrink-0 flex-col border-r border-slate-800 p-3">
        <div className="px-2 py-3">
          <p className="text-sm font-semibold">PS Klub</p>
          <p className="text-xs text-slate-400">{user?.name}</p>
        </div>

        <div className="mt-2 flex-1 space-y-1">
          {items.map((item, index) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `tap flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-900'
                }`
              }
            >
              <span>{item.label}</span>
              <kbd className="text-[10px] text-slate-500">Alt+{index + 1}</kbd>
            </NavLink>
          ))}
        </div>

        <button
          type="button"
          onClick={logout}
          className="tap rounded-lg px-3 py-2.5 text-left text-sm text-slate-400 transition hover:bg-slate-900 hover:text-slate-200"
        >
          Chiqish
        </button>
      </nav>

      <main className="flex-1 overflow-x-hidden p-6">
        <Outlet />
      </main>
    </div>
  );
}
