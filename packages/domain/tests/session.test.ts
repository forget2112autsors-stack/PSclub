import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { itemsAmount, sessionTotals } from '../src/index.ts';

test('BQ-1: o\'yin va bufet qo\'shiladi, chegirma ayriladi', () => {
  const t = sessionTotals({
    gameAmount: 80_000,
    items: [
      { qty: 2, unitPrice: 15_000 },
      { qty: 1, unitPrice: 12_000 },
    ],
    discount: 10_000,
  });

  assert.equal(t.itemsAmount, 42_000);
  assert.equal(t.totalAmount, 80_000 + 42_000 - 10_000);
});

test('chegirma jami summadan oshib ketolmaydi', () => {
  const t = sessionTotals({ gameAmount: 20_000, items: [], discount: 50_000 });

  assert.equal(t.discount, 20_000);
  assert.equal(t.totalAmount, 0);
  assert.ok(t.balance >= 0, 'kassa mijozga qarzdor bo\'lib qolmasin');
});

test('itemsAmount bo\'sh ro\'yxatda nol qaytaradi', () => {
  assert.equal(itemsAmount([]), 0);
});

// ------------------------------------------------------- BQ-3: qarz va limit

test('BQ-3: to\'lanmagan summa qarz sifatida ko\'rinadi', () => {
  const t = sessionTotals({
    gameAmount: 100_000,
    items: [],
    payments: [{ amount: 40_000 }],
    creditLimit: 600_000,
  });

  assert.equal(t.balance, -60_000);
  assert.equal(t.debt, 60_000);
  assert.equal(t.creditExceeded, false);
  assert.equal(t.canAddService, true);
});

test('QM-4: ishonch limiti oshganda yangi xizmat bloklanadi', () => {
  const t = sessionTotals({
    gameAmount: 650_000,
    items: [],
    payments: [],
    creditLimit: 600_000,
  });

  assert.equal(t.creditExceeded, true);
  assert.equal(t.canAddService, false);
  assert.match(t.blockReason ?? '', /limit/i);
});

test('limit aynan chegaraga yetganda ham bloklanadi', () => {
  const t = sessionTotals({ gameAmount: 600_000, items: [], creditLimit: 600_000 });
  assert.equal(t.creditExceeded, true);
});

test('limit 0 bo\'lsa cheklov qo\'llanmaydi (oldindan to\'lov rejimi)', () => {
  const t = sessionTotals({ gameAmount: 900_000, items: [], creditLimit: 0 });

  assert.equal(t.creditExceeded, false);
  assert.equal(t.canAddService, true);
});

test('ortiqcha to\'lov musbat balans beradi, qarz nol bo\'ladi', () => {
  const t = sessionTotals({
    gameAmount: 50_000,
    items: [],
    payments: [{ amount: 80_000 }],
  });

  assert.equal(t.balance, 30_000);
  assert.equal(t.debt, 0);
});

test('aralash to\'lov qo\'shib hisoblanadi — QM-5', () => {
  const t = sessionTotals({
    gameAmount: 60_000,
    items: [{ qty: 1, unitPrice: 20_000 }],
    payments: [{ amount: 50_000 }, { amount: 30_000 }],
  });

  assert.equal(t.paidAmount, 80_000);
  assert.equal(t.balance, 0);
  assert.equal(t.canClose, true);
});

// ------------------------------------------------------------ Mehmon qarzi --

test('BQ-3: mehmon seansini qarz bilan yopib bo\'lmaydi', () => {
  const t = sessionTotals({
    gameAmount: 50_000,
    items: [],
    payments: [{ amount: 20_000 }],
    isGuest: true,
  });

  assert.equal(t.debt, 30_000);
  assert.equal(t.canClose, false);
  assert.match(t.blockReason ?? '', /mehmon/i);
});

test('mehmon to\'liq to\'lasa seans yopiladi', () => {
  const t = sessionTotals({
    gameAmount: 50_000,
    items: [],
    payments: [{ amount: 50_000 }],
    isGuest: true,
  });

  assert.equal(t.canClose, true);
  assert.equal(t.blockReason, null);
});

test('mijozga bog\'langan seans qarz bilan yopiladi — qarz kartaga yoziladi', () => {
  const t = sessionTotals({
    gameAmount: 50_000,
    items: [],
    payments: [],
    isGuest: false,
  });

  assert.equal(t.debt, 50_000);
  assert.equal(t.canClose, true);
});
