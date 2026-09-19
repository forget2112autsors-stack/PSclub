import type { Prisma } from '@prisma/client';
import { calculateSession, sessionTotals, splitAmount, type Interval } from '@psklub/domain';

import { prisma, audit } from '../db.ts';
import { fail } from '../errors.ts';
import { loadTariffs } from './tariff-loader.ts';
import { notifyOwner } from '../telegram.ts';

const SESSION_WITH_DETAIL = {
  station: { include: { type: true, club: { select: { id: true, name: true } } } },
  pauses: true,
  items: { include: { product: { select: { name: true } } } },
  payments: true,
  customer: { select: { id: true, fullName: true, balance: true } },
  operator: { select: { id: true, fullName: true } },
} as const;

type SessionRow = Awaited<ReturnType<typeof prisma.session.findFirstOrThrow>> & {
  station: { id: string; number: number; typeId: string; type: { name: string }; club?: { id: string; name: string } };
  pauses: { startedAt: Date; endedAt: Date | null }[];
  items: { id: string; qty: number; unitPrice: number; amount: number; product: { name: string } }[];
  payments: { amount: number; method: string }[];
  customer: { id: string; fullName: string; balance: number } | null;
  operator?: { id: string; fullName: string } | null;
};

function pauseIntervals(pauses: { startedAt: Date; endedAt: Date | null }[], upTo: Date): Interval[] {
  return pauses.map((p) => ({ start: p.startedAt, end: p.endedAt ?? upTo }));
}

interface CalcContext {
  tariffs: Awaited<ReturnType<typeof loadTariffs>>;
  tzOffsetMinutes: number;
}

/**
 * Seansning shu daqiqadagi hisobini chiqaradi.
 *
 * Pul mantiqi @psklub/domain da — bu funksiya faqat bazadan ma'lumot yig'ib
 * beradi. Seans yopilmagan bo'lsa "hozir" vaqtigacha hisoblanadi.
 *
 * Tariflar tashqaridan beriladi: xaritada 14 ta joy bor, har biri uchun
 * qaytadan yuklansa N+1 so'rov chiqadi.
 */
export function computeSession(session: SessionRow, ctx: CalcContext, now = new Date()) {
  const end = session.endedAt ?? now;
  const { tariffs, tzOffsetMinutes: clubTzOffset } = ctx;

  const calc = calculateSession({
    start: session.startedAt,
    end,
    stationTypeId: session.station.typeId,
    gamepads: session.gamepads,
    tariffs,
    pauses: pauseIntervals(session.pauses, end),
    tzOffsetMinutes: clubTzOffset,
    packageTariffId: session.tariffId,
  });

  const totals = sessionTotals({
    gameAmount: calc.gameAmount,
    items: session.items.map((i) => ({ qty: i.qty, unitPrice: i.unitPrice })),
    discount: session.discount,
    payments: session.payments.map((p) => ({ amount: p.amount })),
    creditLimit: session.paymentMode === 'POSTPAID' ? session.creditLimit : 0,
    isGuest: session.customerId === null,
  });

  return { calc, totals };
}

async function clubSettings(clubId: string) {
  return prisma.club.findUniqueOrThrow({ where: { id: clubId } });
}

/** Klub sozlamalari va tariflarini bir marta yuklaydi. */
async function calcContext(clubId: string): Promise<CalcContext & { clubId: string }> {
  const [club, tariffs] = await Promise.all([clubSettings(clubId), loadTariffs(clubId)]);
  return { clubId, tariffs, tzOffsetMinutes: club.tzOffsetMinutes };
}

// ------------------------------------------------------------ Seans ochish --

export interface OpenInput {
  stationId: string;
  tariffId?: string | null;
  customerId?: string | null;
  paymentMode: 'PREPAID' | 'POSTPAID';
  gamepads: number;
  creditLimit?: number;
  prepaidMinutes?: number | null;
  note?: string | null;
  operatorId: string;
  shiftId: string;
  startedAt?: Date | null;
}

