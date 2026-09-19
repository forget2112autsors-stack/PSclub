import { prisma } from '../db.ts';

/**
 * Kunlik hisobot — TZ M6.1.
 *
 * Kun chegarasi klub vaqti bo'yicha olinadi (UTC da saqlanadi, TZ M8):
 * 00:00–24:00 mahalliy vaqt. Tungi seans yarim tunni kesib o'tsa, u
 * yopilgan kunga tushadi — kassa sverkasi ham shunday ishlaydi.
 */
export async function dailyReport(clubId: string, date: string) {
  const club = await prisma.club.findUniqueOrThrow({ where: { id: clubId } });
  const offset = club.tzOffsetMinutes * 60_000;

  const from = new Date(new Date(`${date}T00:00:00.000Z`).getTime() - offset);
  const to = new Date(from.getTime() + 24 * 60 * 60_000);
  const range = { gte: from, lt: to };

  const [payments, expenses, sessions, items, shifts] = await Promise.all([
    prisma.payment.groupBy({
      by: ['method'],
      where: { createdAt: range, shift: { clubId } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.expense.groupBy({
      by: ['category'],
      where: { createdAt: range, shift: { clubId } },
      _sum: { amount: true },
    }),
    prisma.session.findMany({
      where: { endedAt: range, status: 'CLOSED', station: { clubId } },
      select: {
        gameAmount: true,
        itemsAmount: true,
        discount: true,
        totalAmount: true,
        startedAt: true,
        endedAt: true,
        station: { select: { number: true, type: { select: { name: true } } } },
      },
    }),
    prisma.orderItem.findMany({
      where: {
        createdAt: range,
        shift: { clubId },
        OR: [{ sessionId: null }, { session: { status: 'CLOSED' } }],
      },
      select: {
        qty: true,
        amount: true,
        sessionId: true,
        product: { select: { id: true, name: true, costPrice: true } },
      },
    }),
    prisma.shift.findMany({
      where: { clubId, openedAt: range },
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        openingCash: true,
        countedCash: true,
        cashDiff: true,
        note: true,
        operator: { select: { fullName: true } },
      },
    }),
  ]);

  const gameRevenue = sessions.reduce((s, x) => s + x.gameAmount, 0);
  const itemsRevenue = sessions.reduce((s, x) => s + x.itemsAmount, 0);
  const discounts = sessions.reduce((s, x) => s + x.discount, 0);
  // Tez kassa — seansga bog'lanmagan sotuv (TZ M3.2).
  const quickSales = items.filter((i) => i.sessionId === null).reduce((s, x) => s + x.amount, 0);

  const byMethod = Object.fromEntries(payments.map((p) => [p.method, p._sum.amount ?? 0]));
  const totalPaid = payments.reduce((s, p) => s + (p._sum.amount ?? 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e._sum.amount ?? 0), 0);

  // Avans — balans to'ldirish va paket sotuvi. Pul kelgan, lekin mijoz hali
  // hech narsa iste'mol qilmagan, ya'ni bu daromad emas, oldindan to'lov.
  // Seansga bog'lanmagan, lekin mijozga bog'langan to'lov shunday bo'ladi.
  const prepaid = await prisma.payment.aggregate({
    where: { createdAt: range, shift: { clubId }, sessionId: null, customerId: { not: null } },
    _sum: { amount: true },
  });
  const prepayments = prepaid._sum.amount ?? 0;
  const totalRevenue = Math.max(0, gameRevenue + itemsRevenue + quickSales - discounts);

  // Soatlik taqsimot — qaysi soatlarda pul kelmayapti (TZ M6.2).
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, amount: 0, sessions: 0 }));
  for (const session of sessions) {
    if (!session.endedAt) continue;
    const localHour = new Date(session.endedAt.getTime() + offset).getUTCHours();
    hourly[localHour].amount += session.totalAmount;
    hourly[localHour].sessions += 1;
  }

  // Joy turlari bo'yicha
  const byType = new Map<string, { revenue: number; sessions: number }>();
  for (const session of sessions) {
    const name = session.station.type.name;
    const entry = byType.get(name) ?? { revenue: 0, sessions: 0 };
    entry.revenue += session.gameAmount;
    entry.sessions += 1;
    byType.set(name, entry);
  }

  // Mahsulotlar — savdo va marja (TZ M6.2)
  const byProduct = new Map<string, { name: string; qty: number; revenue: number; margin: number }>();
  for (const item of items) {
    if (!item.product) continue;
    const entry = byProduct.get(item.product.id) ?? {
      name: item.product.name,
      qty: 0,
      revenue: 0,
      margin: 0,
    };
    entry.qty += item.qty;
    entry.revenue += item.amount;
    entry.margin += item.amount - item.qty * item.product.costPrice;
    byProduct.set(item.product.id, entry);
  }

  return {
    date,
    gameRevenue,
    itemsRevenue,
    quickSales,
    discounts,
    totalRevenue,
    prepayments,
    totalPaid,
    totalExpenses,
    // Sof natija — ishlab topilgan pul, ya'ni daromaddan chiqim ayrilgani.
    // Avansni bu yerga qo'shib bo'lmaydi: mijoz balansiga solgan pul hali
    // ishlab topilmagan va u o'ynaganda ikkinchi marta sanalib ketardi.
    net: totalRevenue - totalExpenses,
    // Kassa harakati — bugun jismonan qancha pul kirib-chiqqani.
    cashFlow: totalPaid - totalExpenses,
    sessionCount: sessions.length,
    byMethod,
    expenses: expenses.map((e) => ({ category: e.category, amount: e._sum.amount ?? 0 })),
    hourly,
    byType: [...byType.entries()].map(([name, v]) => ({ name, ...v })),
    topProducts: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    shifts,
  };
}

