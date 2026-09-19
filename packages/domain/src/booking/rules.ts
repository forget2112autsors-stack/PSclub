/** Bron holati — TZ BQ-5. */
export type BookingState =
  /** Hali erta: joy bo'sh, boshqa mijozga berilaveradi. */
  | 'FUTURE'
  /** Joy bron uchun ushlab turiladi — yangi seans ochib bo'lmaydi. */
  | 'HOLDING'
  /** Mijoz kechikdi — bron kuyadi, joy bo'shaydi. */
  | 'EXPIRED';

export interface BookingWindow {
  /** Bron vaqtidan necha daqiqa oldin joy ushlab turiladi. */
  holdMinutes?: number;
  /** Mijoz necha daqiqa kechikishi mumkin. */
  graceMinutes?: number;
}

const MS_PER_MINUTE = 60_000;

/**
 * Bron hozir qaysi holatda — TZ BQ-5.
 *
 * «Bron qilingan joy belgilangan vaqtdan 15 daqiqa oldin band holatiga
 * o'tadi. Mijoz 15 daqiqa kechiksa — bron avtomatik bekor bo'ladi.»
 */
export function bookingState(
  startsAt: Date,
  now: Date,
  window: BookingWindow = {},
): BookingState {
  const hold = window.holdMinutes ?? 15;
  const grace = window.graceMinutes ?? 15;

  const holdFrom = startsAt.getTime() - hold * MS_PER_MINUTE;
  const expiresAt = startsAt.getTime() + grace * MS_PER_MINUTE;
  const t = now.getTime();

  if (t < holdFrom) return 'FUTURE';
  if (t >= expiresAt) return 'EXPIRED';
  return 'HOLDING';
}

/** Shu daqiqada joy bron sababli bandmi. */
export function isHeldByBooking(startsAt: Date, now: Date, window?: BookingWindow): boolean {
  return bookingState(startsAt, now, window) === 'HOLDING';
}

export interface SlotInput {
  /** Klub ish vaqti, kun boshidan daqiqada. */
  openMinute: number;
  closeMinute: number;
  /** Bron oralig'i — masalan har 30 daqiqada. */
  stepMinutes?: number;
  /** Shu vaqtdan oldingi oraliqlar taklif qilinmaydi. */
  now: Date;
  tzOffsetMinutes: number;
  /** Band qilingan bron vaqtlari. */
  taken?: Date[];
}

/**
 * Mijozga taklif qilinadigan bron vaqtlari.
 *
 * O'tib ketgan va allaqachon band qilingan oraliqlar tushirib qoldiriladi.
 * Klub yarim tundan keyin yopilsa (masalan 09:00–02:00) ham to'g'ri ishlaydi.
 */
export function freeSlots(input: SlotInput): Date[] {
  const step = input.stepMinutes ?? 30;
  const offset = input.tzOffsetMinutes * MS_PER_MINUTE;

  // Klub vaqtidagi bugungi kun boshini UTC da topamiz.
  const local = new Date(input.now.getTime() + offset);
  const dayStartUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset;

  const length =
    input.closeMinute > input.openMinute
      ? input.closeMinute - input.openMinute
      : 1440 - input.openMinute + input.closeMinute;

  const takenAt = new Set((input.taken ?? []).map((d) => d.getTime()));
  const slots: Date[] = [];

  for (let m = 0; m < length; m += step) {
    const at = dayStartUtc + (input.openMinute + m) * MS_PER_MINUTE;
    // O'tib ketgan vaqtni taklif qilmaymiz — ushlab turish oynasi ham hisobda.
    if (at <= input.now.getTime()) continue;
    if (takenAt.has(at)) continue;
    slots.push(new Date(at));
  }

  return slots;
}