export async function openSession(input: OpenInput) {
  const station = await prisma.station.findUnique({
    where: { id: input.stationId },
    include: { type: true },
  });
  if (!station) fail('Joy topilmadi.');
  if (station.status === 'OUT_OF_SERVICE') fail('Joy xizmatda emas.');

  if (input.gamepads > station.gamepadCount) {
    fail(`Joyda ${station.gamepadCount} ta pult bor, ${input.gamepads} ta so'ralyapti.`);
  }

  if (input.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) fail('Mijoz topilmadi.');
    if (customer.isBlocked) fail('Mijoz qora ro\'yxatda.');
  }

  const club = await clubSettings(station.clubId);

  const session = await prisma.$transaction(async (tx) => {
    const busy = await tx.session.findFirst({
      where: { stationId: station.id, status: { in: ['ACTIVE', 'PAUSED'] } },
    });
    if (busy) fail('Bu joyda ochiq seans bor.');

    const created = await tx.session.create({
      data: {
        stationId: station.id,
        tariffId: input.tariffId ?? null,
        customerId: input.customerId ?? null,
        operatorId: input.operatorId,
        shiftId: input.shiftId,
        paymentMode: input.paymentMode,
        startedAt: input.startedAt ?? new Date(),
        creditLimit:
          input.paymentMode === 'POSTPAID'
            ? (input.creditLimit ?? club.defaultCreditLimit)
            : 0,
        prepaidMinutes: input.prepaidMinutes ?? null,
        gamepads: input.gamepads,
        note: input.note ?? null,
      },
    });
    await tx.station.update({ where: { id: station.id }, data: { status: 'BUSY' } });
    return created;
  });

  await audit({
    userId: input.operatorId,
    entity: 'Session',
    entityId: session.id,
    action: 'open',
    newValue: { station: station.number, mode: input.paymentMode, gamepads: input.gamepads },
  });
  return session;
}

// ------------------------------------------------------------------ Pauza ---

export async function pauseSession(sessionId: string, userId: string, reason?: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) fail('Seans topilmadi.');
  if (session.status !== 'ACTIVE') fail('Faqat ishlayotgan seansni to\'xtatish mumkin.');

  await prisma.$transaction([
    prisma.sessionPause.create({
      data: { sessionId, startedAt: new Date(), reason: reason ?? null },
    }),
    prisma.session.update({ where: { id: sessionId }, data: { status: 'PAUSED' } }),
  ]);

  await audit({ userId, entity: 'Session', entityId: sessionId, action: 'pause', newValue: { reason } });
}

