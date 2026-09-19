import { Bot } from 'grammy';

import { prisma, audit } from './db.ts';
import { verifyPin } from './auth.ts';
import { currentShift, shiftSummary } from './services/shift.ts';
import { listStations } from './services/session.ts';
import { dailyReport } from './services/report.ts';
import {
  createBooking,
  customerSummary,
  findOrCreateByPhone,
  heldStationIds,
} from './services/customer.ts';
import { freeSlots } from '@psklub/domain';

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

  // Mijoz buyruqlari PIN ishlovchisidan OLDIN turishi shart: quyidagi
  // message:text hamma matnni ushlaydi va zanjirni to'xtatadi.
  registerCustomerFlow(bot);

  bot.on('message:text', async (ctx, next) => {
    const chatId = String(ctx.chat.id);
    // PIN kutilmayotgan bo'lsa — xabarni keyingi ishlovchiga uzatamiz.
    if (!awaitingPin.has(chatId)) return next();

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
    { command: 'mijoz', description: 'Mijoz sifatida ro\'yxatdan o\'tish' },
    { command: 'joylar', description: 'Hozir bo\'sh joylar' },
    { command: 'bron', description: 'Joy band qilish' },
    { command: 'balans', description: 'Balans va paketlar' },
    { command: 'tarix', description: 'Oxirgi seanslar' },
    { command: 'hozir', description: 'Klub holati (xodimlar uchun)' },
    { command: 'hisobot', description: 'Kechagi kun (xodimlar uchun)' },
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

// ============================================================== Mijozlar ===
// TZ M7.2. Xodimlar PIN bilan ulanadi, mijoz esa telefon raqami bilan —
// mijozda PIN yo'q va bo'lmasligi ham kerak.

const KUNLAR = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];

async function club() {
  return prisma.club.findFirstOrThrow();
}

/** Telegram foydalanuvchisi qaysi mijoz ekanini topadi. */
async function customerOf(telegramId: string) {
  return prisma.customer.findFirst({ where: { telegramId } });
}

function soat(d: Date, tz: number): string {
  const local = new Date(d.getTime() + tz * 60_000);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
}

function kun(d: Date, tz: number): string {
  const local = new Date(d.getTime() + tz * 60_000);
  return `${KUNLAR[local.getUTCDay()]} ${local.getUTCDate()}.${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

function registerCustomerFlow(instance: Bot): void {
  instance.command('mijoz', async (ctx) => {
    const existing = await customerOf(String(ctx.from?.id));
    if (existing) {
      return ctx.reply(
        `Salom, ${existing.fullName}!\n\n/joylar — hozir bo'sh joylar\n/bron — joy band qilish\n/balans — balans va paketlar\n/tarix — oxirgi seanslar`,
      );
    }
    await ctx.reply(
      'Ro\'yxatdan o\'tish uchun telefon raqamingizni yuboring.\nPastdagi tugmani bosing — raqam o\'zi yuboriladi.',
      {
        reply_markup: {
          keyboard: [[{ text: '📱 Raqamimni yuborish', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  });

  instance.on('message:contact', async (ctx) => {
    const contact = ctx.message.contact;
    // Boshqa odamning raqamini yuborishga yo'l qo'ymaymiz.
    if (contact.user_id !== ctx.from.id) {
      return ctx.reply('Iltimos, o\'z raqamingizni yuboring.');
    }

    const c = await club();
    const ism = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'Mijoz';
    const customer = await findOrCreateByPhone(c.id, contact.phone_number, ism, String(ctx.from.id));

    await ctx.reply(
      `Ro'yxatdan o'tdingiz, ${customer.fullName}!\n\n/joylar — hozir bo'sh joylar\n/bron — joy band qilish\n/balans — balans va paketlar\n/tarix — oxirgi seanslar`,
      { reply_markup: { remove_keyboard: true } },
    );
  });

  instance.command('joylar', async (ctx) => {
    const c = await club();
    const stations = await listStations(c.id);
    const held = await heldStationIds(c.id);

    const bosh = stations.filter(
      (s) => !s.session && s.status === 'FREE' && !held.has(s.id),
    );

    if (bosh.length === 0) return ctx.reply('Hozir bo\'sh joy yo\'q. Keyinroq urinib ko\'ring yoki /bron qiling.');

    const tur = new Map<string, number[]>();
    for (const s of bosh) {
      const list = tur.get(s.type) ?? [];
      list.push(s.number);
      tur.set(s.type, list);
    }

    const lines = ['<b>Hozir bo\'sh joylar</b>', ''];
    for (const [name, raqamlar] of tur) lines.push(`${name}: ${raqamlar.join(', ')}-joy`);
    lines.push('', 'Band qilish: /bron');

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  instance.command('balans', async (ctx) => {
    const customer = await customerOf(String(ctx.from?.id));
    if (!customer) return ctx.reply('Avval /mijoz orqali ro\'yxatdan o\'ting.');

    const info = await customerSummary(customer.id);
    const lines = [
      `<b>${customer.fullName}</b>`,
      `Balans: ${summa(customer.balance)} so'm`,
    ];
    if (customer.balance < 0) lines.push(`⚠ Qarz: ${summa(-customer.balance)} so'm`);
    if (customer.bonusPoints > 0) lines.push(`Bonus: ${summa(customer.bonusPoints)}`);

    if (info.packages.length > 0) {
      lines.push('', '<b>Paketlar</b>');
      for (const p of info.packages) {
        const qolgan = `${Math.floor(p.remainingMinutes / 60)} soat ${p.remainingMinutes % 60} daq`;
        lines.push(`${p.name}: ${qolgan}`);
      }
    }
    lines.push('', `Jami tashrif: ${info.sessionCount} marta`);

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  instance.command('tarix', async (ctx) => {
    const customer = await customerOf(String(ctx.from?.id));
    if (!customer) return ctx.reply('Avval /mijoz orqali ro\'yxatdan o\'ting.');

    const info = await customerSummary(customer.id);
    if (info.recentSessions.length === 0) return ctx.reply('Hali seans bo\'lmagan.');

    const c = await club();
    const lines = ['<b>Oxirgi seanslar</b>', ''];
    for (const s of info.recentSessions) {
      lines.push(
        `${kun(s.endedAt!, c.tzOffsetMinutes)} · ${s.station.number}-joy (${s.station.type.name}) · ${summa(s.totalAmount)} so'm`,
      );
    }
    lines.push('', `Jami sarflangan: ${summa(info.totalSpent)} so'm`);

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  instance.command('bron', async (ctx) => {
    const customer = await customerOf(String(ctx.from?.id));
    if (!customer) return ctx.reply('Avval /mijoz orqali ro\'yxatdan o\'ting.');
    if (customer.isBlocked) return ctx.reply('Kechirasiz, sizga bron qilish mumkin emas. Klub bilan bog\'laning.');

    const c = await club();
    const now = new Date();
    const taken = await prisma.booking.findMany({
      where: { station: { clubId: c.id }, status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { gte: now } },
      select: { startsAt: true },
    });

    const slots = freeSlots({
      openMinute: 9 * 60,
      closeMinute: 23 * 60,
      now,
      tzOffsetMinutes: c.tzOffsetMinutes,
      taken: taken.map((t) => t.startsAt),
    }).slice(0, 8);

    if (slots.length === 0) return ctx.reply('Bugun uchun bo\'sh vaqt qolmadi.');

    await ctx.reply('Qaysi vaqtga bron qilamiz?', {
      reply_markup: {
        inline_keyboard: slots.map((s) => [
          { text: `${kun(s, c.tzOffsetMinutes)} ${soat(s, c.tzOffsetMinutes)}`, callback_data: `bron:${s.toISOString()}` },
        ]),
      },
    });
  });

  instance.callbackQuery(/^bron:/, async (ctx) => {
    const customer = await customerOf(String(ctx.from.id));
    if (!customer) {
      await ctx.answerCallbackQuery('Avval /mijoz orqali ro\'yxatdan o\'ting.');
      return;
    }

    const startsAt = new Date(ctx.callbackQuery.data.slice('bron:'.length));
    const c = await club();
    const stations = await listStations(c.id);
    const bosh = stations.find((s) => s.status === 'FREE');

    if (!bosh) {
      await ctx.answerCallbackQuery('Bo\'sh joy qolmadi.');
      return;
    }

    try {
      const booking = await createBooking({
        stationId: bosh.id,
        customerId: customer.id,
        startsAt,
        note: 'Telegram orqali',
      });
      await ctx.answerCallbackQuery('Bron qabul qilindi');
      await ctx.editMessageText(
        [
          '✅ <b>Bron qabul qilindi</b>',
          `${kun(startsAt, c.tzOffsetMinutes)} soat ${soat(startsAt, c.tzOffsetMinutes)}`,
          `${booking.station.number}-joy (${booking.station.type.name})`,
          '',
          'Eslatma: 15 daqiqa kechiksangiz bron bekor bo\'ladi.',
        ].join('\n'),
        { parse_mode: 'HTML' },
      );
      void notifyOwner(
        `📅 <b>Yangi bron</b>\n${customer.fullName} · ${booking.station.number}-joy\n${kun(startsAt, c.tzOffsetMinutes)} ${soat(startsAt, c.tzOffsetMinutes)}`,
      );
    } catch (err) {
      await ctx.answerCallbackQuery(err instanceof Error ? err.message.slice(0, 190) : 'Bron qilinmadi');
    }
  });
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
