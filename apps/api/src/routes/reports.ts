import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';

import { prisma } from '../db.ts';
import { requireAuth, requireManager } from '../auth.ts';
import { dailyReport } from '../services/report.ts';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Naqd',
  CARD: 'Karta',
  BALANCE: 'Mijoz balansi',
  PACKAGE: 'Paket',
  ONLINE: 'Onlayn',
};

/** Klub vaqti bo'yicha bugungi sana (YYYY-MM-DD). */
async function todayFor(clubId: string): Promise<string> {
  const club = await prisma.club.findUniqueOrThrow({ where: { id: clubId } });
  return new Date(Date.now() + club.tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

const dateQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  app.get('/api/reports/daily', async (req) => {
    const { date } = dateQuery.parse(req.query ?? {});
    return dailyReport(req.user.clubId, date ?? (await todayFor(req.user.clubId)));
  });

  // Excel eksport — TZ M6.3, QM-9.
  app.get('/api/reports/daily.xlsx', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { date } = dateQuery.parse(req.query ?? {});
    const day = date ?? (await todayFor(req.user.clubId));
    const r = await dailyReport(req.user.clubId, day);

    const wb = new ExcelJS.Workbook();
    wb.created = new Date();

    const money = '#,##0';
    const sheet = wb.addWorksheet('Kunlik hisobot');
    sheet.columns = [{ width: 32 }, { width: 18 }, { width: 14 }];

    const title = sheet.addRow([`Kunlik hisobot — ${day}`]);
    title.font = { bold: true, size: 14 };
    sheet.addRow([]);

    const section = (name: string) => {
      const row = sheet.addRow([name]);
      row.font = { bold: true };
    };
    const line = (label: string, value: number) => {
      const row = sheet.addRow([label, value]);
      row.getCell(2).numFmt = money;
    };

    section('Tushum');
    line('O\'yin', r.gameRevenue);
    line('Bufet (seansga)', r.itemsRevenue);
    line('Tez kassa', r.quickSales);
    line('Chegirma', -r.discounts);
    line('Jami tushum', r.totalRevenue);
    sheet.addRow([]);

    section('To\'lov turlari');
    for (const [method, amount] of Object.entries(r.byMethod)) {
      line(METHOD_LABEL[method] ?? method, amount);
    }
    line('Jami to\'langan', r.totalPaid);
    sheet.addRow([]);

    section('Chiqim');
    for (const e of r.expenses) line(e.category, e.amount);
    line('Jami chiqim', r.totalExpenses);
    sheet.addRow([]);
    line('Sof natija (daromad - chiqim)', r.net);
    if (r.prepayments > 0) line('Avans (balansga, daromad emas)', r.prepayments);
    line('Kassa harakati', r.cashFlow);
    sheet.addRow([]);

    section('Joy turlari');
    sheet.addRow(['Turi', 'Tushum', 'Seans']).font = { bold: true };
    for (const t of r.byType) {
      const row = sheet.addRow([t.name, t.revenue, t.sessions]);
      row.getCell(2).numFmt = money;
    }
    sheet.addRow([]);

    section('Soatlik taqsimot');
    sheet.addRow(['Soat', 'Tushum', 'Seans']).font = { bold: true };
    for (const h of r.hourly.filter((x) => x.sessions > 0)) {
      const row = sheet.addRow([`${String(h.hour).padStart(2, '0')}:00`, h.amount, h.sessions]);
      row.getCell(2).numFmt = money;
    }

    const products = wb.addWorksheet('Mahsulotlar');
    products.columns = [{ width: 32 }, { width: 10 }, { width: 16 }, { width: 16 }];
    products.addRow(['Mahsulot', 'Soni', 'Savdo', 'Marja']).font = { bold: true };
    for (const p of r.topProducts) {
      const row = products.addRow([p.name, p.qty, p.revenue, p.margin]);
      row.getCell(3).numFmt = money;
      row.getCell(4).numFmt = money;
    }

    const shifts = wb.addWorksheet('Smenalar');
    shifts.columns = [{ width: 22 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 30 }];
    shifts.addRow(['Operator', 'Ochilgan', 'Boshlang\'ich', 'Sanoq', 'Farq', 'Izoh']).font = { bold: true };
    for (const s of r.shifts) {
      const row = shifts.addRow([
        s.operator.fullName,
        s.openedAt.toISOString().slice(0, 16).replace('T', ' '),
        s.openingCash,
        s.countedCash ?? '',
        s.cashDiff ?? '',
        s.note ?? '',
      ]);
      for (const c of [3, 4, 5]) row.getCell(c).numFmt = money;
    }

    const buffer = await wb.xlsx.writeBuffer();
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="psklub-${day}.xlsx"`)
      .send(Buffer.from(buffer));
  });

  app.get('/api/audit', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    return prisma.auditLog.findMany({
      take: 200,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { fullName: true } } },
    });
  });
}
