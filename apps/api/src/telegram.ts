import { Bot } from 'grammy';

import { prisma, audit } from './db.ts';
import { verifyPin } from './auth.ts';
import { currentShift, shiftSummary } from './services/shift.ts';
import { listStations } from './services/session.ts';
import { dailyReport } from './services/report.ts';

let bot: Bot | null = null;

const summa = (v: number) => v.toLocaleString('uz-UZ');

/** Xabar faqat botga ulangan administrator va egasiga boradi. */
async function recipients(): Promise<string[]> {
  const users = await prisma.appUser.findMany({
    where: { telegramChatId: { not: null }, isActive: true, role: { in: ['ADMIN', 'OWNER'] } },
    select: { telegramChatId: true },
  });
  return users.map((u) => u.telegramChatId!).filter(Boolean);
}

/**
 * Egasiga xabar yuboradi — TZ M7.1.
 *
 * Xatolik yutiladi: Telegram javob bermasa ham klubdagi ish to'xtamasligi
 * kerak. Xabar yuborilmagani audit ga ham yozilmaydi — bu shunchaki
 * bildirishnoma, pul operatsiyasi emas.
 */
export async function notifyOwner(text: string): Promise<void> {
  if (!bot) return;
  for (const chatId of await recipients()) {
    try {
      await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch {
      /* chat yopilgan yoki bot bloklangan */
    }
  }
}

async function statusText(clubId: string): Promise<string> {
  const stations = await listStations(clubId);
  const band = stations.filter((s) => s.session);
  const shift = await currentShift(clubId);

  const lines = [
    `<b>Hozirgi holat</b>`,
    `Band: ${band.length} / ${stations.length} joy`,
  ];

  if (band.length > 0) {
    lines.push('');
    for (const s of band) {
      const soat = Math.floor((s.session!.activeMinutes ?? 0) / 60);
      const daq = Math.round((s.session!.activeMinutes ?? 0) % 60);
      lines.push(
        `${s.number}-joy (${s.type}) · ${soat}:${String(daq).padStart(2, '0')} · ${summa(s.session!.totalAmount)} so'm`,
      );
    }
  }

  if (shift) {
    const sum = await shiftSummary(shift.id);
    lines.push('', `<b>Smena</b>`, `Naqd tushum: ${summa(sum.cashPayments)} so'm`);
    lines.push(`Kassada bo'lishi kerak: ${summa(sum.expectedCash)} so'm`);
  } else {
    lines.push('', 'Smena ochilmagan.');
  }

  return lines.join('\n');
}

async function reportText(clubId: string, date: string): Promise<string> {
  const r = await dailyReport(clubId, date);
  return [
    `<b>Kunlik hisobot — ${date}</b>`,
    '',
    `O'yin:   ${summa(r.gameRevenue)} so'm`,
    `Bufet:   ${summa(r.itemsRevenue + r.quickSales)} so'm`,
    `Jami:    ${summa(r.totalRevenue)} so'm`,
    `Chiqim:  ${summa(r.totalExpenses)} so'm`,
    `<b>Sof:     ${summa(r.net)} so'm</b>`,
    '',
    `Seanslar: ${r.sessionCount} ta`,
    ...r.shifts
      .filter((s) => s.cashDiff !== null && s.cashDiff !== 0)
      .map((s) => `⚠ ${s.operator.fullName}: kassa farqi ${summa(s.cashDiff!)} so'm`),
  ].join('\n');
}

/** Klub vaqti bo'yicha sana (YYYY-MM-DD). */
function clubDate(tzOffsetMinutes: number, daysAgo = 0): string {
  const t = Date.now() + tzOffsetMinutes * 60_000 - daysAgo * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export async function startTelegram(token: string | undefined, dailyHour: number): Promise<void> {
  if (!token) return;

  bot = new Bot(token);
  // PIN kutilayotgan chatlar. Xotirada saqlanadi — server qayta yuklansa
  // foydalanuvchi /start ni qaytadan bosadi, zarari yo'q.
  const awaitingPin = new Set<string>();

  bot.command('start', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const linked = await prisma.appUser.findFirst({ where: { telegramChatId: chatId } });
    if (linked) {
      await ctx.reply(`Siz allaqachon ulangansiz: ${linked.fullName}.\n/hozir — holat\n/hisobot — kecha\n/uzish — ulanishni bekor qilish`);
      return;
    }
    awaitingPin.add(chatId);
    await ctx.reply('Salom! Ulanish uchun PIN-kodingizni yuboring.\nFaqat administrator va egasi ulanadi.');
  });

  bot.command('uzish', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const linked = await prisma.appUser.findFirst({ where: { telegramChatId: chatId } });
    if (!linked) return ctx.reply('Siz ulanmagansiz.');

    await prisma.appUser.update({ where: { id: linked.id }, data: { telegramChatId: null } });
    await ctx.reply('Ulanish uzildi. Qayta ulanish uchun /start.');
  });

  bot.command('hozir', async (ctx) => {
    const user = await prisma.appUser.findFirst({ where: { telegramChatId: String(ctx.chat.id) } });
    if (!user) return ctx.reply('Avval /start orqali ulaning.');
    await ctx.reply(await statusText(user.clubId), { parse_mode: 'HTML' });
  });

  bot.command('hisobot', async (ctx) => {
    const user = await prisma.appUser.findFirst({ where: { telegramChatId: String(ctx.chat.id) } });
    if (!user) return ctx.reply('Avval /start orqali ulaning.');
    const club = await prisma.club.findUniqueOrThrow({ where: { id: user.clubId } });
    await ctx.reply(await reportText(user.clubId, clubDate(club.tzOffsetMinutes, 1)), { parse_mode: 'HTML' });
  });

  bot.on('message:text', async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!awaitingPin.has(chatId)) return;

    const pin = ctx.message.text.trim();
    if (!/^\d{4,8}$/.test(pin)) return ctx.reply('PIN 4-8 ta raqamdan iborat bo\'lishi kerak.');

    const managers = await prisma.appUser.findMany({
      where: { isActive: true, role: { in: ['ADMIN', 'OWNER'] } },
    });
    let matched = null;
    for (const user of managers) {
      if (await verifyPin(pin, user.pinHash)) {
        matched = user;
        break;
      }
    }

    if (!matched) return ctx.reply('PIN-kod noto\'g\'ri.');

    await prisma.appUser.update({ where: { id: matched.id }, data: { telegramChatId: chatId } });
    awaitingPin.delete(chatId);
    await audit({
      userId: matched.id,
      entity: 'AppUser',
      entityId: matched.id,
      action: 'telegram-link',
      isCritical: true,
    });
    await ctx.reply(
      `Ulandi: ${matched.fullName}.\n\n/hozir — shu daqiqadagi holat\n/hisobot — kechagi kun\n/uzish — ulanishni bekor qilish\n\nHar kuni ertalab soat ${dailyHour}:00 da kunlik xulosa keladi.`,
    );
  });

  bot.catch((err) => {
    console.error('[telegram] buyruqni bajarishda xato:', err.message);
  });

  await bot.api.setMyCommands([
    { command: 'hozir', description: 'Shu daqiqadagi holat' },
    { command: 'hisobot', description: 'Kechagi kun xulosasi' },
    { command: 'uzish', description: 'Ulanishni bekor qilish' },
  ]);

  keepPolling(bot);
  startDailyDigest(dailyHour);

  // Polling haqiqatan boshlandimi — bir necha soniyadan keyin tekshiramiz.
  setTimeout(() => {
    console.log(`[telegram] polling holati: ${bot?.isRunning() ? 'ishlayapti' : 'ISHLAMAYAPTI'}`);
  }, 4_000);
}

