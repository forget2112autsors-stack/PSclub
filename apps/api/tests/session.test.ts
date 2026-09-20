import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { computeSession } from '../src/services/session.ts';
import type { Tariff } from '@psklub/domain';

const DUMMY_TARIFF: Tariff = {
  id: 'tariff-standard',
  name: 'Standart PS-5',
  kind: 'HOURLY',
  stationTypeId: 'type-ps5',
  priority: 10,
  pricePerHour: 30_000,
  minMinutes: 0,
  rounding: 'MINUTE',
  gamepadMultipliers: {},
  packagePrice: null,
  packageMinutes: null,
  windows: [
    {
      daysOfWeek: [], // bo'sh bo'lsa barcha kunlar
      startMinute: 0,
      endMinute: 24 * 60,
    },
  ],
};

const CTX = {
  tariffs: [DUMMY_TARIFF],
  tzOffsetMinutes: 300, // UTC+5
};

test('session: computeSession o\'yin summasi va umumiy summani to\'g\'ri hisoblaydi', () => {
  const start = new Date('2026-09-20T10:00:00.000Z');
  const end = new Date('2026-09-20T12:00:00.000Z'); // 2 soat

  const sessionRow = {
    id: 's-1',
    clubId: 'club-1',
    stationId: 'st-1',
    tariffId: null,
    customerId: 'cust-1',
    operatorId: 'op-1',
    shiftId: 'sh-1',
    status: 'ACTIVE' as const,
    paymentMode: 'POSTPAID' as const,
    startedAt: start,
    endedAt: end,
    creditLimit: 500_000,
    prepaidMinutes: null,
    gamepads: 2,
    gamepadsReturned: 2,
    gameAmount: 0,
    itemsAmount: 0,
    discount: 0,
    totalAmount: 0,
    note: null,
    cancelReason: null,
    createdAt: start,
    updatedAt: end,
    station: {
      id: 'st-1',
      number: 1,
      typeId: 'type-ps5',
      type: { name: 'PS-5' },
    },
    pauses: [],
    items: [
      { id: 'item-1', qty: 2, unitPrice: 15_000, amount: 30_000, product: { name: 'Coca-Cola' } },
    ],
    payments: [{ amount: 20_000, method: 'CASH' }],
    customer: { id: 'cust-1', fullName: 'Ali Valiyev', balance: 50_000 },
  };

  const { calc, totals } = computeSession(sessionRow as any, CTX, end);

  // 2 soat * 30 000 = 60 000 so'm
  assert.equal(calc.gameAmount, 60_000);
  // Bufet: 30 000 so'm
  assert.equal(totals.itemsAmount, 30_000);
  // Jami: 60 000 + 30 000 = 90 000 so'm
  assert.equal(totals.totalAmount, 90_000);
  // To'langan: 20 000 so'm, Qarz: 70 000 so'm
  assert.equal(totals.paidAmount, 20_000);
  assert.equal(totals.debt, 70_000);
  assert.equal(totals.canClose, true);
});

test('session: mehmon seansi qarz bilan yopilishiga yo\'l qo\'yilmaydi', () => {
  const start = new Date('2026-09-20T10:00:00.000Z');
  const end = new Date('2026-09-20T11:00:00.000Z'); // 1 soat (30 000 so'm)

  const guestSession = {
    id: 's-guest',
    stationId: 'st-1',
    tariffId: null,
    customerId: null, // Mehmon
    operatorId: 'op-1',
    shiftId: 'sh-1',
    status: 'ACTIVE' as const,
    paymentMode: 'POSTPAID' as const,
    startedAt: start,
    endedAt: end,
    creditLimit: 0,
    prepaidMinutes: null,
    gamepads: 2,
    gamepadsReturned: 2,
    gameAmount: 0,
    itemsAmount: 0,
    discount: 0,
    totalAmount: 0,
    note: null,
    cancelReason: null,
    createdAt: start,
    updatedAt: end,
    station: {
      id: 'st-1',
      number: 1,
      typeId: 'type-ps5',
      type: { name: 'PS-5' },
    },
    pauses: [],
    items: [],
    payments: [], // Hech qanday to'lov qilinmagan
    customer: null,
  };

  const { totals } = computeSession(guestSession as any, CTX, end);
  assert.equal(totals.totalAmount, 30_000);
  assert.equal(totals.canClose, false);
  assert.match(totals.closeBlockReason ?? '', /Mehmon/i);
});

test('session: pauza qilingan vaqt o\'yin hisobiga kirmaydi', () => {
  const start = new Date('2026-09-20T10:00:00.000Z');
  const pauseStart = new Date('2026-09-20T10:30:00.000Z');
  const pauseEnd = new Date('2026-09-20T11:00:00.000Z'); // 30 daqiqa pauza
  const end = new Date('2026-09-20T12:00:00.000Z'); // Jami 2 soat vaqt, shundan 30 daqiqasi pauza -> 1.5 soat o'yin

  const pausedSession = {
    id: 's-paused',
    stationId: 'st-1',
    tariffId: null,
    customerId: 'c-1',
    operatorId: 'op-1',
    shiftId: 'sh-1',
    status: 'ACTIVE' as const,
    paymentMode: 'POSTPAID' as const,
    startedAt: start,
    endedAt: end,
    creditLimit: 200_000,
    prepaidMinutes: null,
    gamepads: 2,
    gamepadsReturned: 2,
    gameAmount: 0,
    itemsAmount: 0,
    discount: 0,
    totalAmount: 0,
    note: null,
    cancelReason: null,
    createdAt: start,
    updatedAt: end,
    station: {
      id: 'st-1',
      number: 1,
      typeId: 'type-ps5',
      type: { name: 'PS-5' },
    },
    pauses: [{ startedAt: pauseStart, endedAt: pauseEnd }],
    items: [],
    payments: [],
    customer: { id: 'c-1', fullName: 'Vali', balance: 0 },
  };

  const { calc } = computeSession(pausedSession as any, CTX, end);
  // 90 daqiqa = 1.5 soat * 30 000 = 45 000 so'm
  assert.equal(calc.gameAmount, 45_000);
  assert.equal(calc.activeMinutes, 90);
});
