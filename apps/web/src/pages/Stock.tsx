import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '../lib/api.ts';
import { Field, Modal, inputClass } from '../components/Modal.tsx';
import { isManager, useAuth } from '../store/auth.ts';

interface Product {
  id: string;
  name: string;
  salePrice: number;
  costPrice: number;
  stockQty: number;
  minStock: number;
  isQuickKey: boolean;
  category: { name: string } | null;
}

interface Category {
  id: string;
  name: string;
}

const summa = (v: number) => v.toLocaleString('uz-UZ');

export function Stock() {
  const user = useAuth((s) => s.user);
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [incoming, setIncoming] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [counting, setCounting] = useState<Product | null>(null);
  const [writingOff, setWritingOff] = useState<Product | null>(null);
  const [history, setHistory] = useState<Product | null | 'all'>(null);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stockStatus, setStockStatus] = useState<string>('all');

  const params = new URLSearchParams();
  if (search.trim()) params.set('q', search.trim());
  if (categoryId) params.set('categoryId', categoryId);
  if (stockStatus && stockStatus !== 'all') params.set('stockStatus', stockStatus);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const products = useQuery({
    queryKey: ['products', search, categoryId, stockStatus],
    queryFn: () => api<Product[]>(`/api/products${qs}`),
  });
  const categories = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => api<Category[]>('/api/product-categories'),
  });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['products'] });
    void client.invalidateQueries({ queryKey: ['product-categories'] });
  };
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : 'Kutilmagan xatolik.');

  const low = (products.data ?? []).filter((p) => p.stockQty <= p.minStock);

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Ombor</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setHistory('all')}
            className="tap rounded-lg bg-slate-800 px-4 py-2 text-sm transition hover:bg-slate-700"
          >
            Ombor tarixi
          </button>
          {isManager(user) && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="tap rounded-lg bg-emerald-600 px-4 py-2 text-sm transition hover:bg-emerald-500"
            >
              Mahsulot qo'shish
            </button>
          )}
        </div>
      </header>

      {low.length > 0 && (
        <p className="rounded-lg bg-amber-950/60 px-4 py-3 text-sm text-amber-300">
          Qoldiq tugayapti: {low.map((p) => `${p.name} (${p.stockQty})`).join(', ')}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Mahsulot qidirish..."
          className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 flex-1 min-w-[200px]"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Kategoriya bo'yicha filter"
          className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Barcha kategoriyalar</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={stockStatus}
          onChange={(e) => setStockStatus(e.target.value)}
          aria-label="Qoldiq holati bo'yicha filter"
          className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="all">Barcha qoldiqlar</option>
          <option value="in_stock">Yetarli qoldiq</option>
          <option value="low">Kam qolganlar</option>
          <option value="out">Tugaganlar (0)</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="py-2">Nomi</th>
              <th className="py-2">Kategoriya</th>
              <th className="py-2 text-right">Tannarx</th>
              <th className="py-2 text-right">Sotuv</th>
              <th className="py-2 text-right">Qoldiq</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(products.data ?? []).map((p) => (
              <tr key={p.id} className="border-t border-slate-800">
                <td className="py-2">
                  {p.name}
                  {p.isQuickKey && <span className="ml-2 text-xs text-emerald-500">tez tugma</span>}
                </td>
                <td className="py-2 text-slate-400">{p.category?.name ?? '—'}</td>
                <td className="py-2 text-right tabular-nums text-slate-400">{summa(p.costPrice)}</td>
                <td className="py-2 text-right tabular-nums">{summa(p.salePrice)}</td>
                <td
                  className={`py-2 text-right tabular-nums ${p.stockQty <= p.minStock ? 'text-amber-400' : ''}`}
                >
                  {p.stockQty}
                </td>
                <td className="py-2 text-right">
                  {isManager(user) && (
                    <span className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setIncoming(p)}
                        className="text-sm text-emerald-400 hover:text-emerald-300"
                      >
                        kirim
                      </button>
                      <button
                        type="button"
                        onClick={() => setCounting(p)}
                        className="text-sm text-sky-400 hover:text-sky-300"
                      >
                        sanoq
                      </button>
                      <button
                        type="button"
                        onClick={() => setWritingOff(p)}
                        className="text-sm text-amber-400 hover:text-amber-300"
                      >
                        chiqarish
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistory(p)}
                        className="text-sm text-slate-400 hover:text-slate-200"
                      >
                        tarix
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        className="text-sm text-slate-400 hover:text-slate-200"
                      >
                        tahrirlash
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.data?.length === 0 && <p className="text-sm text-slate-500">Mahsulot yo'q.</p>}
      </div>

      {adding && (
        <AddProduct
          categories={categories.data ?? []}
          onClose={() => setAdding(false)}
          onDone={refresh}
          onError={onError}
        />
      )}
      {incoming && (
        <StockIn product={incoming} onClose={() => setIncoming(null)} onDone={refresh} onError={onError} />
      )}
      {editing && (
        <EditProduct product={editing} onClose={() => setEditing(null)} onDone={refresh} onError={onError} />
      )}
      {counting && (
        <CountStock product={counting} onClose={() => setCounting(null)} onDone={refresh} onError={onError} />
      )}
      {writingOff && (
        <WriteOff product={writingOff} onClose={() => setWritingOff(null)} onDone={refresh} onError={onError} />
      )}
      {history && (
        <StockHistory product={history === 'all' ? null : history} onClose={() => setHistory(null)} />
      )}
    </div>
  );
}

function EditProduct({
  product,
  onClose,
  onDone,
  onError,
}: {
  product: Product;
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [form, setForm] = useState({
    name: product.name,
    costPrice: String(product.costPrice),
    salePrice: String(product.salePrice),
    minStock: String(product.minStock),
    isQuickKey: product.isQuickKey,
  });
  const [confirmed, setConfirmed] = useState(false);

  const patch = (body: Record<string, unknown>) =>
    api(`/api/products/${product.id}`, { method: 'PATCH', body: JSON.stringify(body) });

  const save = useMutation({
    mutationFn: () =>
      patch({
        name: form.name.trim(),
        costPrice: Number(form.costPrice) || 0,
        salePrice: Number(form.salePrice) || 0,
        minStock: Number(form.minStock) || 0,
        isQuickKey: form.isQuickKey,
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/products/${product.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError,
  });

  return (
    <Modal title={product.name} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nomi">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tannarx">
            <input
              value={form.costPrice}
              onChange={(e) => setForm({ ...form, costPrice: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
          <Field label="Sotuv narxi">
            <input
              value={form.salePrice}
              onChange={(e) => setForm({ ...form, salePrice: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Ogohlantirish chegarasi">
          <input
            value={form.minStock}
            onChange={(e) => setForm({ ...form, minStock: e.target.value.replace(/\D/g, '') })}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isQuickKey}
            onChange={(e) => setForm({ ...form, isQuickKey: e.target.checked })}
          />
          Tez tugmalarda ko'rsatilsin
        </label>

        <p className="text-xs text-slate-500">
          Qoldiq: {product.stockQty}. Uni faqat kirim orqali o'zgartirish mumkin — shunda ombor tarixi
          buzilmaydi.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => (confirmed ? remove.mutate() : setConfirmed(true))}
            className={`tap rounded-lg px-4 py-3 text-sm transition ${
              confirmed ? 'bg-red-700 hover:bg-red-600' : 'bg-slate-800 text-red-400 hover:bg-slate-700'
            }`}
          >
            {confirmed ? 'Aniqmi? O\'chirish' : "O'chirish"}
          </button>
          <button
            type="button"
            disabled={!form.name.trim() || save.isPending}
            onClick={() => save.mutate()}
            className="tap flex-1 rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-40"
          >
            Saqlash
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Agar mahsulotda harakatlar (sotuv, kirim) bo'lsa, u arxivlanadi (yashiriladi). Harakat bo'lmasa, butunlay o'chiriladi.
        </p>
      </div>
    </Modal>
  );
}

function AddProduct({
  categories,
  onClose,
  onDone,
  onError,
}: {
  categories: Category[];
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    categoryId: '',
    costPrice: '',
    salePrice: '',
    minStock: '5',
    isQuickKey: true,
  });
  const [newCategory, setNewCategory] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      let categoryId = form.categoryId || null;
      if (!categoryId && newCategory.trim()) {
        const created = await api<Category>('/api/product-categories', {
          method: 'POST',
          body: JSON.stringify({ name: newCategory.trim() }),
        });
        categoryId = created.id;
      }
      return api('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          categoryId,
          costPrice: Number(form.costPrice) || 0,
          salePrice: Number(form.salePrice) || 0,
          minStock: Number(form.minStock) || 0,
          isQuickKey: form.isQuickKey,
        }),
      });
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError,
  });

  return (
    <Modal title="Yangi mahsulot" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nomi">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Kategoriya">
          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className={inputClass}
          >
            <option value="">— yangi kiriting —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {!form.categoryId && (
          <Field label="Yangi kategoriya nomi">
            <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className={inputClass} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tannarx">
            <input
              value={form.costPrice}
              onChange={(e) => setForm({ ...form, costPrice: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
          <Field label="Sotuv narxi">
            <input
              value={form.salePrice}
              onChange={(e) => setForm({ ...form, salePrice: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Ogohlantirish chegarasi (minimal qoldiq)">
          <input
            value={form.minStock}
            onChange={(e) => setForm({ ...form, minStock: e.target.value.replace(/\D/g, '') })}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isQuickKey}
            onChange={(e) => setForm({ ...form, isQuickKey: e.target.checked })}
          />
          Tez tugmalarda ko'rsatilsin
        </label>
        <button
          type="button"
          disabled={!form.name.trim() || !form.salePrice || save.isPending}
          onClick={() => save.mutate()}
          className="tap w-full rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-40"
        >
          Saqlash
        </button>
      </div>
    </Modal>
  );
}

function StockIn({
  product,
  onClose,
  onDone,
  onError,
}: {
  product: Product;
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState(String(product.costPrice));
  const [note, setNote] = useState('');
  const [supplierId, setSupplierId] = useState('');

  const suppliers = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<{ id: string; name: string }[]>('/api/suppliers'),
  });

  const save = useMutation({
    mutationFn: () =>
      api('/api/stock/in', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          qty: Number(qty) || 0,
          unitCost: unitCost === '' ? null : Number(unitCost),
          supplierId: supplierId || null,
          note: note.trim() || null,
        }),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError,
  });

  return (
    <Modal title={`Kirim — ${product.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">Hozirgi qoldiq: {product.stockQty}</p>
        <Field label="Necha dona keldi">
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <Field label="Dona tannarxi">
          <input
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <Field label="Ta'minotchi">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
            <option value="">Ko'rsatilmagan</option>
            {suppliers.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Izoh">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>

        <p className="text-xs text-slate-500">
          Ta'minotchi tanlansa, bu kirim uning qarziga qo'shiladi.
        </p>
        <button
          type="button"
          disabled={!qty || save.isPending}
          onClick={() => save.mutate()}
          className="tap w-full rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-40"
        >
          Kirim qilish
        </button>
      </div>
    </Modal>
  );
}

/** Inventarizatsiya — TZ M3.3. Sanoq natijasi va farq qayd qilinadi. */
function CountStock({
  product,
  onClose,
  onDone,
  onError,
}: {
  product: Product;
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');

  const diff = counted === '' ? null : Number(counted) - product.stockQty;

  const save = useMutation({
    mutationFn: () =>
      api('/api/stock/count', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          countedQty: Number(counted) || 0,
          note: note.trim() || null,
        }),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError,
  });

  return (
    <Modal title={`Sanoq — ${product.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">Tizimdagi qoldiq: {product.stockQty}</p>

        <Field label="Haqiqatda nechta bor (sanang)">
          <input
            value={counted}
            onChange={(e) => setCounted(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>

        {diff !== null && diff !== 0 && (
          <p className={`text-sm ${diff < 0 ? 'text-red-300' : 'text-amber-300'}`}>
            Farq: {diff > 0 ? '+' : ''}
            {diff} dona — {diff < 0 ? 'kamomad' : 'ortiqcha'}
          </p>
        )}
        {diff === 0 && <p className="text-sm text-emerald-400">Farq yo'q.</p>}

        <Field label="Izoh (farq sababi)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>

        <button
          type="button"
          disabled={counted === '' || save.isPending}
          onClick={() => save.mutate()}
          className="tap w-full rounded-lg bg-emerald-600 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-40"
        >
          Sanoqni saqlash
        </button>

        <p className="text-xs text-slate-500">
          Qoldiq sanoq bo'yicha to'g'rilanadi, farq ombor tarixiga yoziladi. Kamomad audit jurnalida
          kritik deb belgilanadi.
        </p>
      </div>
    </Modal>
  );
}

/** Hisobdan chiqarish — buzilgan yoki muddati o'tgan tovar (TZ M3.3). */
function WriteOff({
  product,
  onClose,
  onDone,
  onError,
}: {
  product: Product;
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');

  const zarar = (Number(qty) || 0) * product.costPrice;

  const save = useMutation({
    mutationFn: () =>
      api<{ zarar: number }>('/api/stock/write-off', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, qty: Number(qty) || 0, reason: reason.trim() }),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError,
  });

  return (
    <Modal title={`Hisobdan chiqarish — ${product.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">Omborda: {product.stockQty} dona</p>

        <Field label="Necha dona chiqariladi">
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>

        <Field label="Sabab (majburiy)">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
            <option value="">Tanlang…</option>
            <option>Muddati o'tgan</option>
            <option>Buzilgan</option>
            <option>Sinib qolgan</option>
            <option>Yo'qolgan</option>
            <option>Klub ehtiyoji uchun</option>
          </select>
        </Field>

        {zarar > 0 && (
          <p className="rounded-lg bg-amber-950/60 px-3 py-2 text-sm text-amber-300">
            Zarar: {summa(zarar)} so'm (tannarx bo'yicha)
          </p>
        )}

        <button
          type="button"
          disabled={!qty || !reason || save.isPending}
          onClick={() => save.mutate()}
          className="tap w-full rounded-lg bg-amber-700 py-3 font-medium transition hover:bg-amber-600 disabled:opacity-40"
        >
          Hisobdan chiqarish
        </button>

        <p className="text-xs text-slate-500">
          Yozuv ombor tarixida qoladi va audit jurnalida kritik deb belgilanadi. Sanoq bilan
          yashirishdan farqi shu — sabab ko'rinib turadi.
        </p>
      </div>
    </Modal>
  );
}

interface Movement {
  id: string;
  createdAt: string;
  type: 'IN' | 'SALE' | 'INVENTORY' | 'WRITE_OFF';
  qty: number;
  unitCost: number | null;
  note: string | null;
  product: { id: string; name: string };
  supplier: string | null;
  user: string | null;
}

const TUR_NOMI: Record<Movement['type'], string> = {
  IN: 'Kirim',
  SALE: 'Sotuv',
  INVENTORY: 'Sanoq',
  WRITE_OFF: 'Chiqarildi',
};

const TUR_RANGI: Record<Movement['type'], string> = {
  IN: 'text-emerald-400',
  SALE: 'text-slate-400',
  INVENTORY: 'text-sky-400',
  WRITE_OFF: 'text-amber-400',
};

/** Ombor tarixi — TZ M3.3. Ma'lumot bazada bor edi, ko'rish imkoni yo'q edi. */
function StockHistory({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [typeFilter, setTypeFilter] = useState<'all' | Movement['type']>('all');

  const params = new URLSearchParams();
  if (product) params.set('productId', product.id);
  if (typeFilter !== 'all') params.set('type', typeFilter);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const query = useQuery({
    queryKey: ['stock-movements', product?.id ?? 'all', typeFilter],
    queryFn: () => api<Movement[]>(`/api/stock/movements${qs}`),
  });

  const vaqt = (iso: string) =>
    new Date(iso).toLocaleString('uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <Modal title={product ? `Tarix — ${product.name}` : 'Ombor tarixi'} onClose={onClose} wide>
      <div className="flex flex-wrap gap-2 mb-3">
        {(['all', 'IN', 'SALE', 'INVENTORY', 'WRITE_OFF'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1 text-xs rounded-lg transition ${
              typeFilter === t
                ? 'bg-emerald-600 text-white font-medium'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t === 'all' ? 'Barchasi' : TUR_NOMI[t]}
          </button>
        ))}
      </div>

      {query.isLoading && <p className="text-sm text-slate-400">Yuklanmoqda…</p>}

      {query.data && query.data.length === 0 && (
        <p className="text-sm text-slate-500">Harakat yo'q.</p>
      )}

      {query.data && query.data.length > 0 && (
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-900 text-xs text-slate-400">
              <tr>
                <th className="py-2">Vaqt</th>
                <th className="py-2">Turi</th>
                {!product && <th className="py-2">Mahsulot</th>}
                <th className="py-2 text-right">Soni</th>
                <th className="py-2">Izoh</th>
                <th className="py-2">Kim</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((m) => (
                <tr key={m.id} className="border-t border-slate-800">
                  <td className="py-2 whitespace-nowrap text-slate-400">{vaqt(m.createdAt)}</td>
                  <td className={`py-2 ${TUR_RANGI[m.type]}`}>{TUR_NOMI[m.type]}</td>
                  {!product && <td className="py-2">{m.product.name}</td>}
                  <td
                    className={`py-2 text-right tabular-nums ${m.qty > 0 ? 'text-emerald-400' : 'text-slate-300'}`}
                  >
                    {m.qty > 0 ? `+${m.qty}` : m.qty}
                  </td>
                  <td className="py-2 text-slate-500">
                    {[m.supplier, m.note].filter(Boolean).join(' · ')}
                  </td>
                  <td className="py-2 text-slate-500">{m.user ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
