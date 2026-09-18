import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma, audit } from '../db.ts';
import { requireAuth, requireManager } from '../auth.ts';

const idParam = z.object({ id: z.string().min(1) });

const scheduleSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(0).max(1439),
});

const tariffBody = z.object({
  name: z.string().min(1),
  kind: z.enum(['HOURLY', 'PACKAGE']).default('HOURLY'),
  typeId: z.string().nullable().default(null),
  priority: z.number().int().default(0),
  pricePerHour: z.number().int().min(0).default(0),
  minMinutes: z.number().int().min(0).default(0),
  rounding: z.enum(['MINUTE', 'QUARTER', 'HOUR']).default('MINUTE'),
  packagePrice: z.number().int().min(0).nullable().default(null),
  packageMinutes: z.number().int().min(1).nullable().default(null),
  gamepadMultipliers: z.record(z.string(), z.number()).default({}),
  sortOrder: z.number().int().default(0),
  schedules: z.array(scheduleSchema).default([]),
});

const stationBody = z.object({
  typeId: z.string().min(1),
  number: z.number().int().min(1),
  name: z.string().nullable().default(null),
  gamepadCount: z.number().int().min(0).default(2),
  sortOrder: z.number().int().default(0),
});

const stationTypeBody = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  // ------------------------------------------------------------ Joy turlari --

  app.get('/api/station-types', async () =>
    prisma.stationType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  );

  app.post('/api/station-types', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const body = stationTypeBody.parse(req.body);

    const created = await prisma.stationType.create({
      data: { ...body, clubId: req.user.clubId },
    });
    await audit({ userId: req.user.sub, entity: 'StationType', entityId: created.id, action: 'create', newValue: body });
    return created;
  });

  app.patch('/api/station-types/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);
    const body = stationTypeBody.partial().parse(req.body);

    const before = await prisma.stationType.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'Joy turi topilmadi.' });

    const updated = await prisma.stationType.update({ where: { id }, data: body });
    await audit({ userId: req.user.sub, entity: 'StationType', entityId: id, action: 'update', oldValue: before, newValue: updated });
    return updated;
  });

  app.delete('/api/station-types/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);

    const used = await prisma.station.count({ where: { typeId: id } });
    if (used > 0) {
      return reply.code(400).send({ error: `Bu turga ${used} ta joy bog'langan — avval ularni o'zgartiring.` });
    }

    const before = await prisma.stationType.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'Joy turi topilmadi.' });

    await prisma.stationType.delete({ where: { id } });
    await audit({ userId: req.user.sub, entity: 'StationType', entityId: id, action: 'delete', oldValue: before, isCritical: true });
    return { ok: true };
  });

  // ----------------------------------------------------------------- Joylar --

  app.get('/api/stations', async () =>
    prisma.station.findMany({
      include: { type: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
    }),
  );

  app.post('/api/stations', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const body = stationBody.parse(req.body);

    const taken = await prisma.station.findFirst({
      where: { clubId: req.user.clubId, number: body.number },
    });
    if (taken) return reply.code(400).send({ error: `${body.number}-raqamli joy allaqachon bor.` });

    const created = await prisma.station.create({ data: { ...body, clubId: req.user.clubId } });
    await audit({ userId: req.user.sub, entity: 'Station', entityId: created.id, action: 'create', newValue: body });
    return created;
  });

  app.patch('/api/stations/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);
    const body = stationBody.partial().extend({
      status: z.enum(['FREE', 'BUSY', 'OUT_OF_SERVICE']).optional(),
      note: z.string().nullable().optional(),
    }).parse(req.body);

    const before = await prisma.station.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'Joy topilmadi.' });

    const updated = await prisma.station.update({ where: { id }, data: body });
    await audit({ userId: req.user.sub, entity: 'Station', entityId: id, action: 'update', oldValue: before, newValue: updated });
    return updated;
  });

  app.delete('/api/stations/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);

    const used = await prisma.session.count({ where: { stationId: id } });
    if (used > 0) {
      return reply.code(400).send({
        error: 'Bu joyda seanslar bo\'lgan — o\'chirib bo\'lmaydi. "Xizmatda emas" holatiga o\'tkazing.',
      });
    }

    const before = await prisma.station.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'Joy topilmadi.' });

    await prisma.station.delete({ where: { id } });
    await audit({ userId: req.user.sub, entity: 'Station', entityId: id, action: 'delete', oldValue: before, isCritical: true });
    return { ok: true };
  });

  // --------------------------------------------------------------- Tariflar --

  app.get('/api/tariffs', async (req) => {
    const all = (req.query as { all?: string })?.all === '1';
    return prisma.tariff.findMany({
      where: all ? {} : { isActive: true },
      include: { schedules: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  });

  app.post('/api/tariffs', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const body = tariffBody.parse(req.body);
    const invalid = validateTariff(body);
    if (invalid) return reply.code(400).send({ error: invalid });

    const { schedules, ...tariff } = body;
    const created = await prisma.tariff.create({
      data: {
        ...tariff,
        clubId: req.user.clubId,
        schedules: { create: schedules },
      },
      include: { schedules: true },
    });
    await audit({ userId: req.user.sub, entity: 'Tariff', entityId: created.id, action: 'create', newValue: body, isCritical: true });
    return created;
  });

  app.patch('/api/tariffs/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);
    const body = tariffBody.partial().parse(req.body);

    const before = await prisma.tariff.findUnique({ where: { id }, include: { schedules: true } });
    if (!before) return reply.code(404).send({ error: 'Tarif topilmadi.' });

    const invalid = validateTariff({ ...before, ...body } as z.infer<typeof tariffBody>);
    if (invalid) return reply.code(400).send({ error: invalid });

    const { schedules, ...tariff } = body;
    const updated = await prisma.tariff.update({
      where: { id },
      data: {
        ...tariff,
        // Oynalar to'liq almashtiriladi — qisman tahrirlash chalkashlik keltiradi.
        ...(schedules ? { schedules: { deleteMany: {}, create: schedules } } : {}),
      },
      include: { schedules: true },
    });
    await audit({ userId: req.user.sub, entity: 'Tariff', entityId: id, action: 'update', oldValue: before, newValue: updated, isCritical: true });
    return updated;
  });

  // Tarif o'chirilmaydi, arxivlanadi: eski seanslar unga bog'langan bo'lishi mumkin.
  app.delete('/api/tariffs/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);

    const before = await prisma.tariff.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'Tarif topilmadi.' });

    const updated = await prisma.tariff.update({ where: { id }, data: { isActive: false } });
    await audit({ userId: req.user.sub, entity: 'Tariff', entityId: id, action: 'archive', oldValue: before, isCritical: true });
    return updated;
  });
}