/**
 * Bandlik issiqlik xaritasi — TZ M6.2.
 * Hafta kunlari (0=Dushanba, ..., 6=Yakshanba) va kun soatlari (0..23) bo'yicha bandlik foizi.
 */
export async function occupancyHeatmap(clubId: string, days = 14) {
  const club = await prisma.club.findUniqueOrThrow({ where: { id: clubId } });
  const offset = club.tzOffsetMinutes * 60_000;

  const totalStations = await prisma.station.count({
    where: { clubId, status: { not: 'OUT_OF_SERVICE' } },
  });

  const since = new Date(Date.now() - days * 24 * 60 * 60_000);

  const sessions = await prisma.session.findMany({
    where: {
      station: { clubId },
      status: { in: ['CLOSED', 'ACTIVE', 'PAUSED'] },
      startedAt: { gte: since },
    },
    select: {
      startedAt: true,
      endedAt: true,
    },
  });

  // 7 kun x 24 soat jadval: d: 0..6 (Du..Ya), h: 0..23
  // slotCounts: har bir slot necha marta takrorlangan (masalan 14 kunda 2 ta dushanba)
  const slots: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const slotDaysCount: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  // Sanab chiqamiz
  const numWeeks = Math.max(1, days / 7);
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      slotDaysCount[d][h] = numWeeks;
    }
  }

  const now = new Date();
  for (const s of sessions) {
    const start = new Date(s.startedAt.getTime() + offset);
    const end = new Date((s.endedAt ?? now).getTime() + offset);

    // Dushanba = 0, ..., Yakshanba = 6
    let cur = new Date(start);
    // Soat boshi
    cur.setUTCMinutes(0, 0, 0);

    while (cur < end) {
      const dayIndex = (cur.getUTCDay() + 6) % 7; // 0 = Du, 6 = Ya
      const hour = cur.getUTCHours();
      slots[dayIndex][hour] += 1;
      cur = new Date(cur.getTime() + 60 * 60_000);
    }
  }

  let maxOccupancy = 0;
  let peakDay = 0;
  let peakHour = 0;

  const matrix = slots.map((row, dayIdx) =>
    row.map((val, hourIdx) => {
      const divisor = Math.max(1, totalStations * slotDaysCount[dayIdx][hourIdx]);
      const pct = Math.min(100, Math.round((val / divisor) * 100));
      if (pct > maxOccupancy) {
        maxOccupancy = pct;
        peakDay = dayIdx;
        peakHour = hourIdx;
      }
      return {
        day: dayIdx,
        hour: hourIdx,
        occupancy: pct,
        busyCount: Math.round(val / numWeeks),
      };
    }),
  );

  const DAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];

  return {
    totalStations,
    daysAnalyzed: days,
    peakDay: DAYS[peakDay],
    peakHour: `${String(peakHour).padStart(2, '0')}:00`,
    maxOccupancy,
    days: DAYS,
    matrix,
  };
}

/**
 * Xodimlar kesimidagi samaradorlik hisoboti — TZ M6.2.
 */
export async function operatorStats(clubId: string, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);

  const operators = await prisma.appUser.findMany({
    where: { clubId, isActive: true },
    select: { id: true, fullName: true, role: true },
  });

  const [sessions, shifts, cancellations] = await Promise.all([
    prisma.session.findMany({
      where: { station: { clubId }, startedAt: { gte: since }, status: 'CLOSED' },
      select: { operatorId: true, totalAmount: true, gameAmount: true, itemsAmount: true },
    }),
    prisma.shift.findMany({
      where: { clubId, openedAt: { gte: since } },
      select: { operatorId: true, cashDiff: true, status: true },
    }),
    prisma.session.findMany({
      where: { station: { clubId }, startedAt: { gte: since }, status: 'CANCELLED' },
      select: { operatorId: true },
    }),
  ]);

  return operators.map((op) => {
    const opSessions = sessions.filter((s) => s.operatorId === op.id);
    const opShifts = shifts.filter((s) => s.operatorId === op.id);
    const opCancels = cancellations.filter((s) => s.operatorId === op.id);

    const totalRevenue = opSessions.reduce((acc, s) => acc + s.totalAmount, 0);
    const sessionCount = opSessions.length;
    const avgCheck = sessionCount > 0 ? Math.round(totalRevenue / sessionCount) : 0;
    const shiftCount = opShifts.length;
    const totalCashDiff = opShifts.reduce((acc, s) => acc + Math.abs(s.cashDiff ?? 0), 0);

    return {
      id: op.id,
      fullName: op.fullName,
      role: op.role,
      shiftCount,
      sessionCount,
      totalRevenue,
      avgCheck,
      totalCashDiff,
      cancelledCount: opCancels.length,
    };
  });
}

