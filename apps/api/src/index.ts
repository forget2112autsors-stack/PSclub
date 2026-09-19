// Mahalliy server — klub kompyuterida yoki VPS da doimiy ishlaydi.
// Vercel uchun alohida kirish nuqtasi bor: api/index.ts
import { env } from './env.ts';
import { buildApp } from './app.ts';
import { startTelegram } from './telegram.ts';

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`PS Klub: http://localhost:${env.PORT}`);

  // Uzoq so'rov (long polling) rejimi — faqat doimiy ishlaydigan serverda.
  // Vercel'da bot webhook orqali ishlaydi.
  await startTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_DAILY_HOUR);
  if (env.TELEGRAM_BOT_TOKEN) app.log.info('Telegram bot ulandi (polling).');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