export async function resumeSession(sessionId: string, userId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) fail('Seans topilmadi.');
  if (session.status !== 'PAUSED') fail('Seans to\'xtatilmagan.');

  const open = await prisma.sessionPause.findFirst({
    where: { sessionId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (!open) fail('Ochiq pauza topilmadi.');

  await prisma.$transaction([
    prisma.sessionPause.update({ where: { id: open.id }, data: { endedAt: new Date() } }),
    prisma.session.update({ where: { id: sessionId }, data: { status: 'ACTIVE' } }),
  ]);

  await audit({ userId, entity: 'Session', entityId: sessionId, action: 'resume' });
}

// --------------------------------------------------------- Joyni almashtirish

export async function moveSession(sessionId: string, toStationId: string, userId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) fail('Seans topilmadi.');
  if (session.status !== 'ACTIVE' && session.status !== 'PAUSED') fail('Seans yopilgan.');
  if (session.stationId === toStationId) fail('Seans allaqachon shu joyda.');

  const target = await prisma.station.findUnique({ where: { id: toStationId } });
  if (!target) fail('Yangi joy topilmadi.');
  if (target.status === 'OUT_OF_SERVICE') fail('Yangi joy xizmatda emas.');

  const busy = await prisma.session.findFirst({
    where: { stationId: toStationId, status: { in: ['ACTIVE', 'PAUSED'] } },
  });
  if (busy) fail('Yangi joyda ochiq seans bor.');

  const from = session.stationId;
  await prisma.$transaction([
    prisma.session.update({ where: { id: sessionId }, data: { stationId: toStationId } }),
    prisma.station.update({ where: { id: from }, data: { status: 'FREE' } }),
    prisma.station.update({ where: { id: toStationId }, data: { status: 'BUSY' } }),
  ]);

  await audit({
    userId,
    entity: 'Session',
    entityId: sessionId,
    action: 'move',
    oldValue: { stationId: from },
    newValue: { stationId: toStationId },
  });
}

// ------------------------------------------------------------------ Bufet ---

export async function addItem(
  sessionId: string | null,
  productId: string,
  qty: number,
  ctx: { userId: string; shiftId: string },
) {
  if (qty <= 0) fail('Miqdor noldan katta bo\'lishi kerak.');

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.isActive) fail('Mahsulot topilmadi.');
  if (product.stockQty < qty) {
    fail(`Omborda yetarli emas: ${product.stockQty} ta qolgan.`);
  }

  if (sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: SESSION_WITH_DETAIL,
    });
    if (!session) fail('Seans topilmadi.');
    if (session.status !== 'ACTIVE' && session.status !== 'PAUSED') fail('Seans yopilgan.');

    const ctx = await calcContext(session.station.clubId);
    const { totals } = computeSession(session as SessionRow, ctx);
    if (!totals.canAddService) {
      void notifyOwner(
        [
          '⚠ <b>Ishonch limiti oshdi</b>',
          `${session.station.number}-joy`,
          `Qarz ${totals.debt.toLocaleString('uz-UZ')} so'm, limit ${session.creditLimit.toLocaleString('uz-UZ')} so'm`,
        ].join('\n'),
      );
      fail(totals.addBlockReason ?? 'Yangi xizmat qo\'shib bo\'lmaydi.');
    }
  }

  const amount = qty * product.salePrice;

  await prisma.$transaction([
    prisma.orderItem.create({
      data: {
        sessionId,
        shiftId: ctx.shiftId,
        productId,
        qty,
        unitPrice: product.salePrice,
        amount,
        createdBy: ctx.userId,
      },
    }),
    prisma.product.update({ where: { id: productId }, data: { stockQty: { decrement: qty } } }),
    prisma.stockMovement.create({
      data: { productId, type: 'SALE', qty: -qty, createdBy: ctx.userId },
    }),
  ]);

  await audit({
    userId: ctx.userId,
    entity: 'OrderItem',
    entityId: sessionId,
    action: 'add-item',
    newValue: { product: product.name, qty, amount },
  });
}

export async function removeItem(itemId: string, userId: string) {
  const item = await prisma.orderItem.findUnique({ where: { id: itemId } });
  if (!item) fail('Pozitsiya topilmadi.');

  await prisma.$transaction([
    prisma.orderItem.delete({ where: { id: itemId } }),
    prisma.product.update({ where: { id: item.productId }, data: { stockQty: { increment: item.qty } } }),
    prisma.stockMovement.create({
      data: { productId: item.productId, type: 'IN', qty: item.qty, note: 'Bekor qilindi', createdBy: userId },
    }),
  ]);

  await audit({
    userId,
    entity: 'OrderItem',
    entityId: itemId,
    action: 'remove-item',
    oldValue: item,
    isCritical: true,
  });
}

// ----------------------------------------------------------------- To'lov ---

export interface PaymentInput {
  method: 'CASH' | 'CARD' | 'BALANCE' | 'PACKAGE' | 'ONLINE';
  amount: number;
}

async function recordPaymentsTx(
  tx: Prisma.TransactionClient,
  sessionId: string | null,
  payments: PaymentInput[],
  ctx: { userId: string; shiftId: string; customerId: string | null; note?: string },
) {
  for (const payment of payments) {
    if (payment.amount <= 0) continue;

    if (payment.method === 'BALANCE') {
      if (!ctx.customerId) fail('Balansdan to\'lash uchun mijoz tanlanishi kerak.');
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: ctx.customerId } });
      if (customer.balance < payment.amount) {
        fail(`Balansda yetarli emas: ${customer.balance.toLocaleString('uz-UZ')} so'm.`);
      }
      const after = customer.balance - payment.amount;
      await tx.customer.update({ where: { id: customer.id }, data: { balance: after } });
      await tx.customerBalanceTx.create({
        data: {
          customerId: customer.id,
          amount: -payment.amount,
          balanceAfter: after,
          reason: ctx.note ?? 'Seans to\'lovi',
          createdBy: ctx.userId,
        },
      });
    }

    await tx.payment.create({
      data: {
        shiftId: ctx.shiftId,
        sessionId,
        customerId: ctx.customerId,
        operatorId: ctx.userId,
        method: payment.method,
        amount: payment.amount,
        note: ctx.note ?? null,
      },
    });
  }
}

