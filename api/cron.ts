// Kunlik xulosa — Vercel Cron shu yo'lni chaqiradi (vercel.json da jadval).
//
// Serversizda setInterval ishlamaydi: funksiya javob bergach o'chadi.
import type { IncomingMessage, ServerResponse } from 'node:http';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Vercel Cron o'z sarlavhasini yuboradi; tashqaridan chaqirishni to'smaymiz,
  // lekin sir berilgan bo'lsa tekshiramiz.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.statusCode = 401;
    res.end('unauthorized');
    return;
  }

  try {
    const { sendDailyDigest } = await import('../apps/api/src/telegram.ts');
    const yuborildi = await sendDailyDigest();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, yuborildi }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : 'Kutilmagan xatolik.',
      }),
    );
  }
}
