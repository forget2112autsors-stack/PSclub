import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z } from 'zod';

import { env } from './env.ts';
import { prisma, audit } from './db.ts';
import { requireAuth, requireManager, verifyPin, type TokenPayload } from './auth.ts';

const SESSION_TTL = '12h'; // Bir smena — TZ 9-bo'lim.

const app = Fastify({
  logger: { level: env.NODE_ENV === 'production' ? 'warn' : 'info' },
});

await app.register(cors, { origin: true, credentials: true });
await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: SESSION_TTL } });

app.setErrorHandler((err, _req, reply) => {
  if (err.validation) return reply.code(400).send({ error: 'So\'rov maydonlari noto\'g\'ri.' });
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
  if (!parsed.success) return reply.code(400).send({ error: 'PIN-kod noto\'g\'ri.' });

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

app.get('/api/station-types', { onRequest: requireAuth }, async () =>
  prisma.stationType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
);

app.get('/api/stations', { onRequest: requireAuth }, async () =>
  prisma.station.findMany({
    include: { type: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
  }),
);

app.get('/api/tariffs', { onRequest: requireAuth }, async () =>
  prisma.tariff.findMany({
    where: { isActive: true },
    include: { schedules: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  }),
);

app.get('/api/audit', { onRequest: requireAuth }, async (req, reply) => {
  if (!requireManager(req, reply)) return;
  return prisma.auditLog.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { fullName: true } } },
  });
});

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`PS Klub API: http://localhost:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
