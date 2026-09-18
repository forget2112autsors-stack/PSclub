import type {
  CalcInput,
  CalcResult,
  Interval,
  Rounding,
  Segment,
  Tariff,
} from './types.ts';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 1440;

/** Yaxlitlash — TZ BQ-2. Uchala qoida ham yuqoriga yaxlitlaydi. */
export function roundMinutes(minutes: number, rounding: Rounding): number {
  if (minutes <= 0) return 0;
  switch (rounding) {
    case 'MINUTE':
      return Math.ceil(minutes);
    case 'QUARTER':
      return Math.ceil(minutes / 15) * 15;
    case 'HOUR':
      return Math.ceil(minutes / 60) * 60;
  }
}

/**
 * Pult koeffitsienti — TZ M2.1. Aniq mos kelmasa, undan kichik eng yaqin
 * qiymat olinadi: 5 pult uchun narx belgilanmagan bo'lsa 4 pultniki ishlaydi.
 */
export function gamepadMultiplier(map: Record<string, number>, gamepads: number): number {
  const exact = map[String(gamepads)];
  if (typeof exact === 'number') return exact;

  let best: number | null = null;
  for (const [key, value] of Object.entries(map)) {
    const count = Number(key);
    if (Number.isFinite(count) && count <= gamepads && (best === null || count > best)) {
      best = count;
    }
  }
  return best === null ? 100 : map[String(best)];
}

