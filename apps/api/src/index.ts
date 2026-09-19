import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z } from 'zod';

import { env } from './env.ts';
import { prisma, audit } from './db.ts';
import { requireAuth, requireManager, verifyPin, type TokenPayload } from './auth.ts';
import { BusinessError } from './errors.ts';
import { catalogRoutes, settingsRoutes } from './routes/settings.ts';
import { sessionRoutes } from './routes/sessions.ts';
import { shiftRoutes } from './routes/shifts.ts';
import { reportRoutes } from './routes/reports.ts';
import { realtimeRoutes } from './realtime.ts';

const SESSION_TTL = '12h'; // Bir smena — TZ 9-bo'lim.

const app = Fastify({
  logger: { level: env.NODE_ENV === 'production' ? 'warn' : 'info' },
});

await app.register(cors, { origin: true, credentials: true });
await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: SESSION_TTL } });

// Standart parser tanasi bo'sh POST so'rovni rad etadi. Bizda esa tanasiz
// amallar bor (pauzadan davom ettirish) — bo'sh tanani {} deb qabul qilamiz.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  const raw = String(body ?? '').trim();
  if (raw === '') return done(null, {});
  try {
    done(null, JSON.parse(raw));
  } catch {
    const err = new Error('JSON noto\'g\'ri formatda.') as Error & { statusCode?: number };
    err.statusCode = 400;
    done(err, undefined);
  }
});

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof BusinessError) return reply.code(400).send({ error: err.message });
  if (err instanceof z.ZodError) {
    return reply.code(400).send({ error: 'So\'rov maydonlari noto\'g\'ri.' });
  }
  if ((err as { validation?: unknown }).validation) {
    return reply.code(400).send({ error: 'So\'rov maydonlari noto\'g\'ri.' });
  }
  app.log.error(err);
  return reply.code(500).send({ error: 'Kutilmagan xatolik.' });
});

app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));

// PIN oynasi uchun — foydalanuvchilar ro'yxati ochiq, PIN esa yopiq.
app.get('/api/auth/users', async () => {
  const club = await prisma.club.findFirst();
  const users = await prisma.appUser.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, role: true },
    orderBy: { fullName: 'asc' },
  });
  return { club: club?.name ?? null, users };
});

const loginBody = z.object({
  userId: z.string().min(1),
  pin: z.string().min(4).max(8),
});

app.post('/api/auth/login', async (req, reply) => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) return reply.code(401).send({ error: 'PIN-kod noto\'g\'ri.' });

  const user = await prisma.appUser.findUnique({ where: { id: parsed.data.userId } });
  if (!user || !user.isActive || !(await verifyPin(parsed.data.pin, user.pinHash))) {
    // Foydalanuvchi bor-yo'qligini oshkor qilmaslik uchun xabar bir xil.
    return reply.code(401).send({ error: 'PIN-kod noto\'g\'ri.' });
  }

  const payload: TokenPayload = {
    sub: user.id,
    name: user.fullName,
    role: user.role,
    clubId: user.clubId,
  };
  await audit({ userId: user.id, entity: 'AppUser', entityId: user.id, action: 'login' });

  return { token: app.jwt.sign(payload), user: payload };
});

app.get('/api/me', { onRequest: requireAuth }, async (req) => ({ user: req.user }));

await app.register(settingsRoutes);
await app.register(catalogRoutes);
await app.register(sessionRoutes);
await app.register(shiftRoutes);
await app.register(reportRoutes);
await app.register(realtimeRoutes);

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`PS Klub API: http://localhost:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