async function recordPayments(
  sessionId: string,
  payments: PaymentInput[],
  ctx: { userId: string; shiftId: string; customerId: string | null },
) {
  return prisma.$transaction((tx) => recordPaymentsTx(tx, sessionId, payments, ctx));
}

export async function paySession(
  sessionId: string,
  payments: PaymentInput[],
  ctx: { userId: string; shiftId: string },
) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) fail('Seans topilmadi.');
  if (session.status === 'CANCELLED') fail('Seans bekor qilingan.');

  await recordPayments(sessionId, payments, { ...ctx, customerId: session.customerId });
  await audit({ userId: ctx.userId, entity: 'Session', entityId: sessionId, action: 'pay', newValue: payments });
}

// ----------------------------------------------------------- Seansni yopish --

export interface CloseInput {
  sessionId: string;
  payments: PaymentInput[];
  discount?: number;
  gamepadsReturned?: number | null;
  userId: string;
  shiftId: string;
}

export async function closeSession(input: CloseInput) {
  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    include: SESSION_WITH_DETAIL,
  });
  if (!session) fail('Seans topilmadi.');
  if (session.status === 'CLOSED') fail('Seans allaqachon yopilgan.');
  if (session.status === 'CANCELLED') fail('Seans bekor qilingan.');

  const ctx = await calcContext(session.station.clubId);
  const endedAt = new Date();
  const discount = input.discount !== undefined && input.discount >= 0 ? input.discount : session.discount;

  // Balansdan to'lov bo'lsa oldindan mijoz borligi va balansi yetishini tekshiramiz
  const balancePayments = input.payments.filter((p) => p.method === 'BALANCE' && p.amount > 0);
  const totalBalanceRequired = balancePayments.reduce((s, p) => s + p.amount, 0);
  if (totalBalanceRequired > 0) {
    if (!session.customerId) fail('Balansdan to\'lash uchun mijoz tanlanishi kerak.');
    const customer = await prisma.customer.findUnique({ where: { id: session.customerId } });
    if (!customer) fail('Mijoz topilmadi.');
    if (customer.balance < totalBalanceRequired) {
      fail(`Balansda yetarli emas: ${customer.balance.toLocaleString('uz-UZ')} so'm.`);
    }
  }

  // To'lov va chegirmalarni kiritishdan oldin hisob-kitobni tekshiramiz (yopish mumkinmi?)
  const simulatedPayments = [...session.payments, ...input.payments];
  const { calc, totals } = computeSession(
    {
      ...(session as SessionRow),
      discount,
      payments: simulatedPayments,
      endedAt,
    },
    ctx,
    endedAt,
  );

  if (!totals.canClose) fail(totals.closeBlockReason ?? 'Seansni yopib bo\'lmaydi.');

  // Barcha o'zgarishlar bitta atomik tranzaksiyada yoziladi
  await prisma.$transaction(async (tx) => {
    // 1. Chegirma o'zgargan bo'lsa yangilaymiz
    if (discount !== session.discount) {
      await tx.session.update({
        where: { id: session.id },
        data: { discount },
      });
    }

    // 2. Yangi to'lovlarni yozamiz (agar BALANCE bo'lsa balans shu yerda xavfsiz yechiladi)
    await recordPaymentsTx(tx, session.id, input.payments, {
      userId: input.userId,
      shiftId: input.shiftId,
      customerId: session.customerId,
      note: 'Seans yopilishi',
    });

    // 3. Ochiq qolgan pauzalarni yopamiz
    await tx.sessionPause.updateMany({
      where: { sessionId: session.id, endedAt: null },
      data: { endedAt },
    });

    // 4. Segmentlarni yozamiz
    await tx.sessionSegment.deleteMany({ where: { sessionId: session.id } });
    for (const segment of calc.segments) {
      await tx.sessionSegment.create({
        data: {
          sessionId: session.id,
          tariffId: segment.tariffId || null,
          tariffName: segment.tariffName,
          startedAt: segment.start,
          endedAt: segment.end,
          rawMinutes: Math.round(segment.rawMinutes),
          billedMinutes: segment.billedMinutes,
          amount: segment.amount,
        },
      });
    }

    // 5. Seans holatini yopamiz
    await tx.session.update({
      where: { id: session.id },
      data: {
        status: 'CLOSED',
        endedAt,
        gameAmount: totals.gameAmount,
        itemsAmount: totals.itemsAmount,
        discount: totals.discount,
        totalAmount: totals.totalAmount,
        gamepadsReturned: input.gamepadsReturned ?? null,
      },
    });

    // 6. Joyni bo'shatamiz
    await tx.station.update({ where: { id: session.stationId }, data: { status: 'FREE' } });

    // 7. Qarz mijoz kartasiga yoziladi — TZ BQ-3.
    if (totals.debt > 0 && session.customerId) {
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: session.customerId } });
      const after = customer.balance - totals.debt;
      await tx.customer.update({ where: { id: customer.id }, data: { balance: after } });
      await tx.customerBalanceTx.create({
        data: {
          customerId: customer.id,
          amount: -totals.debt,
          balanceAfter: after,
          reason: 'Yopilgan seans qarzi',
          createdBy: input.userId,
        },
      });
    }

    // 8. Bonus cashback (TZ M5.2) — seans summasidan 3% bonus yoziladi
    if (totals.totalAmount > 0 && session.customerId) {
      const bonusEarned = Math.floor(totals.totalAmount * 0.03);
      if (bonusEarned > 0) {
        await tx.customer.update({
          where: { id: session.customerId },
          data: { bonusPoints: { increment: bonusEarned } },
        });
      }
    }
  });

  const pultFarq =
    input.gamepadsReturned !== null && input.gamepadsReturned !== undefined
      ? session.gamepads - input.gamepadsReturned
      : 0;

  await audit({
    userId: input.userId,
    entity: 'Session',
    entityId: session.id,
    action: 'close',
    newValue: { total: totals.totalAmount, debt: totals.debt, pultFarq },
  });

  return { totals, segments: calc.segments, warnings: calc.warnings, pultFarq };
}

