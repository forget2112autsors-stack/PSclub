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
    totalRevenue: Math.max(0, gameRevenue + itemsRevenue + quickSales - discounts),
    totalPaid,
    totalExpenses,
    net: totalPaid - totalExpenses,
    sessionCount: sessions.length,
    byMethod,
    expenses: expenses.map((e) => ({ category: e.category, amount: e._sum.amount ?? 0 })),
    hourly,
    byType: [...byType.entries()].map(([name, v]) => ({ name, ...v })),
    topProducts: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    shifts,
  };
}
