import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../db.ts';
import { broadcast } from '../realtime.ts';
import { fail } from '../errors.ts';
import { requireAuth, requireManager } from '../auth.ts';
import {
  addItem,
  cancelSession,
  closeSession,
  listStations,
  moveSession,
  openSession,
  pauseSession,
  paySession,
  removeItem,
  resumeSession,
  sessionDetail,
} from '../services/session.ts';

const idParam = z.object({ id: z.string().min(1) });

const paymentSchema = z.object({
  method: z.enum(['CASH', 'CARD', 'BALANCE', 'PACKAGE', 'ONLINE']),
  amount: z.number().int().min(0),
});

const openBody = z.object({
  stationId: z.string().min(1),
  tariffId: z.string().nullable().default(null),
  customerId: z.string().nullable().default(null),
  paymentMode: z.enum(['PREPAID', 'POSTPAID']),
  gamepads: z.number().int().min(1).max(8).default(2),
  creditLimit: z.number().int().min(0).optional(),
  prepaidMinutes: z.number().int().min(1).nullable().default(null),
  note: z.string().nullable().default(null),
});

/** Ochiq smenani qaytaradi. Smenasiz pul operatsiyasi bo'lmaydi — TZ M4.1. */
async function currentShift(clubId: string) {
  const shift = await prisma.shift.findFirst({ where: { clubId, status: 'OPEN' } });
  if (!shift) fail('Smena ochilmagan — avval smenani oching.');
  return shift;
}

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  // Har bir muvaffaqiyatli o'zgartirishdan keyin ochiq interfeyslar yangilanadi.
  app.addHook('onResponse', async (req, reply) => {
    if (req.method === 'GET' || reply.statusCode >= 400) return;
    broadcast();
  });

  app.get('/api/map', async (req) => ({
    stations: await listStations(req.user.clubId),
    shift: await prisma.shift.findFirst({ where: { clubId: req.user.clubId, status: 'OPEN' } }),
    serverTime: new Date().toISOString(),
  }));

  app.post('/api/sessions', async (req) => {
    const body = openBody.parse(req.body);
    const shift = await currentShift(req.user.clubId);
    return openSession({ ...body, operatorId: req.user.sub, shiftId: shift.id });
  });

  app.get('/api/sessions/:id', async (req) => sessionDetail(idParam.parse(req.params).id));

  app.post('/api/sessions/:id/pause', async (req) => {
    const body = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    await pauseSession(idParam.parse(req.params).id, req.user.sub, body.reason);
    return { ok: true };
  });

  app.post('/api/sessions/:id/resume', async (req) => {
    await resumeSession(idParam.parse(req.params).id, req.user.sub);
    return { ok: true };
  });

  app.post('/api/sessions/:id/move', async (req) => {
    const body = z.object({ stationId: z.string().min(1) }).parse(req.body);
    await moveSession(idParam.parse(req.params).id, body.stationId, req.user.sub);
    return { ok: true };
  });

  app.post('/api/sessions/:id/items', async (req) => {
    const body = z.object({ productId: z.string().min(1), qty: z.number().int().min(1) }).parse(req.body);
    const shift = await currentShift(req.user.clubId);
    const id = idParam.parse(req.params).id;
    await addItem(id, body.productId, body.qty, { userId: req.user.sub, shiftId: shift.id });
    return sessionDetail(id);
  });

  app.delete('/api/sessions/:id/items/:itemId', async (req) => {
    const params = z.object({ id: z.string().min(1), itemId: z.string().min(1) }).parse(req.params);
    await removeItem(params.itemId, req.user.sub);
    return sessionDetail(params.id);
  });

  app.post('/api/sessions/:id/pay', async (req) => {
    const body = z.object({ payments: z.array(paymentSchema).min(1) }).parse(req.body);
    const shift = await currentShift(req.user.clubId);
    const id = idParam.parse(req.params).id;
    await paySession(id, body.payments, { userId: req.user.sub, shiftId: shift.id });
    return sessionDetail(id);
  });

  app.post('/api/sessions/:id/close', async (req) => {
    const body = z
      .object({
        payments: z.array(paymentSchema).default([]),
        discount: z.number().int().min(0).default(0),
        gamepadsReturned: z.number().int().min(0).nullable().default(null),
      })
      .parse(req.body ?? {});
    const shift = await currentShift(req.user.clubId);

    return closeSession({
      sessionId: idParam.parse(req.params).id,
      payments: body.payments,
      discount: body.discount,
      gamepadsReturned: body.gamepadsReturned,
      userId: req.user.sub,
      shiftId: shift.id,
    });
  });

  // Bekor qilish — faqat administrator (TZ 3-bo'lim).
  app.post('/api/sessions/:id/cancel', async (req, reply) => {
    if (!requireManager(req, reply)) return;
    const body = z.object({ reason: z.string().min(1) }).parse(req.body);
    await cancelSession(idParam.parse(req.params).id, body.reason, req.user.sub);
    return { ok: true };
  });

  // Tez kassa — o'yinsiz sotuv (TZ M3.2). Bir nechta mahsulot birga sotiladi.
  app.post('/api/sales', async (req) => {
    const body = z
      .object({
        items: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1) })).min(1),
        payments: z.array(paymentSchema).default([]),
      })
      .parse(req.body);
    const shift = await currentShift(req.user.clubId);

    // Qoldiq yetmasa addItem xato beradi va keyingilari yozilmaydi.
    for (const item of body.items) {
      await addItem(null, item.productId, item.qty, { userId: req.user.sub, shiftId: shift.id });
    }
    for (const payment of body.payments) {
      if (payment.amount <= 0) continue;
      await prisma.payment.create({
        data: {
          shiftId: shift.id,
          operatorId: req.user.sub,
          method: payment.method,
          amount: payment.amount,
          note: 'Tez kassa',
        },
      });
    }
    return { ok: true };
  });

  app.get('/api/products', async (req) =>
    prisma.product.findMany({
      where: { clubId: req.user.clubId, isActive: true },
      include: { category: { select: { name: true } } },
      orderBy: [{ isQuickKey: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    }),
  );
}
