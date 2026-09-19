import { bookingState, isHeldByBooking } from '@psklub/domain';

import { prisma, audit } from '../db.ts';
import { fail } from '../errors.ts';

/** Telefon raqamini bir ko'rinishga keltiradi: faqat raqamlar, oxirgi 9 tasi. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) fail('Telefon raqami juda qisqa.');
  return digits.slice(-9);
}

export async function findOrCreateByPhone(
  clubId: string,
  phone: string,
  fullName: string,
  telegramId?: string,
) {
  const normalized = normalizePhone(phone);
  const existing = await prisma.customer.findFirst({
    where: { clubId, phone: normalized },
  });

  if (existing) {
    if (telegramId && existing.telegramId !== telegramId) {
      await prisma.customer.update({ where: { id: existing.id }, data: { telegramId } });
    }
    return existing;
  }

  return prisma.customer.create({
    data: { clubId, phone: normalized, fullName: fullName.trim() || 'Mijoz', telegramId },
  });
}

export async function customerSummary(customerId: string) {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    include: {
      packages: { where: { remainingMinutes: { gt: 0 } }, orderBy: { expiresAt: 'asc' } },
    },
  });

  const [sessions, spent] = await Promise.all([
    prisma.session.findMany({
      where: { customerId, status: 'CLOSED' },
      orderBy: { endedAt: 'desc' },
      take: 10,
      select: {
        endedAt: true,
        totalAmount: true,
        station: { select: { number: true, type: { select: { name: true } } } },
      },
    }),
    prisma.session.aggregate({
      where: { customerId, status: 'CLOSED' },
      _sum: { totalAmount: true },
      _count: true,
    }),
  ]);

  return {
    customer,
    packages: customer.packages,
    recentSessions: sessions,
    totalSpent: spent._sum.totalAmount ?? 0,
    sessionCount: spent._count,
  };
}

export async function topUpBalance(input: {
  customerId: string;
  amount: number;
  method: 'CASH' | 'CARD' | 'ONLINE';
  shiftId: string;
  userId: string;
}) {
  if (input.amount <= 0) fail('Summa noldan katta bo\'lishi kerak.');

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: input.customerId } });
  const after = customer.balance + input.amount;

  await prisma.$transaction([
    prisma.customer.update({ where: { id: customer.id }, data: { balance: after } }),
    prisma.customerBalanceTx.create({
      data: {
        customerId: customer.id,
        amount: input.amount,
        balanceAfter: after,
        reason: 'Balans to\'ldirish',
        createdBy: input.userId,
      },
    }),
    prisma.payment.create({
      data: {
        shiftId: input.shiftId,
        customerId: customer.id,
        operatorId: input.userId,
        method: input.method,
        amount: input.amount,
        note: 'Balans to\'ldirish',
      },
    }),
  ]);

  await audit({
    userId: input.userId,
    entity: 'Customer',
    entityId: customer.id,
    action: 'topup',
    newValue: { amount: input.amount, balanceAfter: after },
  });

  return { balance: after };
}

// ------------------------------------------------------------------ Bron ----

/** Shu daqiqada bron sababli band bo'lgan joylar (TZ BQ-5). */
export async function heldStationIds(clubId: string, now = new Date()): Promise<Set<string>> {
  const active = await prisma.booking.findMany({
    where: {
      station: { clubId },
      status: { in: ['PENDING', 'CONFIRMED'] },
      startsAt: { gte: new Date(now.getTime() - 60 * 60_000), lte: new Date(now.getTime() + 60 * 60_000) },
    },
    select: { stationId: true, startsAt: true },
  });

  return new Set(active.filter((b) => isHeldByBooking(b.startsAt, now)).map((b) => b.stationId));
}

/**
 * Kechikkan bronlarni bekor qiladi — TZ BQ-5.
 *
 * Fon jarayoni emas, so'rov paytida chaqiriladi: klubda kuniga bir necha
 * o'nlab bron bo'ladi, buning uchun alohida jadval kerak emas.
 */
export async function expireStaleBookings(clubId: string, now = new Date()): Promise<number> {
  const candidates = await prisma.booking.findMany({
    where: {
      station: { clubId },
      status: { in: ['PENDING', 'CONFIRMED'] },
      startsAt: { lt: now },
    },
    select: { id: true, startsAt: true },
  });

  const expired = candidates.filter((b) => bookingState(b.startsAt, now) === 'EXPIRED');
  if (expired.length === 0) return 0;

  await prisma.booking.updateMany({
    where: { id: { in: expired.map((b) => b.id) } },
    data: { status: 'NO_SHOW' },
  });
  return expired.length;
}

export async function createBooking(input: {
  stationId: string;
  customerId: string | null;
  startsAt: Date;
  note?: string | null;
  userId?: string;
}) {
  if (input.startsAt.getTime() < Date.now() - 60_000) fail('O\'tib ketgan vaqtga bron qilib bo\'lmaydi.');

  const station = await prisma.station.findUnique({ where: { id: input.stationId } });
  if (!station) fail('Joy topilmadi.');
  if (station.status === 'OUT_OF_SERVICE') fail('Joy xizmatda emas.');

  // Bir vaqtga ikki bron bo'lmasin — oyna kesishishini tekshiramiz.
  const yaqin = await prisma.booking.findFirst({
    where: {
      stationId: input.stationId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      startsAt: {
        gte: new Date(input.startsAt.getTime() - 60 * 60_000),
        lte: new Date(input.startsAt.getTime() + 60 * 60_000),
      },
    },
  });
  if (yaqin) fail('Bu joy shu vaqt atrofida allaqachon bron qilingan.');

  const booking = await prisma.booking.create({
    data: {
      stationId: input.stationId,
      customerId: input.customerId,
      startsAt: input.startsAt,
      note: input.note ?? null,
      status: 'CONFIRMED',
    },
    include: { station: { select: { number: true, name: true, type: { select: { name: true } } } } },
  });

  await audit({
    userId: input.userId ?? null,
    entity: 'Booking',
    entityId: booking.id,
    action: 'create',
    newValue: { station: booking.station.number, startsAt: input.startsAt },
  });

  return booking;
}

