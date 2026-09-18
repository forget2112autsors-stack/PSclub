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

  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') });
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
        {isManager(user) && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="tap rounded-lg bg-emerald-600 px-4 py-2 text-sm transition hover:bg-emerald-500"
          >
            Mahsulot qo'shish
          </button>
        )}
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
                    <button
                      type="button"
                      onClick={() => setIncoming(p)}
                      className="text-sm text-emerald-400 hover:text-emerald-300"
                    >
                      kirim
                    </button>
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
    </div>
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

  const save = useMutation({
    mutationFn: () =>
      api('/api/stock/in', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          qty: Number(qty) || 0,
          unitCost: unitCost === '' ? null : Number(unitCost),
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
        <Field label="Izoh (yetkazib beruvchi va h.k.)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>
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