// ----------------------------------------------------------- Tez kassa sotuv --

export interface QuickSaleInput {
  clubId: string;
  userId: string;
  shiftId: string;
  customerId?: string | null;
  items: { productId: string; qty: number }[];
  payments: PaymentInput[];
}

export async function quickSale(input: QuickSaleInput) {
  if (input.items.length === 0) fail('Savatda mahsulot yo\'q.');

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, clubId: input.clubId, isActive: true },
  });
  if (products.length !== productIds.length) {
    fail('Mahsulotlardan biri topilmadi yoki faol emas.');
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  let totalAmount = 0;
  for (const item of input.items) {
    if (item.qty <= 0) fail('Mahsulot soni noldan katta bo\'lishi kerak.');
    const prod = productMap.get(item.productId)!;
    if (prod.stockQty < item.qty) {
      fail(`"${prod.name}" uchun omborda yetarli emas: ${prod.stockQty} dona qolgan.`);
    }
    totalAmount += prod.salePrice * item.qty;
  }

  const validPayments = input.payments.filter((p) => p.amount > 0);
  const totalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
  if (totalPaid < totalAmount) {
    fail(
      `To'lov yetarli emas: jami summa ${totalAmount.toLocaleString('uz-UZ')} so'm, kiritildi ${totalPaid.toLocaleString('uz-UZ')} so'm.`,
    );
  }

  const balancePaid = validPayments
    .filter((p) => p.method === 'BALANCE')
    .reduce((sum, p) => sum + p.amount, 0);
  if (balancePaid > 0) {
    if (!input.customerId) fail('Balansdan to\'lash uchun mijoz tanlanishi shart.');
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) fail('Mijoz topilmadi.');
    if (customer.balance < balancePaid) {
      fail(`Balansda yetarli emas: ${customer.balance.toLocaleString('uz-UZ')} so'm.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    // 1. Ombordan qoldiqni kamaytirish va orderItem larni yaratish
    for (const item of input.items) {
      const prod = productMap.get(item.productId)!;
      const amount = prod.salePrice * item.qty;

      await tx.product.update({
        where: { id: item.productId },
        data: { stockQty: { decrement: item.qty } },
      });

      await tx.orderItem.create({
        data: {
          sessionId: null,
          shiftId: input.shiftId,
          productId: item.productId,
          qty: item.qty,
          unitPrice: prod.salePrice,
          amount,
          createdBy: input.userId,
        },
      });

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'SALE',
          qty: -item.qty,
          createdBy: input.userId,
          note: 'Tez kassa',
        },
      });
    }

    // 2. To'lovlarni yozish
    await recordPaymentsTx(tx, null, validPayments, {
      userId: input.userId,
      shiftId: input.shiftId,
      customerId: input.customerId ?? null,
      note: 'Tez kassa',
    });

    // 3. Bonus cashback (TZ M5.2) — tez kassa summasidan 3% bonus yoziladi
    if (input.customerId && totalAmount > 0) {
      const bonusEarned = Math.floor(totalAmount * 0.03);
      if (bonusEarned > 0) {
        await tx.customer.update({
          where: { id: input.customerId },
          data: { bonusPoints: { increment: bonusEarned } },
        });
      }
    }
  });

  await audit({
    userId: input.userId,
    entity: 'OrderItem',
    entityId: null,
    action: 'quick-sale',
    newValue: { totalAmount, totalPaid, itemsCount: input.items.length },
  });

  return { ok: true, totalAmount, totalPaid };
}

/**
 * Hisobni bir necha kishiga bo'lish — TZ M1.3.
 *
 * Seans bo'linmaydi, faqat to'lov bo'linadi: o'yin va bufet summasi qo'shilib,
 * berilgan ulushlarga taqsimlanadi. Yaxlitlashdan qolgan tiyin birinchi
 * ulushga qo'shiladi, shunda yig'indi hamisha jami summaga teng chiqadi.
 */
export async function splitSession(sessionId: string, shares: number) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: SESSION_WITH_DETAIL,
  });
  if (!session) fail('Seans topilmadi.');
  if (session.status === 'CLOSED' || session.status === 'CANCELLED') fail('Seans yopilgan.');

  const ctx = await calcContext(session.station.clubId);
  const { totals } = computeSession(session as SessionRow, ctx);
  const qoldiq = totals.totalAmount - totals.paidAmount;

  return {
    totalAmount: totals.totalAmount,
    paidAmount: totals.paidAmount,
    remaining: qoldiq,
    shares: splitAmount(Math.max(0, qoldiq), shares),
  };
}

export async function cancelSession(sessionId: string, reason: string, userId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      items: true,
      payments: true,
      customer: true,
      station: true,
    },
  });
  if (!session) fail('Seans topilmadi.');
  if (session.status === 'CLOSED') fail('Yopilgan seansni bekor qilib bo\'lmaydi.');
  if (session.status === 'CANCELLED') fail('Seans allaqachon bekor qilingan.');
  if (!reason.trim()) fail('Bekor qilish sababi kerak.');

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // 1. Bufet mahsulotlarini omborga qaytarish
    for (const item of session.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQty: { increment: item.qty } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'IN',
          qty: item.qty,
          note: `Seans bekor qilindi (${session.station.number}-joy): omborga qaytarildi`,
          createdBy: userId,
        },
      });
    }

    // 2. Qilingan to'lovlarni qaytarish
    for (const p of session.payments) {
      if (p.amount <= 0) continue;

      if (p.method === 'BALANCE' && session.customerId) {
        const customer = await tx.customer.findUniqueOrThrow({ where: { id: session.customerId } });
        const after = customer.balance + p.amount;
        await tx.customer.update({
          where: { id: session.customerId },
          data: { balance: after },
        });
        await tx.customerBalanceTx.create({
          data: {
            customerId: session.customerId,
            amount: p.amount,
            balanceAfter: after,
            reason: `Bekor qilingan seans to'lovi qaytarildi (${session.station.number}-joy)`,
            createdBy: userId,
          },
        });
      }

      await tx.payment.create({
        data: {
          shiftId: session.shiftId,
          sessionId: session.id,
          customerId: session.customerId,
          operatorId: userId,
          method: p.method,
          amount: -p.amount,
          note: 'Seans bekor qilindi: to\'lov qaytarildi',
        },
      });
    }

    // 3. Ochiq pauzalarni yopish
    await tx.sessionPause.updateMany({
      where: { sessionId, endedAt: null },
      data: { endedAt: now },
    });

    // 4. Seansni bekor qilingan deb belgilash
    await tx.session.update({
      where: { id: sessionId },
      data: {
        status: 'CANCELLED',
        endedAt: now,
        cancelReason: reason,
        gameAmount: 0,
        itemsAmount: 0,
        discount: 0,
        totalAmount: 0,
      },
    });

    // 5. Joyni bo'shatish
    await tx.station.update({
      where: { id: session.stationId },
      data: { status: 'FREE' },
    });
  });

  await audit({
    userId,
    entity: 'Session',
    entityId: sessionId,
    action: 'cancel',
    oldValue: session,
    newValue: { reason },
    isCritical: true,
  });

  const [station, user] = await Promise.all([
    prisma.station.findUnique({ where: { id: session.stationId }, select: { number: true } }),
    prisma.appUser.findUnique({ where: { id: userId }, select: { fullName: true } }),
  ]);
  void notifyOwner(
    [
      '⚠ <b>Seans bekor qilindi</b>',
      `${station?.number}-joy · ${user?.fullName ?? ''}`,
      `Sabab: ${reason}`,
    ].join('\n'),
  );
}

