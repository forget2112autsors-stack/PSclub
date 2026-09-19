import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { weightedCost } from '@psklub/domain';

import { prisma, audit } from '../db.ts';
import { requireAuth, requireManager, hashPin } from '../auth.ts';
import { fail } from '../errors.ts';

const idParam = z.object({ id: z.string().min(1) });

/**
 * Qisman yangilash uchun: zod ning .partial() sxemasi .default() qiymatlarni
 * baribir qo'shib yuboradi, natijada yuborilmagan maydonlar standart qiymatga
 * tushib qoladi (narx 0 bo'lib ketishi mumkin). Shuning uchun so'rov tanasida
 * haqiqatan kelgan kalitlarnigina olamiz.
 */
function onlySent<T extends object>(raw: unknown, parsed: T): Partial<T> {
  if (typeof raw !== 'object' || raw === null) return {};
  const sent = new Set(Object.keys(raw));
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => sent.has(key))) as Partial<T>;
}

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

  app.get('/api/station-types', async (req) =>
    prisma.stationType.findMany({
      where: { clubId: req.user.clubId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
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
    const body = onlySent(req.body, stationTypeBody.partial().parse(req.body));

    const before = await prisma.stationType.findUnique({ where: { id } });
    if (!before || before.clubId !== req.user.clubId) return reply.code(404).send({ error: 'Joy turi topilmadi.' });

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
    if (!before || before.clubId !== req.user.clubId) return reply.code(404).send({ error: 'Joy turi topilmadi.' });

    await prisma.stationType.delete({ where: { id } });
    await audit({ userId: req.user.sub, entity: 'StationType', entityId: id, action: 'delete', oldValue: before, isCritical: true });
    return { ok: true };
  });

  // ----------------------------------------------------------------- Joylar --

  app.get('/api/stations', async (req) =>
    prisma.station.findMany({
      where: { clubId: req.user.clubId },
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
    const schema = stationBody.partial().extend({
      status: z.enum(['FREE', 'BUSY', 'OUT_OF_SERVICE']).optional(),
      note: z.string().nullable().optional(),
    });
    const body = onlySent(req.body, schema.parse(req.body));

    const before = await prisma.station.findUnique({ where: { id } });
    if (!before || before.clubId !== req.user.clubId) return reply.code(404).send({ error: 'Joy topilmadi.' });

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
    if (!before || before.clubId !== req.user.clubId) return reply.code(404).send({ error: 'Joy topilmadi.' });

    await prisma.station.delete({ where: { id } });
    await audit({ userId: req.user.sub, entity: 'Station', entityId: id, action: 'delete', oldValue: before, isCritical: true });
    return { ok: true };
  });

  // --------------------------------------------------------------- Tariflar --

  app.get('/api/tariffs', async (req) => {
    const all = (req.query as { all?: string })?.all === '1';
    return prisma.tariff.findMany({
      where: { clubId: req.user.clubId, ...(all ? {} : { isActive: true }) },
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
    const body = onlySent(req.body, tariffBody.partial().parse(req.body));

    const before = await prisma.tariff.findUnique({ where: { id }, include: { schedules: true } });
    if (!before || before.clubId !== req.user.clubId) return reply.code(404).send({ error: 'Tarif topilmadi.' });

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
    if (!before || before.clubId !== req.user.clubId) return reply.code(404).send({ error: 'Tarif topilmadi.' });

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
    const body = onlySent(req.body, productBody.partial().extend({ isActive: z.boolean().optional() }).parse(req.body));

    const before = await prisma.product.findUnique({ where: { id } });
    if (!before || before.clubId !== req.user.clubId) return reply.code(404).send({ error: 'Mahsulot topilmadi.' });

    const updated = await prisma.product.update({ where: { id }, data: body });
    await audit({ userId: req.user.sub, entity: 'Product', entityId: id, action: 'update', oldValue: before, newValue: updated, isCritical: body.salePrice !== undefined });
    return updated;
  });

  app.delete('/api/products/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);

    const before = await prisma.product.findUnique({ where: { id } });
    if (!before || before.clubId !== req.user.clubId) return reply.code(404).send({ error: 'Mahsulot topilmadi.' });

    const [orderItemsCount, movementsCount] = await Promise.all([
      prisma.orderItem.count({ where: { productId: id } }),
      prisma.stockMovement.count({ where: { productId: id } }),
    ]);

    if (orderItemsCount > 0 || movementsCount > 0) {
      const updated = await prisma.product.update({ where: { id }, data: { isActive: false } });
      await audit({ userId: req.user.sub, entity: 'Product', entityId: id, action: 'archive', oldValue: before, isCritical: true });
      return { archived: true, message: 'Mahsulot bo\'yicha operatsiyalar mavjudligi sababli arxivlandi.' };
    }

    await prisma.product.delete({ where: { id } });
    await audit({ userId: req.user.sub, entity: 'Product', entityId: id, action: 'delete', oldValue: before, isCritical: true });
    return { ok: true };
  });

  // Ombor kirimi — TZ M3.3.
  app.post('/api/stock/in', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const body = z
      .object({
        productId: z.string().min(1),
        qty: z.number().int().min(1),
        unitCost: z.number().int().min(0).nullable().default(null),
        supplierId: z.string().nullable().default(null),
        note: z.string().nullable().default(null),
      })
      .parse(req.body);

    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product || product.clubId !== req.user.clubId) return reply.code(404).send({ error: 'Mahsulot topilmadi.' });

    // Tannarx ustiga yozilmaydi, qoldiq bilan tortib o'rtachalanadi (TZ M3.3).
    const yangiTannarx =
      body.unitCost !== null
        ? weightedCost({
            currentQty: product.stockQty,
            currentCost: product.costPrice,
            incomingQty: body.qty,
            incomingCost: body.unitCost,
          })
        : product.costPrice;

    const [updated] = await prisma.$transaction([
      prisma.product.update({
        where: { id: body.productId },
        data: { stockQty: { increment: body.qty }, costPrice: yangiTannarx },
      }),
      prisma.stockMovement.create({
        data: {
          productId: body.productId,
          supplierId: body.supplierId,
          type: 'IN',
          qty: body.qty,
          unitCost: body.unitCost,
          note: body.note,
          createdBy: req.user.sub,
        },
      }),
    ]);

    await audit({
      userId: req.user.sub,
      entity: 'Product',
      entityId: body.productId,
      action: 'stock-in',
      oldValue: { stockQty: product.stockQty, costPrice: product.costPrice },
      newValue: { ...body, costPrice: yangiTannarx },
    });
    return updated;
  });

  // Hisobdan chiqarish — buzilgan, muddati o'tgan yoki sinib qolgan tovar.
  // Sanoq bilan yashirish o'rniga sababi yozilgan alohida yozuv qoladi.
  app.post('/api/stock/write-off', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const body = z
      .object({
        productId: z.string().min(1),
        qty: z.number().int().min(1),
        reason: z.string().min(1, 'Sabab ko\'rsatilishi shart.'),
      })
      .parse(req.body);

    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product || product.clubId !== req.user.clubId) return reply.code(404).send({ error: 'Mahsulot topilmadi.' });
    if (product.stockQty < body.qty) {
      return reply.code(400).send({ error: `Omborda ${product.stockQty} dona bor, ${body.qty} dona chiqarib bo'lmaydi.` });
    }

    const [updated] = await prisma.$transaction([
      prisma.product.update({
        where: { id: body.productId },
        data: { stockQty: { decrement: body.qty } },
      }),
      prisma.stockMovement.create({
        data: {
          productId: body.productId,
          type: 'WRITE_OFF',
          qty: -body.qty,
          unitCost: product.costPrice,
          note: body.reason,
          createdBy: req.user.sub,
        },
      }),
    ]);

    // Hisobdan chiqarish — pul yo'qotilishi, shuning uchun kritik.
    await audit({
      userId: req.user.sub,
      entity: 'Product',
      entityId: body.productId,
      action: 'write-off',
      newValue: { qty: body.qty, reason: body.reason, zarar: body.qty * product.costPrice },
    });

    return { product: updated, zarar: body.qty * product.costPrice };
  });

  // Ombor tarixi — TZ M3.3. Bazada bor edi, lekin ko'rish imkoni yo'q edi.
  app.get('/api/stock/movements', async (req) => {
    const query = z
      .object({
        productId: z.string().optional(),
        type: z.enum(['IN', 'SALE', 'INVENTORY', 'WRITE_OFF']).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query ?? {});

    const rows = await prisma.stockMovement.findMany({
      where: {
        product: { clubId: req.user.clubId },
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: {
        product: { select: { id: true, name: true } },
        supplier: { select: { name: true } },
      },
    });

    const userIds = [...new Set(rows.map((r) => r.createdBy).filter((x): x is string => Boolean(x)))];
    const users = await prisma.appUser.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    const byId = new Map(users.map((u) => [u.id, u.fullName]));

    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      type: r.type,
      qty: r.qty,
      unitCost: r.unitCost,
      note: r.note,
      product: r.product,
      supplier: r.supplier?.name ?? null,
      user: r.createdBy ? (byId.get(r.createdBy) ?? null) : null,
    }));
  });

  // Inventarizatsiya — TZ M3.3. Sanoq natijasi va farq qayd qilinadi.
  app.post('/api/stock/count', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const body = z
      .object({
        productId: z.string().min(1),
        countedQty: z.number().int().min(0),
        note: z.string().nullable().default(null),
      })
      .parse(req.body);

    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product || product.clubId !== req.user.clubId) return reply.code(404).send({ error: 'Mahsulot topilmadi.' });

    const diff = body.countedQty - product.stockQty;
    if (diff === 0) {
      return { product, diff: 0, message: 'Sanoq qoldiq bilan mos — o\'zgarish kiritilmadi.' };
    }

    const [updated] = await prisma.$transaction([
      prisma.product.update({ where: { id: body.productId }, data: { stockQty: body.countedQty } }),
      prisma.stockMovement.create({
        data: {
          productId: body.productId,
          type: 'INVENTORY',
          qty: diff,
          note: body.note ?? `Sanoq: ${product.stockQty} -> ${body.countedQty}`,
          createdBy: req.user.sub,
        },
      }),
    ]);

    // Kamomad — pul yo'qotilishi demak, shuning uchun kritik belgilanadi.
    await audit({
      userId: req.user.sub,
      entity: 'Product',
      entityId: body.productId,
      action: 'inventory',
      oldValue: { stockQty: product.stockQty },
      newValue: { stockQty: body.countedQty, diff, note: body.note },
      isCritical: diff < 0,
    });

    return { product: updated, diff };
  });

  // ----------------------------------------------------------- Xodimlar (Staff) --

  app.get('/api/staff', async (req) => {
    return prisma.appUser.findMany({
      where: { clubId: req.user.clubId },
      select: {
        id: true,
        fullName: true,
        role: true,
        isActive: true,
        telegramChatId: true,
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
  });

  app.post('/api/staff', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const body = z
      .object({
        fullName: z.string().min(1),
        role: z.enum(['OPERATOR', 'ADMIN']),
        pin: z.string().min(4).max(8),
      })
      .parse(req.body);

    const pinHash = await hashPin(body.pin);
    const created = await prisma.appUser.create({
      data: {
        clubId: req.user.clubId,
        fullName: body.fullName.trim(),
        role: body.role,
        pinHash,
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        isActive: true,
        telegramChatId: true,
        createdAt: true,
      },
    });

    await audit({
      userId: req.user.sub,
      entity: 'AppUser',
      entityId: created.id,
      action: 'create',
      newValue: { fullName: created.fullName, role: created.role },
      isCritical: true,
    });

    return created;
  });

  app.patch('/api/staff/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        fullName: z.string().min(1).optional(),
        role: z.enum(['OPERATOR', 'ADMIN']).optional(),
        pin: z.string().min(4).max(8).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);

    const before = await prisma.appUser.findFirst({ where: { id, clubId: req.user.clubId } });
    if (!before) return reply.code(404).send({ error: 'Xodim topilmadi.' });

    const data: any = {};
    if (body.fullName) data.fullName = body.fullName.trim();
    if (body.role) data.role = body.role;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.pin) data.pinHash = await hashPin(body.pin);

    const updated = await prisma.appUser.update({
      where: { id },
      data,
      select: {
        id: true,
        fullName: true,
        role: true,
        isActive: true,
        telegramChatId: true,
        createdAt: true,
      },
    });

    await audit({
      userId: req.user.sub,
      entity: 'AppUser',
      entityId: id,
      action: 'update',
      oldValue: { fullName: before.fullName, role: before.role, isActive: before.isActive },
      newValue: { fullName: updated.fullName, role: updated.role, isActive: updated.isActive },
      isCritical: true,
    });

    return updated;
  });

  app.delete('/api/staff/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);
    if (id === req.user.sub) fail('O\'zingizni o\'chira olmaysiz.');

    const before = await prisma.appUser.findFirst({ where: { id, clubId: req.user.clubId } });
    if (!before) return reply.code(404).send({ error: 'Xodim topilmadi.' });

    const [shiftsCount, sessionsCount, expensesCount] = await Promise.all([
      prisma.shift.count({ where: { operatorId: id } }),
      prisma.session.count({ where: { operatorId: id } }),
      prisma.expense.count({ where: { operatorId: id } }),
    ]);

    if (shiftsCount > 0 || sessionsCount > 0 || expensesCount > 0) {
      await prisma.appUser.update({ where: { id }, data: { isActive: false } });
      await audit({
        userId: req.user.sub,
        entity: 'AppUser',
        entityId: id,
        action: 'archive',
        oldValue: before,
        isCritical: true,
      });
      return { archived: true, message: 'Xodim faoliyat olib borgani uchun nofaol qilindi (arxivlandi).' };
    }

    await prisma.appUser.delete({ where: { id } });
    await audit({
      userId: req.user.sub,
      entity: 'AppUser',
      entityId: id,
      action: 'delete',
      oldValue: before,
      isCritical: true,
    });
    return { ok: true };
  });

  // TZ M8: Ma'lumotlar zaxirasi (JSON snapshot) eksport qilish
  app.get('/api/backup/export', async (req, reply) => {
    if (!requireManager(req, reply)) return;

    const clubId = req.user.clubId;
    const [
      club,
      stationTypes,
      stations,
      tariffs,
      categories,
      products,
      customers,
      suppliers,
      shifts,
      sessions,
      expenses,
      bookings,
    ] = await Promise.all([
      prisma.club.findUnique({ where: { id: clubId } }),
      prisma.stationType.findMany({ where: { clubId } }),
      prisma.station.findMany({ where: { clubId } }),
      prisma.tariff.findMany({ where: { clubId }, include: { schedules: true } }),
      prisma.productCategory.findMany({ where: { clubId } }),
      prisma.product.findMany({ where: { clubId } }),
      prisma.customer.findMany({
        where: { clubId },
        include: { packages: true, balanceTxs: { take: 50, orderBy: { createdAt: 'desc' } } },
      }),
      prisma.supplier.findMany({ where: { clubId }, include: { invoices: true } }),
      prisma.shift.findMany({ where: { clubId }, orderBy: { openedAt: 'desc' }, take: 100 }),
      prisma.session.findMany({
        where: { station: { clubId } },
        include: { orderItems: true, segments: true, pauses: true },
        orderBy: { startedAt: 'desc' },
        take: 200,
      }),
      prisma.expense.findMany({ where: { clubId }, orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.booking.findMany({ where: { station: { clubId } }, take: 100 }),
    ]);

    await audit({
      userId: req.user.sub,
      entity: 'Club',
      entityId: clubId,
      action: 'backup-export',
      isCritical: true,
    });

    const backup = {
      version: '1.1',
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.name,
      club,
      stationTypes,
      stations,
      tariffs,
      categories,
      products,
      customers,
      suppliers,
      shifts,
      sessions,
      expenses,
      bookings,
    };

    const filename = `psklub_backup_${new Date().toISOString().slice(0, 10)}.json`;
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return backup;
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
