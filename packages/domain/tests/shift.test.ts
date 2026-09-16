import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { reconcileCash } from '../src/index.ts';

const base = {
  openingCash: 500_000,
  cashPayments: 1_200_000,
  cashExpenses: 300_000,
  countedCash: 1_400_000,
  threshold: 20_000,
};

test('BQ-4: kutilayotgan naqd formula bo\'yicha hisoblanadi', () => {
  const r = reconcileCash(base);

  // 500 000 + 1 200 000 − 300 000
  assert.equal(r.expectedCash, 1_400_000);
  assert.equal(r.diff, 0);
  assert.equal(r.requiresNote, false);
  assert.equal(r.canClose, true);
});

test('BQ-4: qaytarilgan summa kutilayotgan naqddan ayriladi', () => {
  const r = reconcileCash({ ...base, refunds: 50_000, countedCash: 1_350_000 });

  assert.equal(r.expectedCash, 1_350_000);
  assert.equal(r.diff, 0);
});

test('QM-8: farq bo\'lsa izohsiz yopib bo\'lmaydi', () => {
  const r = reconcileCash({ ...base, countedCash: 1_385_000 });

  assert.equal(r.diff, -15_000);
  assert.equal(r.requiresNote, true);
  assert.equal(r.canClose, false);
  assert.match(r.blockReason ?? '', /izoh/i);
});

test('izoh berilsa farq bilan ham yopiladi', () => {
  const r = reconcileCash({
    ...base,
    countedCash: 1_385_000,
    note: 'Mijozga qaytim noto\'g\'ri berilgan',
  });

  assert.equal(r.canClose, true);
  assert.equal(r.blockReason, null);
});

test('bo\'sh izoh izoh hisoblanmaydi', () => {
  const r = reconcileCash({ ...base, countedCash: 1_385_000, note: '   ' });
  assert.equal(r.canClose, false);
});

test('BQ-4: chegaradan oshgan farqda egasiga xabar belgilanadi', () => {
  const kichik = reconcileCash({ ...base, countedCash: 1_385_000 });
  const katta = reconcileCash({ ...base, countedCash: 1_300_000, note: 'sanoq' });

  assert.equal(kichik.notifyOwner, false, '15 000 < 20 000 chegara');
  assert.equal(katta.notifyOwner, true, '100 000 > 20 000 chegara');
});

test('kassada ortiqcha pul ham farq hisoblanadi', () => {
  const r = reconcileCash({ ...base, countedCash: 1_450_000 });

  assert.equal(r.diff, 50_000);
  assert.equal(r.requiresNote, true);
  assert.equal(r.notifyOwner, true);
});

test('ochiq seans qolgan bo\'lsa smena yopilmaydi', () => {
  const r = reconcileCash({ ...base, openSessions: 2 });

  assert.equal(r.canClose, false);
  assert.match(r.blockReason ?? '', /seans/i);
});

test('ochiq seans izohdan ustun turadi', () => {
  const r = reconcileCash({
    ...base,
    countedCash: 1_385_000,
    note: 'izoh bor',
    openSessions: 1,
  });

  assert.equal(r.canClose, false);
  assert.match(r.blockReason ?? '', /seans/i);
});
