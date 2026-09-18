import { reconcileCash } from '@psklub/domain';

import { prisma, audit } from '../db.ts';
import { fail } from '../errors.ts';

export async function currentShift(clubId: string) {
  return prisma.shift.findFirst({ where: { clubId, status: 'OPEN' } });
}

export async function openShift(clubId: string, operatorId: string, openingCash: number) {
  const existing = await currentShift(clubId);
  if (existing) fail('Ochiq smena allaqachon bor — avval uni yoping.');

  const shift = await prisma.shift.create({
    data: { clubId, operatorId, openingCash },
  });
  await audit({
    userId: operatorId,
    entity: 'Shift',
    entityId: shift.id,
    action: 'open',
    newValue: { openingCash },
  });
  return shift;
}

/** Smenaning joriy holati — kassada qancha bo'lishi kerakligi bilan. */
export async function shiftSummary(shiftId: string) {
  const shift = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });

  const [payments, expenses, openSessions, sessions] = await Promise.all([
    prisma.payment.groupBy({
      by: ['method'],
      where: { shiftId },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({ where: { shiftId }, _sum: { amount: true } }),
    prisma.session.count({ where: { shiftId, status: { in: ['ACTIVE', 'PAUSED'] } } }),
    prisma.session.count({ where: { shiftId } }),
  ]);

  const byMethod = Object.fromEntries(payments.map((p) => [p.method, p._sum.amount ?? 0]));
  const cashPayments = byMethod.CASH ?? 0;
  const cashExpenses = expenses._sum.amount ?? 0;

  return {
    shift,
    byMethod,
    cashPayments,
    cashExpenses,
    openSessions,
    sessions,
    expectedCash: shift.openingCash + cashPayments - cashExpenses,
  };
}

export interface CloseShiftInput {
  shiftId: string;
  countedCash: number;
  note?: string | null;
  userId: string;
}

export async function closeShift(input: CloseShiftInput) {
  const summary = await shiftSummary(input.shiftId);
  if (summary.shift.status !== 'OPEN') fail('Smena allaqachon yopilgan.');

  const club = await prisma.club.findUniqueOrThrow({ where: { id: summary.shift.clubId } });

  const result = reconcileCash({
    openingCash: summary.shift.openingCash,
    cashPayments: summary.cashPayments,
    cashExpenses: summary.cashExpenses,
    countedCash: input.countedCash,
    threshold: club.cashDiffThreshold,
    note: input.note,
    openSessions: summary.openSessions,
  });

  if (!result.canClose) fail(result.blockReason ?? 'Smenani yopib bo\'lmaydi.');

  const closed = await prisma.shift.update({
    where: { id: input.shiftId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      expectedCash: result.expectedCash,
      countedCash: input.countedCash,
      cashDiff: result.diff,
      note: input.note ?? null,
    },
  });

  await audit({
    userId: input.userId,
    entity: 'Shift',
    entityId: input.shiftId,
    action: 'close',
    newValue: { expected: result.expectedCash, counted: input.countedCash, diff: result.diff },
    isCritical: result.notifyOwner,
  });

  // notifyOwner — 4-bosqichda Telegram xabariga ulanadi (TZ M7.1).
  return { shift: closed, ...result, byMethod: summary.byMethod };
}

export async function addExpense(input: {
  shiftId: string;
  operatorId: string;
  category: string;
  amount: number;
  note?: string | null;
}) {
  if (input.amount <= 0) fail('Chiqim summasi noldan katta bo\'lishi kerak.');

  const expense = await prisma.expense.create({
    data: {
      shiftId: input.shiftId,
      operatorId: input.operatorId,
      category: input.category,
      amount: input.amount,
      note: input.note ?? null,
    },
  });
  await audit({
    userId: input.operatorId,
    entity: 'Expense',
    entityId: expense.id,
    action: 'create',
    newValue: input,
  });
  return expense;
}
