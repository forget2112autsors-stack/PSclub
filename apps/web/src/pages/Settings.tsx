import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, ApiError } from '../lib/api.ts';
import { Field, Modal, inputClass } from '../components/Modal.tsx';

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
  note: string | null;
  type: { id: string; name: string };
}

const STATUS_LABEL: Record<Station['status'], string> = {
  FREE: 'Bo\'sh',
  BUSY: 'Band',
  OUT_OF_SERVICE: 'Xizmatda emas',
};

export function Settings() {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<StationType | null>(null);
  const [editingStation, setEditingStation] = useState<Station | null>(null);

  const types = useQuery({ queryKey: ['station-types'], queryFn: () => api<StationType[]>('/api/station-types') });
  const stations = useQuery({ queryKey: ['stations'], queryFn: () => api<Station[]>('/api/stations') });

  const [typeName, setTypeName] = useState('');
  const [stationNumber, setStationNumber] = useState('');
  const [stationTypeId, setStationTypeId] = useState('');
  const [gamepads, setGamepads] = useState('2');

  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : 'Kutilmagan xatolik.');
  const refreshTypes = () => void client.invalidateQueries({ queryKey: ['station-types'] });
  const refreshStations = () => {
    void client.invalidateQueries({ queryKey: ['stations'] });
    void client.invalidateQueries({ queryKey: ['map'] });
  };

  const addType = useMutation({
    mutationFn: (name: string) =>
      api<StationType>('/api/station-types', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => {
      setTypeName('');
      setError(null);
      refreshTypes();
    },
    onError,
  });

  const addStation = useMutation({
    mutationFn: (body: { typeId: string; number: number; gamepadCount: number }) =>
      api<Station>('/api/stations', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setStationNumber('');
      setError(null);
      refreshStations();
    },
    onError,
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
        <ul className="mb-2 flex flex-wrap gap-2">
          {types.data?.map((type) => (
            <li key={type.id}>
              <button
                type="button"
                onClick={() => setEditingType(type)}
                className="tap rounded-lg bg-slate-800 px-3 py-2 text-sm transition hover:bg-slate-700"
              >
                {type.name}
              </button>
            </li>
          ))}
          {types.data?.length === 0 && <li className="text-sm text-slate-500">Hali qo'shilmagan.</li>}
        </ul>
        <p className="mb-3 text-xs text-slate-500">Tahrirlash yoki o'chirish uchun turini bosing.</p>

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
            className={`${inputClass} w-48`}
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
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="py-2">Raqam</th>
                <th className="py-2">Turi</th>
                <th className="py-2 text-right">Pult</th>
                <th className="py-2">Holati</th>
                <th className="py-2">Izoh</th>
              </tr>
            </thead>
            <tbody>
              {stations.data?.map((station) => (
                <tr
                  key={station.id}
                  onClick={() => setEditingStation(station)}
                  className="cursor-pointer border-t border-slate-800 transition hover:bg-slate-900"
                >
                  <td className="py-2.5">{station.number}</td>
                  <td className="py-2.5">{station.type.name}</td>
                  <td className="py-2.5 text-right tabular-nums">{station.gamepadCount}</td>
                  <td
                    className={`py-2.5 ${station.status === 'OUT_OF_SERVICE' ? 'text-red-400' : 'text-slate-400'}`}
                  >
                    {STATUS_LABEL[station.status]}
                  </td>
                  <td className="py-2.5 text-slate-500">{station.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stations.data?.length === 0 && <p className="text-sm text-slate-500">Hali qo'shilmagan.</p>}
          {(stations.data?.length ?? 0) > 0 && (
            <p className="mt-2 text-xs text-slate-500">Tahrirlash uchun qatorni bosing.</p>
          )}
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
            onChange={(e) => setStationNumber(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="Joy raqami"
            className={`${inputClass} w-32`}
          />
          <select
            value={stationTypeId}
            onChange={(e) => setStationTypeId(e.target.value)}
            className={`${inputClass} w-40`}
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
            onChange={(e) => setGamepads(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="Pult"
            className={`${inputClass} w-24`}
          />
          <button type="submit" className="tap rounded-lg bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-500">
            Joy qo'shish
          </button>
        </form>
      </section>

      <p className="text-sm text-slate-400">Tariflar alohida bo'limda — chap menyudagi "Tariflar".</p>

      {editingType && (
        <TypeEditor
          type={editingType}
          onClose={() => setEditingType(null)}
          onDone={refreshTypes}
          onError={onError}
        />
      )}
      {editingStation && (
        <StationEditor
          station={editingStation}
          types={types.data ?? []}
          onClose={() => setEditingStation(null)}
          onDone={refreshStations}
          onError={onError}
        />
      )}
    </div>
  );
}

function TypeEditor({
  type,
  onClose,
  onDone,
  onError,
}: {
  type: StationType;
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [name, setName] = useState(type.name);
  const [confirmed, setConfirmed] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api(`/api/station-types/${type.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/station-types/${type.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e) => {
      setConfirmed(false);
      onError(e);
    },
  });

  return (
    <Modal title={`Joy turi: ${type.name}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nomi">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => (confirmed ? remove.mutate() : setConfirmed(true))}
            className={`tap rounded-lg px-4 py-3 text-sm transition ${
              confirmed ? 'bg-red-700 hover:bg-red-600' : 'bg-slate-800 text-red-400 hover:bg-slate-700'
            }`}
          >
            {confirmed ? 'Aniqmi? Bosing' : 'O\'chirish'}
          </button>
          <button
            type="button"
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate()}
            className="tap flex-1 rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-40"
          >
            Saqlash
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Bu turga bog'langan joy bo'lsa o'chirib bo'lmaydi — avval joylarni boshqa turga o'tkazing.
        </p>
      </div>
    </Modal>
  );
}

function StationEditor({
  station,
  types,
  onClose,
  onDone,
  onError,
}: {
  station: Station;
  types: StationType[];
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [form, setForm] = useState({
    number: String(station.number),
    typeId: station.type.id,
    gamepadCount: String(station.gamepadCount),
    status: station.status === 'BUSY' ? 'BUSY' : station.status,
    note: station.note ?? '',
  });
  const [confirmed, setConfirmed] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api(`/api/stations/${station.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          number: Number(form.number) || station.number,
          typeId: form.typeId,
          gamepadCount: Number(form.gamepadCount) || 0,
          // Band joyning holatini bu yerdan o'zgartirmaymiz — seans boshqaradi.
          ...(station.status === 'BUSY' ? {} : { status: form.status }),
          note: form.note.trim() || null,
        }),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/stations/${station.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e) => {
      setConfirmed(false);
      onError(e);
    },
  });

  return (
    <Modal title={`${station.number}-joy`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Raqami">
            <input
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
          <Field label="Pult soni">
            <input
              value={form.gamepadCount}
              onChange={(e) => setForm({ ...form, gamepadCount: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Joy turi">
          <select
            value={form.typeId}
            onChange={(e) => setForm({ ...form, typeId: e.target.value })}
            className={inputClass}
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        {station.status === 'BUSY' ? (
          <p className="rounded-lg bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
            Joyda ochiq seans bor — holatini seans yopilgandan keyin o'zgartirasiz.
          </p>
        ) : (
          <Field label="Holati">
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Station['status'] })}
              className={inputClass}
            >
              <option value="FREE">Bo'sh</option>
              <option value="OUT_OF_SERVICE">Xizmatda emas (nosozlik)</option>
            </select>
          </Field>
        )}

        <Field label="Izoh (nosozlik sababi va h.k.)">
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className={inputClass}
          />
        </Field>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => (confirmed ? remove.mutate() : setConfirmed(true))}
            className={`tap rounded-lg px-4 py-3 text-sm transition ${
              confirmed ? 'bg-red-700 hover:bg-red-600' : 'bg-slate-800 text-red-400 hover:bg-slate-700'
            }`}
          >
            {confirmed ? 'Aniqmi? Bosing' : 'O\'chirish'}
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="tap flex-1 rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-40"
          >
            Saqlash
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Bu joyda seans bo'lgan bo'lsa o'chirib bo'lmaydi — o'rniga "Xizmatda emas" holatiga o'tkazing.
        </p>
      </div>
    </Modal>
  );
}