export async function cancelBooking(bookingId: string, userId?: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) fail('Bron topilmadi.');
  if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') fail('Bron allaqachon yopilgan.');

  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
  await audit({
    userId: userId ?? null,
    entity: 'Booking',
    entityId: bookingId,
    action: 'cancel',
    oldValue: booking,
  });
}

export async function updateBooking(
  bookingId: string,
  input: {
    stationId?: string;
    customerId?: string | null;
    startsAt?: Date;
    note?: string | null;
  },
  userId?: string,
) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) fail('Bron topilmadi.');

  if (input.stationId && input.startsAt) {
    const yaqin = await prisma.booking.findFirst({
      where: {
        stationId: input.stationId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        id: { not: bookingId },
        startsAt: {
          gte: new Date(input.startsAt.getTime() - 60 * 60_000),
          lte: new Date(input.startsAt.getTime() + 60 * 60_000),
        },
      },
    });
    if (yaqin) fail('Bu vaqt oralig\'ida joy allaqachon bron qilingan.');
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      ...(input.stationId !== undefined ? { stationId: input.stationId } : {}),
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
    include: {
      station: { select: { number: true, name: true, type: { select: { name: true } } } },
      customer: { select: { id: true, fullName: true, phone: true } },
    },
  });

  await audit({
    userId: userId ?? null,
    entity: 'Booking',
    entityId: bookingId,
    action: 'update',
    oldValue: booking,
    newValue: updated,
  });

  return updated;
}

// ------------------------------------------------------------- Paketlar va Bonus ---

export async function addCustomerPackage(input: {
  customerId: string;
  name: string;
  totalMinutes: number;
  tariffId?: string | null;
  daysValid?: number | null;
  amount: number;
  method: 'CASH' | 'CARD' | 'ONLINE';
  shiftId: string;
  userId: string;
}) {
  if (input.totalMinutes <= 0) fail('Daqiqalar soni noldan katta bo\'lishi kerak.');
  if (input.amount < 0) fail('Summa manfiy bo\'lishi mumkin emas.');

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: input.customerId } });
  if (customer.isBlocked) fail('Mijoz qora ro\'yxatda — paket sotib bo\'lmaydi.');

  const expiresAt =
    input.daysValid && input.daysValid > 0
      ? new Date(Date.now() + input.daysValid * 24 * 60 * 60_000)
      : null;

  const [pkg] = await prisma.$transaction(async (tx) => {
    const createdPkg = await tx.customerPackage.create({
      data: {
        customerId: customer.id,
        tariffId: input.tariffId ?? null,
        name: input.name.trim(),
        totalMinutes: input.totalMinutes,
        remainingMinutes: input.totalMinutes,
        expiresAt,
      },
    });

    if (input.amount > 0) {
      await tx.payment.create({
        data: {
          shiftId: input.shiftId,
          customerId: customer.id,
          operatorId: input.userId,
          method: input.method,
          amount: input.amount,
          note: `Abonement: ${input.name.trim()}`,
        },
      });
    }

    return [createdPkg];
  });

  await audit({
    userId: input.userId,
    entity: 'CustomerPackage',
    entityId: pkg.id,
    action: 'create',
    newValue: {
      customer: customer.fullName,
      name: input.name,
      totalMinutes: input.totalMinutes,
      amount: input.amount,
    },
  });

  return pkg;
}

export async function convertBonusToBalance(input: {
  customerId: string;
  points: number;
  userId: string;
}) {
  if (input.points <= 0) fail('Ballar soni noldan katta bo\'lishi kerak.');

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: input.customerId } });
  if (customer.isBlocked) fail('Mijoz qora ro\'yxatda.');
  if (customer.bonusPoints < input.points) {
    fail(`Bonus ballar yetarli emas: sizda ${customer.bonusPoints} ball bor.`);
  }

  const newBonus = customer.bonusPoints - input.points;
  const newBalance = customer.balance + input.points;

  await prisma.$transaction([
    prisma.customer.update({
      where: { id: customer.id },
      data: {
        bonusPoints: newBonus,
        balance: newBalance,
      },
    }),
    prisma.customerBalanceTx.create({
      data: {
        customerId: customer.id,
        amount: input.points,
        balanceAfter: newBalance,
        reason: `Bonus almashtirildi (${input.points} ball)`,
        createdBy: input.userId,
      },
    }),
  ]);

  await audit({
    userId: input.userId,
    entity: 'Customer',
    entityId: customer.id,
    action: 'bonus_convert',
    newValue: { points: input.points, balanceAfter: newBalance, remainingBonus: newBonus },
  });

  return { balance: newBalance, bonusPoints: newBonus };
}