const categoryBody = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
});

const productBody = z.object({
  name: z.string().min(1),
  categoryId: z.string().nullable().default(null),
  barcode: z.string().nullable().default(null),
  unit: z.string().default('dona'),
  costPrice: z.number().int().min(0).default(0),
  salePrice: z.number().int().min(0),
  minStock: z.number().int().min(0).default(0),
  isQuickKey: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  app.get('/api/product-categories', async (req) =>
    prisma.productCategory.findMany({
      where: { clubId: req.user.clubId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  );

  app.post('/api/product-categories', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const body = categoryBody.parse(req.body);
    const created = await prisma.productCategory.create({
      data: { ...body, clubId: req.user.clubId },
    });
    await audit({ userId: req.user.sub, entity: 'ProductCategory', entityId: created.id, action: 'create', newValue: body });
    return created;
  });

  app.post('/api/products', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const body = productBody.parse(req.body);
    const created = await prisma.product.create({ data: { ...body, clubId: req.user.clubId } });
    await audit({ userId: req.user.sub, entity: 'Product', entityId: created.id, action: 'create', newValue: body });
    return created;
  });

  app.patch('/api/products/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);
    const body = productBody.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);

    const before = await prisma.product.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'Mahsulot topilmadi.' });

    const updated = await prisma.product.update({ where: { id }, data: body });
    await audit({ userId: req.user.sub, entity: 'Product', entityId: id, action: 'update', oldValue: before, newValue: updated, isCritical: body.salePrice !== undefined });
    return updated;
  });

  // Ombor kirimi — TZ M3.3.
  app.post('/api/stock/in', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const body = z
      .object({
        productId: z.string().min(1),
        qty: z.number().int().min(1),
        unitCost: z.number().int().min(0).nullable().default(null),
        note: z.string().nullable().default(null),
      })
      .parse(req.body);

    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) return reply.code(404).send({ error: 'Mahsulot topilmadi.' });

    const [updated] = await prisma.$transaction([
      prisma.product.update({
        where: { id: body.productId },
        data: {
          stockQty: { increment: body.qty },
          ...(body.unitCost !== null ? { costPrice: body.unitCost } : {}),
        },
      }),
      prisma.stockMovement.create({
        data: {
          productId: body.productId,
          type: 'IN',
          qty: body.qty,
          unitCost: body.unitCost,
          note: body.note,
          createdBy: req.user.sub,
        },
      }),
    ]);

    await audit({ userId: req.user.sub, entity: 'Product', entityId: body.productId, action: 'stock-in', newValue: body });
    return updated;
  });
}

function validateTariff(t: z.infer<typeof tariffBody>): string | null {
  if (t.kind === 'PACKAGE') {
    if (t.packagePrice === null || t.packageMinutes === null) {
      return 'Paket tarif uchun narx va davomiylik ko\'rsatilishi shart.';
    }
  } else if (t.pricePerHour <= 0) {
    return 'Soatlik tarif uchun narx noldan katta bo\'lishi kerak.';
  }

  for (const s of t.schedules ?? []) {
    if (s.startMinute === s.endMinute && s.startMinute !== 0) {
      return 'Oynaning boshlanishi va tugashi bir xil bo\'lmasin.';
    }
  }
  return null;
}
