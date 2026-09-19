// VERCEL / Cloud deployment setup endpoint for Telegram Webhook
import type { IncomingMessage, ServerResponse } from 'node:http';
import { setupWebhook } from '../apps/api/src/telegram.ts';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'TELEGRAM_BOT_TOKEN muhit o\'zgaruvchisi kiritilmagan.' }));
    return;
  }

  const host = req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const webhookUrl = process.env.APP_URL
    ? `${process.env.APP_URL.replace(/\/+$/, '')}/api/telegram`
    : `${proto}://${host}/api/telegram`;

  try {
    await setupWebhook(token, webhookUrl, secret || 'psklub-secret');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: true,
      message: 'Telegram webhook va buyruqlar muvaffaqiyatli sozlandi.',
      webhookUrl,
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : 'Kutilmagan xatolik.',
    }));
  }
}
