import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, ApiError } from '../lib/api.ts';

interface StationType {
  id: string;
  name: string;
  sortOrder: number;
}

interface Station {
  id: string;
  number: number;
  name: string | null;
  gamepadCount: number;
  status: 'FREE' | 'BUSY' | 'OUT_OF_SERVICE';
  type: { id: string; name: string };
}

export function Settings() {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const types = useQuery({ queryKey: ['station-types'], queryFn: () => api<StationType[]>('/api/station-types') });
  const stations = useQuery({ queryKey: ['stations'], queryFn: () => api<Station[]>('/api/stations') });

  const [typeName, setTypeName] = useState('');
  const [stationNumber, setStationNumber] = useState('');
  const [stationTypeId, setStationTypeId] = useState('');
  const [gamepads, setGamepads] = useState('2');

  const addType = useMutation({
    mutationFn: (name: string) =>
      api<StationType>('/api/station-types', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => {
      setTypeName('');
      setError(null);
      void client.invalidateQueries({ queryKey: ['station-types'] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Xatolik.'),
  });

  const addStation = useMutation({
    mutationFn: (body: { typeId: string; number: number; gamepadCount: number }) =>
      api<Station>('/api/stations', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setStationNumber('');
      setError(null);
      void client.invalidateQueries({ queryKey: ['stations'] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Xatolik.'),
  });

  const removeStation = useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/stations/${id}`, { method: 'DELETE' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['stations'] }),
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Xatolik.'),
  });

  return (
    <div className="max-w-4xl space-y-10">
      <h1 className="text-xl font-semibold">Sozlamalar</h1>

      {error && (
        <p role="alert" className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-slate-300">Joy turlari</h2>
        <ul className="mb-3 flex flex-wrap gap-2">
          {types.data?.map((type) => (
            <li key={type.id} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
              {type.name}
            </li>
          ))}
          {types.data?.length === 0 && <li className="text-sm text-slate-500">Hali qo'shilmagan.</li>}
        </ul>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typeName.trim()) addType.mutate(typeName.trim());
          }}
        >
          <input
            value={typeName}
            onChange={(e) => setTypeName(e.target.value)}
            placeholder="Masalan: PS-5"
            className="tap rounded-lg bg-slate-900 px-3 py-2 text-sm outline-none ring-1 ring-slate-700 focus:ring-emerald-600"
          />
          <button type="submit" className="tap rounded-lg bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-500">
            Qo'shish
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-slate-300">Joylar</h2>
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2">Raqam</th>
                <th className="py-2">Turi</th>
                <th className="py-2">Pult</th>
                <th className="py-2">Holati</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stations.data?.map((station) => (
                <tr key={station.id} className="border-t border-slate-800">
                  <td className="py-2">{station.number}</td>
                  <td className="py-2">{station.type.name}</td>
                  <td className="py-2">{station.gamepadCount}</td>
                  <td className="py-2 text-slate-400">{station.status}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeStation.mutate(station.id)}
                      className="text-sm text-red-400 hover:text-red-300"
                    >
                      O'chirish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {stations.data?.length === 0 && <p className="text-sm text-slate-500">Hali qo'shilmagan.</p>}
        </div>

        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const number = Number(stationNumber);
            if (!stationTypeId || !Number.isInteger(number) || number < 1) return;
            addStation.mutate({ typeId: stationTypeId, number, gamepadCount: Number(gamepads) || 2 });
          }}
        >
          <input
            value={stationNumber}
            onChange={(e) => setStationNumber(e.target.value)}
            inputMode="numeric"
            placeholder="Joy raqami"
            className="tap w-32 rounded-lg bg-slate-900 px-3 py-2 text-sm outline-none ring-1 ring-slate-700 focus:ring-emerald-600"
          />
          <select
            value={stationTypeId}
            onChange={(e) => setStationTypeId(e.target.value)}
            className="tap rounded-lg bg-slate-900 px-3 py-2 text-sm outline-none ring-1 ring-slate-700 focus:ring-emerald-600"
          >
            <option value="">Turi…</option>
            {types.data?.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          <input
            value={gamepads}
            onChange={(e) => setGamepads(e.target.value)}
            inputMode="numeric"
            className="tap w-24 rounded-lg bg-slate-900 px-3 py-2 text-sm outline-none ring-1 ring-slate-700 focus:ring-emerald-600"
          />
          <button type="submit" className="tap rounded-lg bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-500">
            Joy qo'shish
          </button>
        </form>
      </section>

      <p className="text-sm text-slate-400">
        Tariflar alohida bo'limda — chap menyudagi "Tariflar".
      </p>
    </div>
  );
}
