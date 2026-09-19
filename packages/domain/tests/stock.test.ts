import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { weightedCost } from '../src/index.ts';

test('M3.3: tannarx qoldiq bilan tortib o\'rtachalanadi', () => {
  // 15 dona 10 000 dan + 20 dona 13 000 dan = 455 000 / 35 = 13 000 emas, 11 714
  const cost = weightedCost({
    currentQty: 15,
    currentCost: 10_000,
    incomingQty: 20,
    incomingCost: 13_000,
  });

  assert.equal(cost, 11_714);
});

test('ombor bo\'sh bo\'lsa kelgan narx olinadi', () => {
  assert.equal(
    weightedCost({ currentQty: 0, currentCost: 10_000, incomingQty: 10, incomingCost: 13_000 }),
    13_000,
  );
});

test('manfiy qoldiq nol deb hisoblanadi', () => {
  assert.equal(
    weightedCost({ currentQty: -5, currentCost: 9_000, incomingQty: 10, incomingCost: 12_000 }),
    12_000,
  );
});

test('hech narsa kelmasa tannarx o\'zgarmaydi', () => {
  assert.equal(
    weightedCost({ currentQty: 20, currentCost: 10_000, incomingQty: 0, incomingCost: 99_000 }),
    10_000,
  );
});

test('bir xil narxda kelsa tannarx o\'zgarmaydi', () => {
  assert.equal(
    weightedCost({ currentQty: 10, currentCost: 8_000, incomingQty: 30, incomingCost: 8_000 }),
    8_000,
  );
});

test('arzonroq tovar kelsa tannarx tushadi', () => {
  // 10 dona 12 000 + 10 dona 8 000 = 200 000 / 20 = 10 000
  assert.equal(
    weightedCost({ currentQty: 10, currentCost: 12_000, incomingQty: 10, incomingCost: 8_000 }),
    10_000,
  );
});

test('natija butun so\'mga yaxlitlanadi', () => {
  const cost = weightedCost({ currentQty: 3, currentCost: 1_000, incomingQty: 4, incomingCost: 2_000 });

  assert.ok(Number.isInteger(cost));
  assert.equal(cost, 1_571); // 11 000 / 7 = 1571.43
});