export async function restoreSession(sessionId: string, userId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      items: { include: { product: true } },
      payments: true,
      customer: true,
      station: true,
    },
  });
  if (!session) fail('Seans topilmadi.');
  if (session.status !== 'CANCELLED') fail('Faqat bekor qilingan seansni tiklash mumkin.');

  await prisma.$transaction(async (tx) => {
    // Joy bo'shligini tekshirish
    const station = await tx.station.findUniqueOrThrow({ where: { id: session.stationId } });
    if (station.status !== 'FREE') {
      fail(`${station.number}-joy hozir bo'sh emas, seansni tiklab bo'lmaydi.`);
    }

    // Mahsulotlar uchun ombor qoldig'ini tekshirish va qayta yechish
    for (const item of session.items) {
      const prod = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
      if (prod.stockQty < item.qty) {
        fail(`"${prod.name}" uchun omborda yetarli emas: ${prod.stockQty} dona qolgan.`);
      }
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQty: { decrement: item.qty } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'SALE',
          qty: -item.qty,
          note: `Seans qayta tiklandi (${station.number}-joy)`,
          createdBy: userId,
        },
      });
    }

    // Bekor qilishda qaytarilgan to'lovlarni qayta yozish
    const refunds = session.payments.filter((p) => p.amount < 0);
    for (const ref of refunds) {
      const positiveAmount = Math.abs(ref.amount);

      if (ref.method === 'BALANCE' && session.customerId) {
        const customer = await tx.customer.findUniqueOrThrow({ where: { id: session.customerId } });
        if (customer.balance < positiveAmount) {
          fail(`Mijoz balansida yetarli emas: ${customer.balance.toLocaleString('uz-UZ')} so'm.`);
        }
        const after = customer.balance - positiveAmount;
        await tx.customer.update({
          where: { id: session.customerId },
          data: { balance: after },
        });
        await tx.customerBalanceTx.create({
          data: {
            customerId: session.customerId,
            amount: -positiveAmount,
            balanceAfter: after,
            reason: `Bekor qilingan seans qayta tiklandi (${station.number}-joy)`,
            createdBy: userId,
          },
        });
      }

      await tx.payment.create({
        data: {
          shiftId: session.shiftId,
          sessionId: session.id,
          customerId: session.customerId,
          operatorId: userId,
          method: ref.method,
          amount: positiveAmount,
          note: 'Seans qayta tiklandi: to\'lov qaytarildi',
        },
      });
    }

    // Seansni qayta ACTIVE qilish
    await tx.session.update({
      where: { id: sessionId },
      data: {
        status: 'ACTIVE',
        endedAt: null,
        cancelReason: null,
      },
    });

    // Joyni band qilish
    await tx.station.update({
      where: { id: session.stationId },
      data: { status: 'BUSY' },
    });
  });

  await audit({
    userId,
    entity: 'Session',
    entityId: sessionId,
    action: 'restore',
    oldValue: { status: 'CANCELLED' },
    newValue: { status: 'ACTIVE' },
    isCritical: true,
  });

  void notifyOwner(
    [
      '🟢 <b>Bekor qilingan seans qayta tiklandi</b>',
      `${session.station.number}-joy`,
    ].join('\n'),
  );
}

