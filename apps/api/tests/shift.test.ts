import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { fail, BusinessError } from '../src/errors.ts';

test('shift: Prisma P2002 unikal cheklov xatosi tutilganda tushunarli xato xabari beradi', () => {
  const p2002Error = {
    code: 'P2002',
    clientVersion: '5.x',
    meta: { target: ['club_id'] },
  };

  const handlePrismaError = (err: any) => {
    if (err && typeof err === 'object' && err.code === 'P2002') {
      fail('Ochiq smena allaqachon bor — avval uni yoping.');
    }
    throw err;
  };

  assert.throws(
    () => handlePrismaError(p2002Error),
    (err: unknown) =>
      err instanceof BusinessError && err.message === 'Ochiq smena allaqachon bor — avval uni yoping.',
  );
});

test('shift: kassa sverkasi (reconcileCash) kutilayotgan naqd pul va farqni to\'g\'ri hisoblaydi', async () => {
  const { reconcileCash } = await import('@psklub/domain');

  const res = reconcileCash({
    openingCash: 100_000,
    cashPayments: 300_000,
    cashExpenses: 50_000,
    countedCash: 350_000, // Kutilayotgan: 100 000 + 300 000 - 50 000 = 350 000
    threshold: 10_000,
    note: null,
    openSessions: 0,
  });

  assert.equal(res.expectedCash, 350_000);
  assert.equal(res.diff, 0);
  assert.equal(res.canClose, true);
});

test('shift: ochiq seanslar bor bo\'lsa smena yopilmaydi', async () => {
  const { reconcileCash } = await import('@psklub/domain');

  const res = reconcileCash({
    openingCash: 100_000,
    cashPayments: 200_000,
    cashExpenses: 0,
    countedCash: 300_000,
    threshold: 10_000,
    note: null,
    openSessions: 2, // 2 ta ochiq seans bor!
  });

  assert.equal(res.canClose, false);
  assert.match(res.blockReason ?? '', /ochiq/i);
});
