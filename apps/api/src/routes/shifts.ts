import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { fail } from '../errors.ts';
import { requireAuth } from '../auth.ts';
import { addExpense, closeShift, currentShift, openShift, shiftSummary } from '../services/shift.ts';

export async function shiftRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  app.get('/api/shifts/current', async (req) => {
    const shift = await currentShift(req.user.clubId);
    return shift ? shiftSummary(shift.id) : { shift: null };
  });

  app.post('/api/shifts/open', async (req) => {
    const body = z.object({ openingCash: z.number().int().min(0).default(0) }).parse(req.body ?? {});
    const shift = await openShift(req.user.clubId, req.user.sub, body.openingCash);
    return shiftSummary(shift.id);
  });

  app.post('/api/shifts/close', async (req) => {
    const body = z
      .object({
        countedCash: z.number().int().min(0),
        note: z.string().nullable().default(null),
      })
      .parse(req.body);

    const shift = await currentShift(req.user.clubId);
    if (!shift) fail('Ochiq smena yo\'q.');

    return closeShift({
      shiftId: shift.id,
      countedCash: body.countedCash,
      note: body.note,
      userId: req.user.sub,
    });
  });

  app.post('/api/expenses', async (req) => {
    const body = z
      .object({
        category: z.string().min(1),
        amount: z.number().int().min(1),
        note: z.string().nullable().default(null),
      })
      .parse(req.body);

    const shift = await currentShift(req.user.clubId);
    if (!shift) fail('Smena ochilmagan.');

    return addExpense({
      shiftId: shift.id,
      operatorId: req.user.sub,
      category: body.category,
      amount: body.amount,
      note: body.note,
    });
  });
}
