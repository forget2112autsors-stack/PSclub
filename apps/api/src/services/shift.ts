import { reconcileCash } from '@psklub/domain';

import { prisma, audit } from '../db.ts';
import { fail } from '../errors.ts';
import { notifyOwner } from '../telegram.ts';

const summa = (v: number) => v.toLocaleString('uz-UZ');

export async function currentShift(clubId: string) {
  return prisma.shift.findFirst({ where: { clubId, status: 'OPEN' } });
}

export async function openShift(clubId: string, operatorId: string, openingCash: number) {
  const shift = await prisma.$transaction(async (tx) => {
    const existing = await tx.shift.findFirst({ where: { clubId, status: 'OPEN' } });
    if (existing) fail('Ochiq smena allaqachon bor — avval uni yoping.');

    return tx.shift.create({
      data: { clubId, operatorId, openingCash },
    });
  });
  await audit({
    userId: operatorId,
    entity: 'Shift',
    entityId: shift.id,
    action: 'open',
    newValue: { openingCash },
  });

  const operator = await prisma.appUser.findUnique({ where: { id: operatorId } });
  void notifyOwner(
    ['🟢 <b>Smena ochildi</b>', operator?.fullName ?? '', `Kassada: ${summa(openingCash)} so'm`]
      .filter(Boolean)
      .join('\n'),
  );
  return shift;
}

/** Smenaning joriy holati — kassada qancha bo'lishi kerakligi bilan. */
export async function shiftSummary(shiftId: string) {
  const shift = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });

  const [payments, expenses, openSessions, sessions, gamepadRows] = await Promise.all([
    prisma.payment.groupBy({
      by: ['method'],
      where: { shiftId },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({ where: { shiftId }, _sum: { amount: true } }),
    prisma.session.count({ where: { shiftId, status: { in: ['ACTIVE', 'PAUSED'] } } }),
    prisma.session.count({ where: { shiftId } }),
    // Pult sverkasi — TZ M1.4. Pult klubdagi eng ko'p yo'qotish manbai.
    //
    // Seans qaysi smenada YOPILGANIGA qarab olinadi, ochilganiga emas: pult
    // yopilganda qaytariladi, ya'ni javobgarlik o'sha smenada. Tungi seans
    // ertalabki smenada yopilsa, sverka ham o'sha yerda chiqishi kerak.
    prisma.session.findMany({
      where: {
        status: 'CLOSED',
        station: { clubId: shift.clubId },
        endedAt: { gte: shift.openedAt, ...(shift.closedAt ? { lte: shift.closedAt } : {}) },
      },
      select: {
        gamepads: true,
        gamepadsReturned: true,
        station: { select: { number: true } },
      },
    }),
  ]);

  const gamepadIssues = gamepadRows
    .filter((s) => s.gamepadsReturned !== null && s.gamepadsReturned < s.gamepads)
    .map((s) => ({
      station: s.station.number,
      issued: s.gamepads,
      returned: s.gamepadsReturned ?? 0,
      missing: s.gamepads - (s.gamepadsReturned ?? 0),
    }));

  const gamepadsUnchecked = gamepadRows.filter((s) => s.gamepadsReturned === null).length;
  const gamepadsMissing = gamepadIssues.reduce((sum, x) => sum + x.missing, 0);

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
    gamepadsMissing,
    gamepadsUnchecked,
    gamepadIssues,
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
    newValue: {
      expected: result.expectedCash,
      counted: input.countedCash,
      diff: result.diff,
      gamepadsMissing: summary.gamepadsMissing,
    },
    isCritical: result.notifyOwner || summary.gamepadsMissing > 0,
  });

  const operator = await prisma.appUser.findUnique({ where: { id: input.userId } });
  const ogoh: string[] = [];
  if (result.notifyOwner) ogoh.push(`⚠ Kassa farqi chegaradan oshdi: ${summa(result.diff)} so'm`);
  else if (result.diff !== 0) ogoh.push(`Kassa farqi: ${summa(result.diff)} so'm`);
  if (summary.gamepadsMissing > 0) ogoh.push(`⚠ ${summary.gamepadsMissing} ta pult qaytmadi`);

  void notifyOwner(
    [
      `🔴 <b>Smena yopildi</b>`,
      operator?.fullName ?? '',
      `Naqd tushum: ${summa(summary.cashPayments)} so'm`,
      `Sanoq: ${summa(input.countedCash)} so'm`,
      ...ogoh,
      input.note ? `Izoh: ${input.note}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return {
    shift: closed,
    ...result,
    byMethod: summary.byMethod,
    gamepadsMissing: summary.gamepadsMissing,
    gamepadIssues: summary.gamepadIssues,
  };
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
