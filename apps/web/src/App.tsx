import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { Shell } from './components/Shell.tsx';
import { Audit } from './pages/Audit.tsx';
import { Login } from './pages/Login.tsx';
import { StationMap } from './pages/Map.tsx';
import { Placeholder } from './pages/Placeholder.tsx';
import { QuickSale } from './pages/QuickSale.tsx';
import { Reports } from './pages/Reports.tsx';
import { Settings } from './pages/Settings.tsx';
import { Shift } from './pages/Shift.tsx';
import { Stock } from './pages/Stock.tsx';
import { Suppliers } from './pages/Suppliers.tsx';
import { Tariffs } from './pages/Tariffs.tsx';
import { useAuth } from './store/auth.ts';

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

export function App() {
  const user = useAuth((s) => s.user);
  const checked = useAuth((s) => s.checked);
  const restore = useAuth((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  if (!checked) {
    return <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-slate-400">Yuklanmoqda…</div>;
  }

  if (!user) return <Login />;

  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<StationMap />} />
            <Route path="kassa" element={<QuickSale />} />
            <Route path="smena" element={<Shift />} />
            <Route path="mijozlar" element={<Placeholder title="Mijozlar" phase="5-bosqich" />} />
            <Route path="ombor" element={<Stock />} />
            <Route path="hisobotlar" element={<Reports />} />
            <Route path="tariflar" element={<Tariffs />} />
            <Route path="taminotchilar" element={<Suppliers />} />
            <Route path="audit" element={<Audit />} />
            <Route path="sozlamalar" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