// -------------------------------------------------------- Xarita va detal ---

/** Joylar xaritasi uchun — har bir joy va undagi ochiq seans holati. */
export async function listStations(clubId: string) {
  const ctx = await calcContext(clubId);
  const stations = await prisma.station.findMany({
    where: { clubId },
    include: { type: true },
    orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
  });

  const open = await prisma.session.findMany({
    where: { station: { clubId }, status: { in: ['ACTIVE', 'PAUSED'] } },
    include: SESSION_WITH_DETAIL,
  });

  const byStation = new Map<string, (typeof open)[number]>();
  for (const session of open) byStation.set(session.stationId, session);

  const now = new Date();
  return stations.map((station) => {
    const session = byStation.get(station.id);
    const base = {
      id: station.id,
      number: station.number,
      type: station.type.name,
      status: station.status,
      note: station.note,
      gamepadCount: station.gamepadCount,
    };
    if (!session) return { ...base, session: null };

    const { calc, totals } = computeSession(session as SessionRow, ctx, now);
    return {
      ...base,
      session: {
        id: session.id,
        startedAt: session.startedAt,
        paused: session.status === 'PAUSED',
        gamepads: session.gamepads,
        customer: session.customer?.fullName ?? null,
        tariffName: calc.segments.at(-1)?.tariffName ?? null,
        // Taymer brauzerda shu qiymatdan davom etadi — summa esa serverdan.
        activeMinutes: Math.round(calc.activeMinutes),
        prepaidMinutes: session.prepaidMinutes,
        paymentMode: session.paymentMode,
        totalAmount: totals.totalAmount,
        debt: totals.debt,
        creditExceeded: totals.creditExceeded,
      },
    };
  });
}

export async function sessionDetail(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: SESSION_WITH_DETAIL,
  });
  if (!session) fail('Seans topilmadi.');

  const ctx = await calcContext(session.station.clubId);
  const { calc, totals } = computeSession(session as SessionRow, ctx);

  return {
    id: session.id,
    status: session.status,
    cancelReason: session.cancelReason,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    station: { id: session.station.id, number: session.station.number, type: session.station.type.name },
    club: session.station.club ? { id: session.station.club.id, name: session.station.club.name } : null,
    operator: session.operator ? { id: session.operator.id, fullName: session.operator.fullName } : null,
    customer: session.customer,
    gamepads: session.gamepads,
    paymentMode: session.paymentMode,
    creditLimit: session.creditLimit,
    items: session.items.map((i) => ({
      id: i.id,
      name: i.product.name,
      qty: i.qty,
      unitPrice: i.unitPrice,
      amount: i.amount,
    })),
    payments: session.payments,
    segments: calc.segments,
    totals,
    warnings: calc.warnings,
  };
}
