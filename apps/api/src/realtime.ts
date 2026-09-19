import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';

import { prisma } from './db.ts';

const clients = new Set<ServerResponse>();

/**
 * Barcha ochiq interfeyslarga "yangilan" signali.
 *
 * Ma'lumotning o'zi yuborilmaydi — mijoz o'zi qayta so'raydi. Shunday qilinsa
 * huquq tekshiruvi bitta joyda qoladi va xabar tarkibi eskirib qolmaydi.
 * Shu sababli bir tomonlama SSE yetarli: Socket.IO ning ikki tomonlama
 * imkoniyatlari bu yerda ishlatilmasdi.
 */
export function broadcast(event = 'refresh'): void {
  const payload = `event: ${event}\ndata: ${Date.now()}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * O'zgarish belgisi — mijoz shuni kuzatib turadi.
   *
   * Har bir amal audit jurnaliga yozadi, shuning uchun eng oxirgi yozuv
   * vaqti butun tizim uchun ishonchli "versiya" bo'lib xizmat qiladi.
   * Bitta indeksli so'rov — xaritani har safar to'liq qayta yuklashdan
   * ancha arzon.
   */
  app.get('/api/revision', async () => {
    const [oxirgi, ochiq] = await Promise.all([
      prisma.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      prisma.session.count({ where: { status: { in: ['ACTIVE', 'PAUSED'] } } }),
    ]);
    return { rev: `${oxirgi?.createdAt.getTime() ?? 0}:${ochiq}` };
  });

  app.get('/api/stream', (req, reply) => {
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // Reverse proxy oqimni buferlab qo'ymasin.
      'X-Accel-Buffering': 'no',
    });
    res.write(': ulandi\n\n');
    clients.add(res);

    // Oraliq proksilar jim turgan ulanishni uzib yuboradi.
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        /* yopilgan */
      }
    }, 25_000);

    req.raw.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
  });
}
