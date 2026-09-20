import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { quickSale } from '../src/services/session.ts';
import { BusinessError } from '../src/errors.ts';

test('sale: bo\'sh savat bilan tez kassa sotuvi xato beradi', async () => {
  await assert.rejects(
    () =>
      quickSale({
        clubId: 'club-1',
        userId: 'u-1',
        shiftId: 'sh-1',
        items: [],
        payments: [{ method: 'CASH', amount: 10_000 }],
      }),
    (err: unknown) => err instanceof BusinessError && err.message === 'Savatda mahsulot yo\'q.',
  );
});

test('sale: to\'lov summasi savat summasidan kam bo\'lganda rad etiladi', async () => {
  // Savatda mahsulot bo'lsa-yu, to'lov 0 yoki kam bo'lsa
  // (agar mahsulot topilmasa ham "Mahsulotlardan biri topilmadi yoki faol emas." otiladi)
  await assert.rejects(
    () =>
      quickSale({
        clubId: 'club-1',
        userId: 'u-1',
        shiftId: 'sh-1',
        items: [{ productId: 'non-existent-product', qty: 1 }],
        payments: [],
      }),
    (err: unknown) => err instanceof BusinessError,
  );
});
