// Vercel serversiz kirish nuqtasi.
//
// Barcha /api/* so'rovlari shu funksiyaga keladi va Fastify ga uzatiladi.
// Statik fayllarni Vercel o'zi tarqatadi, shuning uchun serveStatic: false.
import type { IncomingMessage, ServerResponse } from 'node:http';

import { buildApp } from '../apps/api/src/app.ts';

// Funksiya "issiq" qolganda ilova qayta yasalmaydi.
let ready: ReturnType<typeof buildApp> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= buildApp({ serveStatic: false });
  const app = await ready;
  app.server.emit('request', req, res);
}
