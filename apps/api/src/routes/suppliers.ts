import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma, audit } from '../db.ts';
import { fail } from '../errors.ts';
import { requireAuth, requireManager } from '../auth.ts';
import { broadcast } from '../realtime.ts';

const idParam = z.object({ id: z.string().min(1) });

/**
 * Ta'minotchi bo'yicha hisob — TZ 2.1.
 *
 * Qarz = kelgan tovar summasi − to'langan pul. To'lov alohida jadvalda
 * emas, chiqim (expense) sifatida yoziladi: shunda kassa sverkasi
 * avtomatik to'g'ri chiqadi va pul ikki marta sanalmaydi.
 */
async function supplierBalance(supplierId: string) {
  const [intakes, paid] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { supplierId, type: 'IN' },
      select: { qty: true, unitCost: true },
    }),
    prisma.expense.aggregate({ where: { supplierId }, _sum: { amount: true } }),
  ]);

  const kelgan = intakes.reduce((sum, m) => sum + m.qty * (m.unitCost ?? 0), 0);
  const tolangan = paid._sum.amount ?? 0;

  return { kelgan, tolangan, qarz: kelgan - tolangan };
}

export async function supplierRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  app.addHook('onResponse', async (req, reply) => {
    if (req.method === 'GET' || reply.statusCode >= 400) return;
    broadcast();
  });

  app.get('/api/suppliers', async (req) => {
    const all = (req.query as { all?: string })?.all === '1';
    const rows = await prisma.supplier.findMany({
      where: { clubId: req.user.clubId, ...(all ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      rows.map(async (s) => ({ ...s, ...(await supplierBalance(s.id)) })),
    );
  });

  app.get('/api/suppliers/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) fail('Ta\'minotchi topilmadi.');

    const [movements, payments] = await Promise.all([
      prisma.stockMovement.findMany({
        where: { supplierId: id, type: 'IN' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { product: { select: { name: true } } },
      }),
      prisma.expense.findMany({
        where: { supplierId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      supplier,
      ...(await supplierBalance(id)),
      intakes: movements.map((m) => ({
        id: m.id,
        createdAt: m.createdAt,
        product: m.product.name,
        qty: m.qty,
        unitCost: m.unitCost,
        amount: m.qty * (m.unitCost ?? 0),
        note: m.note,
      })),
      payments,
    };
  });

  app.post('/api/suppliers', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const body = z
      .object({
        name: z.string().min(1),
        phone: z.string().nullable().default(null),
        note: z.string().nullable().default(null),
      })
      .parse(req.body);

    const created = await prisma.supplier.create({ data: { ...body, clubId: req.user.clubId } });
    await audit({ userId: req.user.sub, entity: 'Supplier', entityId: created.id, action: 'create', newValue: body });
    return created;
  });

  app.patch('/api/suppliers/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        phone: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);

    return prisma.supplier.update({ where: { id }, data: body });
  });

  // To'lov chiqim sifatida yoziladi — kassadan chiqqan pul shu yerda
  // hisobga olinadi va smena sverkasida avtomatik ko'rinadi.
  app.post('/api/suppliers/:id/pay', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ amount: z.number().int().min(1), note: z.string().nullable().default(null) })
      .parse(req.body);

    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) fail('Ta\'minotchi topilmadi.');

    const shift = await prisma.shift.findFirst({ where: { clubId: req.user.clubId, status: 'OPEN' } });
    if (!shift) fail('Smena ochilmagan — to\'lovni yozib bo\'lmaydi.');

    const expense = await prisma.expense.create({
      data: {
        shiftId: shift.id,
        operatorId: req.user.sub,
        supplierId: id,
        category: 'Ta\'minotchi',
        amount: body.amount,
        note: body.note ?? supplier.name,
      },
    });

    await audit({
      userId: req.user.sub,
      entity: 'Supplier',
      entityId: id,
      action: 'pay',
      newValue: { amount: body.amount, supplier: supplier.name },
    });

    return { expense, ...(await supplierBalance(id)) };
  });

  app.delete('/api/suppliers/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);

    const [intakes, payments] = await Promise.all([
      prisma.stockMovement.count({ where: { supplierId: id } }),
      prisma.expense.count({ where: { supplierId: id } }),
    ]);

    if (intakes + payments > 0) {
      // Kirim va to'lovlar hisobotga kiradi — yozuvni yo'qotib bo'lmaydi.
      await prisma.supplier.update({ where: { id }, data: { isActive: false } });
      return { archived: true };
    }

    await prisma.supplier.delete({ where: { id } });
    return { ok: true };
  });
}
