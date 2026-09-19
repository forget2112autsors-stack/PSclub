import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { bookingState, freeSlots, isHeldByBooking } from '../src/index.ts';

const TZ = 300; // Toshkent, UTC+5
const H = (h: number) => h * 60;

/** Toshkent mahalliy vaqtidan UTC Date. */
const local = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 8, day, hour, minute) - TZ * 60_000);

// --------------------------------------------------------- BQ-5: holatlar ---

test('BQ-5: bron vaqtidan ancha oldin joy bo\'sh turadi', () => {
  const bron = local(20, 18);
  assert.equal(bookingState(bron, local(20, 16)), 'FUTURE');
});

test('BQ-5: 15 daqiqa qolganda joy ushlab turiladi', () => {
  const bron = local(20, 18);

  assert.equal(bookingState(bron, local(20, 17, 44)), 'FUTURE');
  assert.equal(bookingState(bron, local(20, 17, 45)), 'HOLDING');
  assert.equal(bookingState(bron, local(20, 18)), 'HOLDING');
});

test('BQ-5: mijoz 15 daqiqa kechiksa bron kuyadi', () => {
  const bron = local(20, 18);

  assert.equal(bookingState(bron, local(20, 18, 14)), 'HOLDING');
  assert.equal(bookingState(bron, local(20, 18, 15)), 'EXPIRED');
  assert.equal(bookingState(bron, local(20, 19)), 'EXPIRED');
});

test('ushlab turish oynasini o\'zgartirish mumkin', () => {
  const bron = local(20, 18);
  const oyna = { holdMinutes: 30, graceMinutes: 5 };

  assert.equal(bookingState(bron, local(20, 17, 35), oyna), 'HOLDING');
  assert.equal(bookingState(bron, local(20, 18, 5), oyna), 'EXPIRED');
});

test('isHeldByBooking faqat ushlab turish oynasida rost', () => {
  const bron = local(20, 18);

  assert.equal(isHeldByBooking(bron, local(20, 16)), false);
  assert.equal(isHeldByBooking(bron, local(20, 17, 50)), true);
  assert.equal(isHeldByBooking(bron, local(20, 18, 30)), false);
});

// ------------------------------------------------------------ Bo'sh vaqtlar --

test('bo\'sh vaqtlar ish vaqti ichida va 30 daqiqalik oraliqda', () => {
  const slots = freeSlots({
    openMinute: H(9),
    closeMinute: H(22),
    now: local(20, 8),
    tzOffsetMinutes: TZ,
  });

  assert.equal(slots.length, 26, '09:00 dan 22:00 gacha 30 daqiqada 26 ta oraliq');
  assert.equal(slots[0].getTime(), local(20, 9).getTime());
  assert.equal(slots.at(-1)!.getTime(), local(20, 21, 30).getTime());
});

test('o\'tib ketgan vaqtlar taklif qilinmaydi', () => {
  const slots = freeSlots({
    openMinute: H(9),
    closeMinute: H(22),
    now: local(20, 15, 10),
    tzOffsetMinutes: TZ,
  });

  assert.equal(slots[0].getTime(), local(20, 15, 30).getTime());
  assert.ok(slots.every((s) => s.getTime() > local(20, 15, 10).getTime()));
});

test('band qilingan vaqt ro\'yxatdan tushadi', () => {
  const band = local(20, 16);
  const slots = freeSlots({
    openMinute: H(9),
    closeMinute: H(22),
    now: local(20, 15),
    tzOffsetMinutes: TZ,
    taken: [band],
  });

  assert.ok(!slots.some((s) => s.getTime() === band.getTime()));
  assert.ok(slots.some((s) => s.getTime() === local(20, 16, 30).getTime()));
});

test('yarim tundan keyin yopiladigan klub uchun ham ishlaydi', () => {
  // 09:00 dan ertangi 02:00 gacha
  const slots = freeSlots({
    openMinute: H(9),
    closeMinute: H(2),
    now: local(20, 8),
    tzOffsetMinutes: TZ,
  });

  assert.equal(slots.at(-1)!.getTime(), local(21, 1, 30).getTime());
});