function localMinuteOfDay(instant: Date, tzOffsetMinutes: number): number {
  const shifted = instant.getTime() + tzOffsetMinutes * MS_PER_MINUTE;
  const minutes = Math.floor(shifted / MS_PER_MINUTE);
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function localDayOfWeek(instant: Date, tzOffsetMinutes: number): number {
  const shifted = new Date(instant.getTime() + tzOffsetMinutes * MS_PER_MINUTE);
  return shifted.getUTCDay();
}

function windowCovers(
  window: { daysOfWeek: number[]; startMinute: number; endMinute: number },
  day: number,
  minute: number,
): boolean {
  if (window.daysOfWeek.length > 0 && !window.daysOfWeek.includes(day)) return false;
  // end <= start — oyna yarim tunni kesib o'tadi (22:00–09:00).
  if (window.startMinute < window.endMinute) {
    return minute >= window.startMinute && minute < window.endMinute;
  }
  return minute >= window.startMinute || minute < window.endMinute;
}

function resolveTariff(
  tariffs: Tariff[],
  stationTypeId: string,
  instant: Date,
  tzOffsetMinutes: number,
): Tariff | null {
  const day = localDayOfWeek(instant, tzOffsetMinutes);
  const minute = localMinuteOfDay(instant, tzOffsetMinutes);

  let winner: Tariff | null = null;
  for (const tariff of tariffs) {
    if (tariff.kind !== 'HOURLY') continue;
    if (tariff.stationTypeId !== null && tariff.stationTypeId !== stationTypeId) continue;
    if (!tariff.windows.some((w) => windowCovers(w, day, minute))) continue;

    if (winner === null || tariff.priority > winner.priority) {
      winner = tariff;
      continue;
    }
    // Ustuvorlik teng bo'lsa joy turiga aniq bog'langan tarif yutadi: "barcha
    // turlar" uchun yozilgan umumiy tarif aniqrog'ini bosib ketmasligi kerak.
    // Aks holda qaysi biri ishlashi bazadagi tartibga bog'lib qolardi.
    if (
      tariff.priority === winner.priority &&
      winner.stationTypeId === null &&
      tariff.stationTypeId !== null
    ) {
      winner = tariff;
    }
  }
  return winner;
}

/** Pauzalarni chegirib, faqat haqiqatda o'ynalgan oraliqlarni qaytaradi. */
export function activeIntervals(start: Date, end: Date, pauses: Interval[] = []): Interval[] {
  const clamped = pauses
    .map((p) => ({
      start: new Date(Math.max(p.start.getTime(), start.getTime())),
      end: new Date(Math.min(p.end.getTime(), end.getTime())),
    }))
    .filter((p) => p.end.getTime() > p.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: Interval[] = [];
  for (const pause of clamped) {
    const last = merged[merged.length - 1];
    if (last && pause.start.getTime() <= last.end.getTime()) {
      if (pause.end.getTime() > last.end.getTime()) last.end = pause.end;
    } else {
      merged.push({ start: pause.start, end: pause.end });
    }
  }

  const result: Interval[] = [];
  let cursor = start;
  for (const pause of merged) {
    if (pause.start.getTime() > cursor.getTime()) {
      result.push({ start: cursor, end: pause.start });
    }
    if (pause.end.getTime() > cursor.getTime()) cursor = pause.end;
  }
  if (end.getTime() > cursor.getTime()) result.push({ start: cursor, end });
  return result;
}

interface Slice {
  instant: Date;
  minutes: number;
}

function buildSlices(intervals: Interval[]): Slice[] {
  const slices: Slice[] = [];
  for (const interval of intervals) {
    const totalMs = interval.end.getTime() - interval.start.getTime();
    if (totalMs <= 0) continue;

    const whole = Math.floor(totalMs / MS_PER_MINUTE);
    for (let i = 0; i < whole; i++) {
      slices.push({
        instant: new Date(interval.start.getTime() + i * MS_PER_MINUTE),
        minutes: 1,
      });
    }
    const remainder = totalMs - whole * MS_PER_MINUTE;
    if (remainder > 0) {
      slices.push({
        instant: new Date(interval.start.getTime() + whole * MS_PER_MINUTE),
        minutes: remainder / MS_PER_MINUTE,
      });
    }
  }
  return slices;
}

function hourlyAmount(tariff: Tariff, billedMinutes: number, gamepads: number): number {
  const multiplier = gamepadMultiplier(tariff.gamepadMultipliers, gamepads);
  return Math.round((billedMinutes / 60) * tariff.pricePerHour * (multiplier / 100));
}

/**
 * Seansning o'yin summasini hisoblaydi — TZ BQ-1.
 *
 * Bufet, chegirma va to'lovlar bu yerga kirmaydi: modul faqat vaqt va tarifni
 * biladi, shuning uchun bazasiz sinaladi (TZ 2.3).
 */
export function calculateSession(input: CalcInput): CalcResult {
  const warnings: string[] = [];
  const intervals = activeIntervals(input.start, input.end, input.pauses);
  const slices = buildSlices(intervals);
  const activeMinutes = slices.reduce((sum, s) => sum + s.minutes, 0);

  const empty: CalcResult = {
    segments: [],
    gameAmount: 0,
    activeMinutes: 0,
    billedMinutes: 0,
    warnings,
  };
  if (slices.length === 0) return empty;

  const segments: Segment[] = [];
  let rest = slices;

  const pkg = input.packageTariffId
    ? (input.tariffs.find((t) => t.id === input.packageTariffId) ?? null)
    : null;

  if (input.packageTariffId && pkg === null) {
    warnings.push('Tanlangan paket tarif topilmadi — soatlik tarif bo\'yicha hisoblandi.');
  }

  if (pkg && pkg.kind === 'PACKAGE' && pkg.packageMinutes && pkg.packagePrice !== null) {
    let covered = 0;
    let index = 0;
    while (index < rest.length && covered < pkg.packageMinutes) {
      covered += rest[index].minutes;
      index++;
    }
    const consumed = rest.slice(0, index);
    const rawMinutes = consumed.reduce((sum, s) => sum + s.minutes, 0);

    segments.push({
      tariffId: pkg.id,
      tariffName: pkg.name,
      kind: 'PACKAGE',
      start: consumed[0].instant,
      end: new Date(
        consumed[consumed.length - 1].instant.getTime() +
          consumed[consumed.length - 1].minutes * MS_PER_MINUTE,
      ),
      rawMinutes,
      billedMinutes: rawMinutes,
      amount: pkg.packagePrice,
    });
    rest = rest.slice(index);
  }

  // Minimal vaqt butun seansga qo'llanadi, har bir bo'lakka alohida emas —
  // aks holda tarif chegarasini kesib o'tgan qisqa seans ikki marta
  // minimal to'lardi. Paket olingan bo'lsa minimal vaqt qo'llanmaydi.
  if (segments.length === 0 && rest.length > 0) {
    const dominant = dominantTariff(rest, input);
    if (dominant && activeMinutes < dominant.minMinutes) {
      const billedMinutes = dominant.minMinutes;
      return {
        segments: [
          {
            tariffId: dominant.id,
            tariffName: dominant.name,
            kind: 'HOURLY',
            start: input.start,
            end: input.end,
            rawMinutes: activeMinutes,
            billedMinutes,
            amount: hourlyAmount(dominant, billedMinutes, input.gamepads),
          },
        ],
        gameAmount: hourlyAmount(dominant, billedMinutes, input.gamepads),
        activeMinutes,
        billedMinutes,
        warnings,
      };
    }
  }

  let current: { tariff: Tariff | null; start: Date; end: Date; rawMinutes: number } | null = null;
  const flush = () => {
    if (!current) return;
    const { tariff, rawMinutes } = current;
    if (tariff === null) {
      segments.push({
        tariffId: '',
        tariffName: 'Tarif topilmadi',
        kind: 'HOURLY',
        start: current.start,
        end: current.end,
        rawMinutes,
        billedMinutes: 0,
        amount: 0,
      });
    } else {
      const billedMinutes = roundMinutes(rawMinutes, tariff.rounding);
      segments.push({
        tariffId: tariff.id,
        tariffName: tariff.name,
        kind: 'HOURLY',
        start: current.start,
        end: current.end,
        rawMinutes,
        billedMinutes,
        amount: hourlyAmount(tariff, billedMinutes, input.gamepads),
      });
    }
    current = null;
  };

  for (const slice of rest) {
    const tariff = resolveTariff(input.tariffs, input.stationTypeId, slice.instant, input.tzOffsetMinutes);
    const sliceEnd = new Date(slice.instant.getTime() + slice.minutes * MS_PER_MINUTE);

    if (current && current.tariff?.id === tariff?.id && current.end.getTime() === slice.instant.getTime()) {
      current.rawMinutes += slice.minutes;
      current.end = sliceEnd;
    } else {
      flush();
      current = { tariff, start: slice.instant, end: sliceEnd, rawMinutes: slice.minutes };
    }
  }
  flush();

  if (segments.some((s) => s.tariffId === '')) {
    warnings.push('Seansning bir qismiga mos tarif topilmadi — o\'sha vaqt hisobga olinmadi.');
  }

  return {
    segments,
    gameAmount: segments.reduce((sum, s) => sum + s.amount, 0),
    activeMinutes,
    billedMinutes: segments.reduce((sum, s) => sum + s.billedMinutes, 0),
    warnings,
  };
}

/** Seansning eng katta qismini egallagan tarif — minimal vaqtni shu belgilaydi. */
function dominantTariff(slices: Slice[], input: CalcInput): Tariff | null {
  const totals = new Map<string, { tariff: Tariff; minutes: number }>();
  for (const slice of slices) {
    const tariff = resolveTariff(input.tariffs, input.stationTypeId, slice.instant, input.tzOffsetMinutes);
    if (!tariff) continue;
    const entry = totals.get(tariff.id);
    if (entry) entry.minutes += slice.minutes;
    else totals.set(tariff.id, { tariff, minutes: slice.minutes });
  }

  let best: { tariff: Tariff; minutes: number } | null = null;
  for (const entry of totals.values()) {
    if (best === null || entry.minutes > best.minutes) best = entry;
  }
  return best?.tariff ?? null;
}