/**
 * Mijozlar segmentatsiyasi va tahlili — TZ M5.3, M6.2.
 */
export async function customerSegmentation(clubId: string) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60_000);

  const customers = await prisma.customer.findMany({
    where: { clubId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      balance: true,
      bonusPoints: true,
      createdAt: true,
      sessions: {
        where: { status: 'CLOSED' },
        select: { totalAmount: true, endedAt: true },
        orderBy: { endedAt: 'desc' },
      },
    },
  });

  let totalSpentAll = 0;
  let regularCount = 0;
  let newCount = 0;
  let atRiskCount = 0;

  const list = customers.map((c) => {
    const totalSpent = c.sessions.reduce((acc, s) => acc + s.totalAmount, 0);
    totalSpentAll += totalSpent;
    const sessionCount = c.sessions.length;
    const lastVisit = c.sessions[0]?.endedAt ?? null;
    const isNew = c.createdAt >= monthAgo;

    let segment: 'REGULAR' | 'NEW' | 'AT_RISK' | 'OCCASIONAL' = 'OCCASIONAL';
    if (lastVisit && lastVisit >= weekAgo) {
      segment = 'REGULAR';
      regularCount++;
    } else if (isNew) {
      segment = 'NEW';
      newCount++;
    } else if (lastVisit && lastVisit < monthAgo) {
      segment = 'AT_RISK';
      atRiskCount++;
    }

    return {
      id: c.id,
      fullName: c.fullName,
      phone: c.phone,
      balance: c.balance,
      bonusPoints: c.bonusPoints,
      totalSpent,
      sessionCount,
      avgSpent: sessionCount > 0 ? Math.round(totalSpent / sessionCount) : 0,
      lastVisit,
      segment,
    };
  });

  const topCustomers = [...list].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 20);

  return {
    totalCustomers: customers.length,
    regularCount,
    newCount,
    atRiskCount,
    totalSpentAll,
    topCustomers,
  };
}

/**
 * Davriy taqqoslash hisoboti (Hafta/Oy) — TZ M6.2.
 */
export async function periodComparison(clubId: string, period: 'week' | 'month' = 'week') {
  const days = period === 'week' ? 7 : 30;
  const now = new Date();
  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60_000);
  const prevStart = new Date(now.getTime() - 2 * days * 24 * 60 * 60_000);

  const [currentSessions, prevSessions, currentExpenses, prevExpenses] = await Promise.all([
    prisma.session.findMany({
      where: { station: { clubId }, endedAt: { gte: currentStart, lte: now }, status: 'CLOSED' },
      select: { totalAmount: true, gameAmount: true, itemsAmount: true },
    }),
    prisma.session.findMany({
      where: { station: { clubId }, endedAt: { gte: prevStart, lt: currentStart }, status: 'CLOSED' },
      select: { totalAmount: true, gameAmount: true, itemsAmount: true },
    }),
    prisma.expense.aggregate({
      where: { shift: { clubId }, createdAt: { gte: currentStart, lte: now } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { shift: { clubId }, createdAt: { gte: prevStart, lt: currentStart } },
      _sum: { amount: true },
    }),
  ]);

  const currRevenue = currentSessions.reduce((acc, s) => acc + s.totalAmount, 0);
  const prevRevenue = prevSessions.reduce((acc, s) => acc + s.totalAmount, 0);
  const revenueGrowth = prevRevenue > 0 ? Math.round(((currRevenue - prevRevenue) / prevRevenue) * 100) : 0;

  const currSessionsCount = currentSessions.length;
  const prevSessionsCount = prevSessions.length;
  const sessionsGrowth = prevSessionsCount > 0 ? Math.round(((currSessionsCount - prevSessionsCount) / prevSessionsCount) * 100) : 0;

  const currExp = currentExpenses._sum.amount ?? 0;
  const prevExp = prevExpenses._sum.amount ?? 0;

  const currNet = currRevenue - currExp;
  const prevNet = prevRevenue - prevExp;
  const netGrowth = prevNet > 0 ? Math.round(((currNet - prevNet) / prevNet) * 100) : 0;

  return {
    period,
    days,
    current: { revenue: currRevenue, sessions: currSessionsCount, expenses: currExp, net: currNet },
    previous: { revenue: prevRevenue, sessions: prevSessionsCount, expenses: prevExp, net: prevNet },
    growth: { revenue: revenueGrowth, sessions: sessionsGrowth, net: netGrowth },
  };
}
