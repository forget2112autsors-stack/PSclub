// Vercel serversiz kirish nuqtasi.
//
// Barcha /api/* so'rovlari shu funksiyaga keladi va Fastify ga uzatiladi.
// Statik fayllarni Vercel o'zi tarqatadi, shuning uchun serveStatic: false.
import type { IncomingMessage, ServerResponse } from 'node:http';

let ready: Promise<any> | null = null;

async function getApp() {
  const { buildApp } = await import('../apps/api/src/app.ts');
  return buildApp({ serveStatic: false });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Vercel rewrites (/api/(.*) -> /api/index) da asl yo'lni tiklash:
  if (req.headers['x-matched-path']) {
    req.url = req.headers['x-matched-path'] as string;
  }

  try {
    ready ??= getApp();
    const app = await ready;

    await new Promise<void>((resolve, reject) => {
      res.on('finish', resolve);
      res.on('close', resolve);
      res.on('error', reject);
      app.server.emit('request', req, res);
    });
  } catch (err: unknown) {
    ready = null; // Xatolik yuz bersa, keyingi so'rov qayta urinishi uchun
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Vercel API Error]:', message);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: false,
          error: 'Serverless funksiyada xatolik yuz berdi.',
          message,
          hint: 'Agar muhit o\'zgaruvchilari yetishmayotgan bo\'lsa, Vercel Dashboard -> Settings -> Environment Variables orqali DATABASE_URL va JWT_SECRET parametrlarini kiriting.',
        }),
      );
    }
  }
}