/** Bot tirikmi — /api/health shuni ko'rsatadi. */
export function telegramStatus(): { enabled: boolean; polling: boolean } {
  return { enabled: bot !== null, polling: bot?.isRunning() ?? false };
}

/**
 * Polling to'xtab qolsa qayta tiklaydi.
 *
 * Ilgari bu `void bot.start()` edi — aloqa uzilib polling o'lsa, xatolik
 * jimgina yutilardi va bot boshqa hech qachon javob bermasdi. Buni faqat
 * "nega bot jim?" deb so'ralgandagina bilib bo'lardi.
 */
function keepPolling(instance: Bot, attempt = 0): void {
  instance
    .start({ drop_pending_updates: true })
    .then(() => {
      console.warn('[telegram] polling to\'xtadi, qayta ulanmoqda...');
      setTimeout(() => keepPolling(instance), 5_000);
    })
    .catch((err: unknown) => {
      const kutish = Math.min(60, 5 * 2 ** attempt);
      console.error(
        `[telegram] polling uzildi: ${err instanceof Error ? err.message : String(err)}. ` +
          `${kutish} soniyadan keyin qayta urinaman.`,
      );
      setTimeout(() => keepPolling(instance, attempt + 1), kutish * 1000);
    });
}

/**
 * Kunlik xulosa — TZ M7.1.
 *
 * Alohida cron kutubxonasi olinmadi: har daqiqada soatni tekshirish yetarli
 * va hech qanday bog'liqlik qo'shmaydi.
 */
function startDailyDigest(hour: number): void {
  let lastSent = '';

  setInterval(() => {
    void (async () => {
      const club = await prisma.club.findFirst();
      if (!club) return;

      const local = new Date(Date.now() + club.tzOffsetMinutes * 60_000);
      if (local.getUTCHours() !== hour) return;

      const today = local.toISOString().slice(0, 10);
      if (lastSent === today) return;
      lastSent = today;

      await notifyOwner(await reportText(club.id, clubDate(club.tzOffsetMinutes, 1)));
    })().catch(() => {
      /* xulosa yuborilmadi — ertaga qayta urinadi */
    });
  }, 60_000);
}
