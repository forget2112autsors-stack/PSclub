// Telegram webhook — Vercel'da bot shu yo'l orqali xabar oladi.
//
// Uzoq so'rov (polling) serversiz muhitda ishlamaydi: funksiya bir necha
// soniyada o'chadi. Webhook'da esa Telegram o'zi bizga murojaat qiladi.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { webhookCallback } from 'grammy';

import { buildBot } from '../apps/api/src/telegram.ts';

let handlerReady: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    res.statusCode = 401;
    res.end('unauthorized');
    return;
  }

  if (!handlerReady) {
    const bot = await buildBot(process.env.TELEGRAM_BOT_TOKEN, Number(process.env.TELEGRAM_DAILY_HOUR ?? 9));
    if (!bot) {
      res.statusCode = 503;
      res.end('bot sozlanmagan');
      return;
    }
    handlerReady = webhookCallback(bot, 'http');
  }

  await handlerReady(req, res);
}
