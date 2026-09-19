import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, ApiError } from '../lib/api.ts';
import { Field, Modal, inputClass } from '../components/Modal.tsx';
import { isManager, useAuth } from '../store/auth.ts';
import { useI18n } from '../lib/i18n.ts';

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

export interface StaffMember {
  id: string;
  fullName: string;
  role: 'OPERATOR' | 'ADMIN' | 'OWNER';
  isActive: boolean;
  telegramChatId: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<Station['status'], string> = {
  FREE: 'Bo\'sh',
  BUSY: 'Band',
  OUT_OF_SERVICE: 'Xizmatda emas',
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrator',
  OWNER: 'Egasi',
  OPERATOR: 'Operator',
};

export function Settings() {
  const user = useAuth((s) => s.user);
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<StationType | null>(null);
  const [editingStation, setEditingStation] = useState<Station | null>(null);

  const [stationSearch, setStationSearch] = useState('');
  const [stationTypeFilter, setStationTypeFilter] = useState('');
  const [stationStatusFilter, setStationStatusFilter] = useState('all');

  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState('all');
  const [staffStatusFilter, setStaffStatusFilter] = useState('all');
  const [addingStaff, setAddingStaff] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [deletingStaffId, setDeletingStaffId] = useState<string | null>(null);

  const { lang, setLang, t } = useI18n();
  const [exporting, setExporting] = useState(false);

  const downloadBackup = async () => {
    try {
      setExporting(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/backup/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Zaxira nusxasini yuklab olishda xatolik yuz berdi.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `psklub_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      onError(err);
    } finally {
      setExporting(false);
    }
  };

  const types = useQuery({ queryKey: ['station-types'], queryFn: () => api<StationType[]>('/api/station-types') });
  const stations = useQuery({ queryKey: ['stations'], queryFn: () => api<Station[]>('/api/stations') });
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api<StaffMember[]>('/api/staff') });

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
  const refreshStaff = () => void client.invalidateQueries({ queryKey: ['staff'] });

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

  const deleteStaff = useMutation({
    mutationFn: (id: string) => api(`/api/staff/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeletingStaffId(null);
      setError(null);
      refreshStaff();
    },
    onError,
  });

  const filteredStations = (stations.data ?? []).filter((s) => {
    if (stationSearch.trim()) {
      const q = stationSearch.trim().toLowerCase();
      const matchNum = String(s.number).includes(q);
      const matchNote = s.note?.toLowerCase().includes(q);
      const matchType = s.type.name.toLowerCase().includes(q);
      if (!matchNum && !matchNote && !matchType) return false;
    }
    if (stationTypeFilter && s.type.id !== stationTypeFilter) return false;
    if (stationStatusFilter !== 'all' && s.status !== stationStatusFilter) return false;
    return true;
  });

  const filteredStaff = (staff.data ?? []).filter((s) => {
    if (staffSearch.trim()) {
      const q = staffSearch.trim().toLowerCase();
      const matchName = s.fullName.toLowerCase().includes(q);
      const matchTg = s.telegramChatId?.toLowerCase().includes(q);
      const matchRole = ROLE_LABEL[s.role]?.toLowerCase().includes(q);
      if (!matchName && !matchTg && !matchRole) return false;
    }
    if (staffRoleFilter !== 'all' && s.role !== staffRoleFilter) return false;
    if (staffStatusFilter === 'active' && !s.isActive) return false;
    if (staffStatusFilter === 'inactive' && s.isActive) return false;
    return true;
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-medium text-slate-300">Joylar</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={stationSearch}
              onChange={(e) => setStationSearch(e.target.value)}
              placeholder="Qidirish (raqam, izoh)..."
              className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-44"
            />
            <select
              value={stationTypeFilter}
              onChange={(e) => setStationTypeFilter(e.target.value)}
              aria-label="Joy turi filter"
              className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Barcha turlar</option>
              {types.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={stationStatusFilter}
              onChange={(e) => setStationStatusFilter(e.target.value)}
              aria-label="Joy holati filter"
              className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">Barcha holatlar</option>
              <option value="FREE">Bo'sh</option>
              <option value="BUSY">Band</option>
              <option value="OUT_OF_SERVICE">Xizmatda emas</option>
            </select>
          </div>
        </div>

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
              {filteredStations.map((station) => (
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
          {filteredStations.length === 0 && <p className="text-sm text-slate-500 py-3">Joylar topilmadi.</p>}
          {filteredStations.length > 0 && (
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

      {isManager(user) && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-medium text-slate-300">Xodimlar (Operatorlar va Adminlar)</h2>
              <p className="text-xs text-slate-500">Tizimga kirish huquqiga ega xodimlar ro'yxati va ularni boshqarish.</p>
            </div>
            <button
              type="button"
              onClick={() => setAddingStaff(true)}
              className="tap rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500"
            >
              Xodim qo'shish
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-3">
            <input
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              placeholder="Qidirish (ism, rol)..."
              className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 flex-1 min-w-[180px]"
            />
            <select
              value={staffRoleFilter}
              onChange={(e) => setStaffRoleFilter(e.target.value)}
              aria-label="Rol bo'yicha filter"
              className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">Barcha rollar</option>
              <option value="OPERATOR">Operator</option>
              <option value="ADMIN">Administrator</option>
            </select>
            <select
              value={staffStatusFilter}
              onChange={(e) => setStaffStatusFilter(e.target.value)}
              aria-label="Status bo'yicha filter"
              className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">Barcha holatlar</option>
              <option value="active">Faol</option>
              <option value="inactive">Nofaol / Arxiv</option>
            </select>
          </div>

          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-400">
                <tr>
                  <th className="py-2">Ism-familiya</th>
                  <th className="py-2">Roli</th>
                  <th className="py-2">Telegram ID</th>
                  <th className="py-2">Holati</th>
                  <th className="py-2 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((st) => (
                  <tr key={st.id} className="border-t border-slate-800">
                    <td className="py-2.5 font-medium">{st.fullName}</td>
                    <td className="py-2.5">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          st.role === 'ADMIN' || st.role === 'OWNER'
                            ? 'bg-amber-950/60 text-amber-300'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {ROLE_LABEL[st.role] ?? st.role}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400">{st.telegramChatId ? `@${st.telegramChatId}` : '—'}</td>
                    <td className="py-2.5">
                      <span
                        className={`inline-block h-2 w-2 rounded-full mr-2 ${
                          st.isActive ? 'bg-emerald-400' : 'bg-red-400'
                        }`}
                      />
                      <span className={st.isActive ? 'text-slate-300' : 'text-slate-500'}>
                        {st.isActive ? 'Faol' : 'Nofaol'}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingStaff(st)}
                          className="text-xs text-slate-400 hover:text-slate-200"
                        >
                          tahrirlash
                        </button>
                        {user?.sub !== st.id && (
                          <button
                            type="button"
                            disabled={deleteStaff.isPending}
                            onClick={() => {
                              if (deletingStaffId === st.id) {
                                deleteStaff.mutate(st.id);
                              } else {
                                setDeletingStaffId(st.id);
                              }
                            }}
                            className={`text-xs transition ${
                              deletingStaffId === st.id
                                ? 'font-bold text-red-400'
                                : 'text-slate-500 hover:text-red-400'
                            }`}
                          >
                            {deletingStaffId === st.id ? 'aniqmi?' : 'o\'chirish'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredStaff.length === 0 && <p className="text-sm text-slate-500 py-3">Xodimlar topilmadi.</p>}
          </div>
        </section>
      )}

      {/* TZ M8: Tizim sozlamalari, Til va Zaxira nusxa (Backup) */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="text-base font-semibold text-slate-200">{t('backupSection')}</h2>

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <p className="text-sm font-medium text-slate-300">{t('language')}</p>
            <p className="text-xs text-slate-400">Interfeys tilini tanlash (O'zbekcha / Русский)</p>
          </div>
          <div className="flex items-center rounded-lg border border-slate-700 bg-slate-950 p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setLang('uz')}
              className={`rounded px-3 py-1 transition ${lang === 'uz' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              O'zbekcha
            </button>
            <button
              type="button"
              onClick={() => setLang('ru')}
              className={`rounded px-3 py-1 transition ${lang === 'ru' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Русский
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-slate-300">Ma'lumotlar bazasi zaxira nusxasi</p>
            <p className="text-xs text-slate-400">{t('backupHelp')}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              VPS da har kuni avtomatik zaxira olinadi va 30 kun saqlanadi (scripts/backup.sh).
            </p>
          </div>
          <button
            type="button"
            disabled={exporting}
            onClick={downloadBackup}
            className="tap inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
          >
            <span>💾</span>
            {exporting ? t('downloadingBackup') : t('downloadBackup')}
          </button>
        </div>
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
      {addingStaff && (
        <AddStaffModal
          onClose={() => setAddingStaff(false)}
          onDone={refreshStaff}
          onError={onError}
        />
      )}
      {editingStaff && (
        <EditStaffModal
          staff={editingStaff}
          onClose={() => setEditingStaff(null)}
          onDone={refreshStaff}
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

function AddStaffModal({
  onClose,
  onDone,
  onError,
}: {
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [form, setForm] = useState({
    fullName: '',
    role: 'OPERATOR' as 'OPERATOR' | 'ADMIN',
    pin: '',
  });

  const save = useMutation({
    mutationFn: () =>
      api<StaffMember>('/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          role: form.role,
          pin: form.pin.trim(),
        }),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError,
  });

  return (
    <Modal title="Yangi xodim qo'shish" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (form.fullName.trim() && form.pin.trim().length >= 4) save.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Ism-familiya">
          <input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            placeholder="Ali Valiyev"
            className={inputClass}
            required
          />
        </Field>

        <Field label="Roli">
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'OPERATOR' | 'ADMIN' })}
            className={inputClass}
          >
            <option value="OPERATOR">Operator</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </Field>

        <Field label="PIN kod (4-8 ta raqam)">
          <input
            type="password"
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 8) })}
            placeholder="1234"
            inputMode="numeric"
            className={inputClass}
            required
            minLength={4}
            maxLength={8}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="tap rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={!form.fullName.trim() || form.pin.trim().length < 4 || save.isPending}
            className="tap rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {save.isPending ? 'Saqlanmoqda…' : 'Qo\'shish'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditStaffModal({
  staff,
  onClose,
  onDone,
  onError,
}: {
  staff: StaffMember;
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [fullName, setFullName] = useState(staff.fullName);
  const [role, setRole] = useState(staff.role);
  const [pin, setPin] = useState('');
  const [isActive, setIsActive] = useState(staff.isActive);

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        fullName: fullName.trim(),
        role,
        isActive,
      };
      if (pin.trim().length >= 4) {
        payload.pin = pin.trim();
      }
      return api(`/api/staff/${staff.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError,
  });

  return (
    <Modal title={`Xodimni tahrirlash: ${staff.fullName}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (fullName.trim()) save.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Ism-familiya">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
            required
          />
        </Field>

        <Field label="Roli">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'OPERATOR' | 'ADMIN' | 'OWNER')}
            className={inputClass}
            disabled={staff.role === 'OWNER'}
          >
            {staff.role === 'OWNER' && <option value="OWNER">Egasi</option>}
            <option value="OPERATOR">Operator</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </Field>

        <Field label="Yangi PIN kod (o'zgartirmaslik uchun bo'sh qoldiring)">
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="Yangi PIN (4-8 ta raqam)"
            inputMode="numeric"
            className={inputClass}
            minLength={4}
            maxLength={8}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={staff.role === 'OWNER'}
          />
          Xodim faol holatda (tizimga kirish huquqiga ega)
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="tap rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={!fullName.trim() || save.isPending}
            className="tap rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {save.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

