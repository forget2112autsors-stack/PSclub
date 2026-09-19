import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma, audit } from '../db.ts';
import { fail } from '../errors.ts';
import { requireAuth, requireManager } from '../auth.ts';
import { broadcast } from '../realtime.ts';
import {
  addCustomerPackage,
  cancelBooking,
  convertBonusToBalance,
  createBooking,
  customerSummary,
  expireStaleBookings,
  normalizePhone,
  topUpBalance,
} from '../services/customer.ts';

const idParam = z.object({ id: z.string().min(1) });

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  app.addHook('onResponse', async (req, reply) => {
    if (req.method === 'GET' || reply.statusCode >= 400) return;
    broadcast();
  });

  // ---------------------------------------------------------- Mijozlar -----

  app.get('/api/customers', async (req) => {
    const query = req.query as { q?: string; balance?: string; status?: string };
    const q = query?.q?.trim() ?? '';
    const balance = query?.balance;
    const status = query?.status;

    let balanceWhere = {};
    if (balance === 'debt') {
      balanceWhere = { balance: { lt: 0 } };
    } else if (balance === 'positive') {
      balanceWhere = { balance: { gt: 0 } };
    } else if (balance === 'zero') {
      balanceWhere = { balance: 0 };
    }

    let statusWhere = {};
    if (status === 'active') {
      statusWhere = { isBlocked: false };
    } else if (status === 'blocked') {
      statusWhere = { isBlocked: true };
    }

    return prisma.customer.findMany({
      where: {
        clubId: req.user.clubId,
        ...balanceWhere,
        ...statusWhere,
        ...(q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}),
      },
      orderBy: { fullName: 'asc' },
      take: 100,
    });
  });

  app.get('/api/customers/:id', async (req) => customerSummary(idParam.parse(req.params).id));

  app.post('/api/customers', async (req) => {
    const body = z
      .object({
        fullName: z.string().min(1),
        phone: z.string().min(7),
        note: z.string().nullable().default(null),
      })
      .parse(req.body);

    const phone = normalizePhone(body.phone);
    const exists = await prisma.customer.findFirst({ where: { clubId: req.user.clubId, phone } });
    if (exists) fail('Bu telefon raqami bilan mijoz allaqachon bor.');

    const created = await prisma.customer.create({
      data: { clubId: req.user.clubId, fullName: body.fullName.trim(), phone, note: body.note },
    });
    await audit({ userId: req.user.sub, entity: 'Customer', entityId: created.id, action: 'create', newValue: created });
    return created;
  });

  app.patch('/api/customers/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        fullName: z.string().min(1).optional(),
        phone: z.string().min(7).optional(),
        note: z.string().nullable().optional(),
        isBlocked: z.boolean().optional(),
      })
      .parse(req.body);

    const before = await prisma.customer.findFirst({ where: { id, clubId: req.user.clubId } });
    if (!before) fail('Mijoz topilmadi.');

    let normalizedPhone: string | undefined = undefined;
    if (body.phone) {
      normalizedPhone = normalizePhone(body.phone);
      const duplicate = await prisma.customer.findFirst({
        where: { clubId: req.user.clubId, phone: normalizedPhone, id: { not: id } },
      });
      if (duplicate) fail('Bu telefon raqami bilan boshqa mijoz ro\'yxatdan o\'tgan.');
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        ...(body.fullName ? { fullName: body.fullName.trim() } : {}),
        ...(normalizedPhone !== undefined ? { phone: normalizedPhone } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.isBlocked !== undefined ? { isBlocked: body.isBlocked } : {}),
      },
    });

    await audit({
      userId: req.user.sub,
      entity: 'Customer',
      entityId: id,
      action: 'update',
      oldValue: before,
      newValue: updated,
    });

    return updated;
  });

  app.delete('/api/customers/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);
    const customer = await prisma.customer.findFirst({ where: { id, clubId: req.user.clubId } });
    if (!customer) fail('Mijoz topilmadi.');

    const [sessionsCount, packagesCount] = await Promise.all([
      prisma.session.count({ where: { customerId: id } }),
      prisma.customerPackage.count({ where: { customerId: id } }),
    ]);

    if (sessionsCount > 0 || packagesCount > 0) {
      await prisma.customer.update({ where: { id }, data: { isBlocked: true } });
      await audit({
        userId: req.user.sub,
        entity: 'Customer',
        entityId: id,
        action: 'archive',
        oldValue: customer,
        isCritical: true,
      });
      return { archived: true, message: 'Mijoz faoliyat ko\'rsatgani uchun qora ro\'yxatga olindi (arxivlandi).' };
    }

    await prisma.customer.delete({ where: { id } });
    await audit({
      userId: req.user.sub,
      entity: 'Customer',
      entityId: id,
      action: 'delete',
      oldValue: customer,
      isCritical: true,
    });
    return { ok: true };
  });

  app.post('/api/customers/:id/topup', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ amount: z.number().int().min(1), method: z.enum(['CASH', 'CARD', 'ONLINE']).default('CASH') })
      .parse(req.body);

    const shift = await prisma.shift.findFirst({ where: { clubId: req.user.clubId, status: 'OPEN' } });
    if (!shift) fail('Smena ochilmagan.');

    return topUpBalance({
      customerId: id,
      amount: body.amount,
      method: body.method,
      shiftId: shift.id,
      userId: req.user.sub,
    });
  });

  app.post('/api/customers/:id/packages', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        name: z.string().min(1),
        totalMinutes: z.number().int().min(1),
        amount: z.number().int().min(0),
        method: z.enum(['CASH', 'CARD', 'ONLINE']).default('CASH'),
        daysValid: z.number().int().min(1).nullable().optional(),
        tariffId: z.string().nullable().optional(),
      })
      .parse(req.body);

    const shift = await prisma.shift.findFirst({ where: { clubId: req.user.clubId, status: 'OPEN' } });
    if (!shift) fail('Smena ochilmagan.');

    return addCustomerPackage({
      customerId: id,
      name: body.name,
      totalMinutes: body.totalMinutes,
      amount: body.amount,
      method: body.method,
      daysValid: body.daysValid,
      tariffId: body.tariffId,
      shiftId: shift.id,
      userId: req.user.sub,
    });
  });

  app.post('/api/customers/:id/use-bonus', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ points: z.number().int().min(1) }).parse(req.body);

    return convertBonusToBalance({
      customerId: id,
      points: body.points,
      userId: req.user.sub,
    });
  });

  // -------------------------------------------------------------- Bron -----

  app.get('/api/bookings', async (req) => {
    await expireStaleBookings(req.user.clubId);
    return prisma.booking.findMany({
      where: {
        station: { clubId: req.user.clubId },
        status: { in: ['PENDING', 'CONFIRMED'] },
        startsAt: { gte: new Date(Date.now() - 2 * 60 * 60_000) },
      },
      orderBy: { startsAt: 'asc' },
      include: {
        station: { select: { number: true, type: { select: { name: true } } } },
        customer: { select: { id: true, fullName: true, phone: true } },
      },
    });
  });

  app.post('/api/bookings', async (req) => {
    const body = z
      .object({
        stationId: z.string().min(1),
        customerId: z.string().nullable().default(null),
        startsAt: z.coerce.date(),
        note: z.string().nullable().default(null),
      })
      .parse(req.body);

    return createBooking({ ...body, userId: req.user.sub });
  });

  app.delete('/api/bookings/:id', async (req) => {
    await cancelBooking(idParam.parse(req.params).id, req.user.sub);
    return { ok: true };
  });

  // Mijozlar ro'yxatini tozalash faqat administrator ishi.
  //
  // Moliyaviy tarixi bor mijoz o'chirilmaydi: balans harakatlari va to'lovlar
  // kassa hisobotiga kiradi, ularni yo'qotish hisobotni buzadi. Bunday mijoz
  // qora ro'yxatga qo'yiladi.
  app.delete('/api/customers/:id', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const { id } = idParam.parse(req.params);

    const [sessions, payments, balanceTxs, packages] = await Promise.all([
      prisma.session.count({ where: { customerId: id } }),
      prisma.payment.count({ where: { customerId: id } }),
      prisma.customerBalanceTx.count({ where: { customerId: id } }),
      prisma.customerPackage.count({ where: { customerId: id } }),
    ]);

    const tarix = sessions + payments + balanceTxs + packages;
    if (tarix > 0) {
      return reply.code(400).send({
        error:
          'Bu mijozda seans yoki to\'lov tarixi bor — o\'chirib bo\'lmaydi. ' +
          'O\'rniga qora ro\'yxatga qo\'ying.',
      });
    }

    await prisma.$transaction([
      prisma.booking.deleteMany({ where: { customerId: id } }),
      prisma.customer.delete({ where: { id } }),
    ]);
    return { ok: true };
  });
}
