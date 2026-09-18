import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { calculateSession, gamepadMultiplier, roundMinutes } from '../src/index.ts';
import type { Tariff } from '../src/index.ts';

// Toshkent vaqti — UTC+5. Baza UTC da saqlaydi (TZ M8).
const TZ = 300;
const PS5 = 'ps5';

const H = (hour: number) => hour * 60;

/** Toshkent mahalliy vaqtidan UTC Date yasaydi. */
function local(day: string, hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 8, Number(day), hour, minute) - TZ * 60_000);
}

function tariff(over: Partial<Tariff> & Pick<Tariff, 'id' | 'name'>): Tariff {
  return {
    kind: 'HOURLY',
    stationTypeId: PS5,
    priority: 0,
    pricePerHour: 40_000,
    minMinutes: 0,
    rounding: 'MINUTE',
    gamepadMultipliers: {},
    packagePrice: null,
    packageMinutes: null,
    windows: [{ daysOfWeek: [], startMinute: 0, endMinute: 0 }],
    ...over,
  };
}

const kunduzi = tariff({
  id: 'kunduzi',
  name: 'PS-5 kunduzi',
  pricePerHour: 40_000,
  windows: [{ daysOfWeek: [], startMinute: H(9), endMinute: H(22) }],
});

const tunda = tariff({
  id: 'tunda',
  name: 'PS-5 tunda',
  pricePerHour: 30_000,
  priority: 10,
  windows: [{ daysOfWeek: [], startMinute: H(22), endMinute: H(9) }],
});

const base = { stationTypeId: PS5, gamepads: 2, tariffs: [kunduzi, tunda], tzOffsetMinutes: TZ };

// ------------------------------------------------------------- Yaxlitlash ---

test('BQ-2: daqiqa qoidasi o\'tgan vaqtni o\'zgartirmaydi', () => {
  assert.equal(roundMinutes(37, 'MINUTE'), 37);
});

test('BQ-2: 15 daqiqalik yaxlitlash yuqoriga qarab ishlaydi (37 → 45)', () => {
  assert.equal(roundMinutes(37, 'QUARTER'), 45);
  assert.equal(roundMinutes(45, 'QUARTER'), 45);
});

test('BQ-2: soatlik yaxlitlashda boshlangan soat to\'liq sanaladi (61 → 120)', () => {
  assert.equal(roundMinutes(61, 'HOUR'), 120);
  assert.equal(roundMinutes(60, 'HOUR'), 60);
});

// --------------------------------------------------------- Oddiy hisobot ---

test('BQ-1: bir tarif ichidagi 2 soatlik seans', () => {
  const result = calculateSession({ ...base, start: local('10', 12), end: local('10', 14) });

  assert.equal(result.segments.length, 1);
  assert.equal(result.activeMinutes, 120);
  assert.equal(result.gameAmount, 80_000);
});

test('BQ-1: yarim soat kunduzgi tarifda', () => {
  const result = calculateSession({ ...base, start: local('10', 12), end: local('10', 12, 30) });
  assert.equal(result.gameAmount, 20_000);
});

// ------------------------------------------------------ QM-6: tarif chegarasi

test('QM-6: 21:00–23:30 seans ikki tarifga bo\'linadi', () => {
  const result = calculateSession({ ...base, start: local('10', 21), end: local('10', 23, 30) });

  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0].tariffId, 'kunduzi');
  assert.equal(result.segments[0].rawMinutes, 60);
  assert.equal(result.segments[1].tariffId, 'tunda');
  assert.equal(result.segments[1].rawMinutes, 90);

  // 1 soat × 40 000 + 1.5 soat × 30 000
  assert.equal(result.gameAmount, 40_000 + 45_000);
});

test('tungi tarif yarim tunni kesib o\'tadi', () => {
  const result = calculateSession({ ...base, start: local('10', 23), end: local('11', 1) });

  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].tariffId, 'tunda');
  assert.equal(result.gameAmount, 60_000);
});

test('M2.3: ustuvorligi yuqori tarif yutadi', () => {
  const aksiya = tariff({
    id: 'aksiya',
    name: 'Tushlik aksiyasi',
    pricePerHour: 20_000,
    priority: 50,
    windows: [{ daysOfWeek: [], startMinute: H(12), endMinute: H(14) }],
  });

  const result = calculateSession({
    ...base,
    tariffs: [kunduzi, tunda, aksiya],
    start: local('10', 12),
    end: local('10', 13),
  });

  assert.equal(result.segments[0].tariffId, 'aksiya');
  assert.equal(result.gameAmount, 20_000);
});

test('ustuvorlik teng bo\'lsa joy turiga bog\'langan tarif yutadi', () => {
  const umumiy = tariff({
    id: 'umumiy',
    name: 'Hamma turlar uchun',
    stationTypeId: null,
    pricePerHour: 30_000,
    windows: [{ daysOfWeek: [], startMinute: H(9), endMinute: H(22) }],
  });

  // Ro'yxat tartibi ikki xil bo'lsa ham natija bir xil bo'lishi kerak.
  for (const list of [[umumiy, kunduzi], [kunduzi, umumiy]]) {
    const result = calculateSession({
      ...base,
      tariffs: list,
      start: local('10', 12),
      end: local('10', 13),
    });
    assert.equal(result.segments[0].tariffId, 'kunduzi');
    assert.equal(result.gameAmount, 40_000);
  }
});

test('umumiy tarif faqat o\'ziga mos tarif bo\'lmaganda ishlaydi', () => {
  const umumiy = tariff({
    id: 'umumiy',
    name: 'Hamma turlar uchun',
    stationTypeId: null,
    pricePerHour: 30_000,
    windows: [{ daysOfWeek: [], startMinute: H(9), endMinute: H(22) }],
  });

  const result = calculateSession({
    ...base,
    stationTypeId: 'boshqa-tur',
    tariffs: [kunduzi, umumiy],
    start: local('10', 12),
    end: local('10', 13),
  });

  assert.equal(result.segments[0].tariffId, 'umumiy');
  assert.equal(result.gameAmount, 30_000);
});

test('hafta kuni mos kelmasa tarif qo\'llanmaydi', () => {
  // 2026-09-12 — Shanba (6). Faqat Dushanba uchun tarif.
  const dushanba = tariff({
    id: 'dushanba',
    name: 'Faqat dushanba',
    windows: [{ daysOfWeek: [1], startMinute: H(9), endMinute: H(22) }],
  });

  const result = calculateSession({
    ...base,
    tariffs: [dushanba],
    start: local('12', 12),
    end: local('12', 13),
  });

  assert.equal(result.gameAmount, 0);
  assert.equal(result.warnings.length, 1);
});

// --------------------------------------------------------- Minimal vaqt ----

test('BQ-1: minimal vaqtdan qisqa seans minimal bo\'yicha olinadi', () => {
  const minli = tariff({ ...kunduzi, minMinutes: 30 });
  const result = calculateSession({
    ...base,
    tariffs: [minli],
    start: local('10', 12),
    end: local('10', 12, 10),
  });

  assert.equal(result.activeMinutes, 10);
  assert.equal(result.billedMinutes, 30);
  assert.equal(result.gameAmount, 20_000);
});

test('minimal vaqt tarif chegarasida ikki marta olinmaydi', () => {
  const kun = tariff({ ...kunduzi, minMinutes: 30 });
  const tun = tariff({ ...tunda, minMinutes: 30 });

  // 21:50–22:10 — ikki tarifni kesib o'tadi, lekin jami 20 daqiqa.
  const result = calculateSession({
    ...base,
    tariffs: [kun, tun],
    start: local('10', 21, 50),
    end: local('10', 22, 10),
  });

  assert.equal(result.billedMinutes, 30);
  assert.equal(result.segments.length, 1);
});

// --------------------------------------------------------------- Pauza -----

test('M1.3: pauzada o\'tgan vaqt hisobga olinmaydi', () => {
  const result = calculateSession({
    ...base,
    start: local('10', 12),
    end: local('10', 15),
    pauses: [{ start: local('10', 13), end: local('10', 14) }],
  });

  assert.equal(result.activeMinutes, 120);
  assert.equal(result.gameAmount, 80_000);
});

test('bir-birining ustiga tushgan pauzalar ikki marta chegirilmaydi', () => {
  const result = calculateSession({
    ...base,
    start: local('10', 12),
    end: local('10', 15),
    pauses: [
      { start: local('10', 13), end: local('10', 14) },
      { start: local('10', 13, 30), end: local('10', 14, 30) },
    ],
  });

  assert.equal(result.activeMinutes, 90);
});

// ---------------------------------------------------------------- Pult -----

test('M2.1: pult koeffitsienti summani oshiradi', () => {
  const t = tariff({ ...kunduzi, gamepadMultipliers: { '2': 100, '3': 130, '4': 160 } });
  const result = calculateSession({
    ...base,
    tariffs: [t],
    gamepads: 3,
    start: local('10', 12),
    end: local('10', 13),
  });

  assert.equal(result.gameAmount, 52_000);
});

test('koeffitsient belgilanmagan pult soni uchun eng yaqin kichigi olinadi', () => {
  assert.equal(gamepadMultiplier({ '2': 100, '4': 160 }, 5), 160);
  assert.equal(gamepadMultiplier({ '2': 100, '4': 160 }, 3), 100);
  assert.equal(gamepadMultiplier({}, 3), 100);
});

// --------------------------------------------------------------- Paket -----

test('M2.2: paket tarif belgilangan summani oladi', () => {
  const paket = tariff({
    id: 'tungi-paket',
    name: 'Tungi paket',
    kind: 'PACKAGE',
    packagePrice: 250_000,
    packageMinutes: H(10),
    windows: [{ daysOfWeek: [], startMinute: H(22), endMinute: H(9) }],
  });

  const result = calculateSession({
    ...base,
    tariffs: [kunduzi, tunda, paket],
    packageTariffId: 'tungi-paket',
    start: local('10', 22),
    end: local('11', 8),
  });

  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].kind, 'PACKAGE');
  assert.equal(result.gameAmount, 250_000);
});

test('paket vaqtidan oshgan vaqt soatlik tarif bilan qo\'shiladi', () => {
  const paket = tariff({
    id: 'paket-2soat',
    name: '2 soatlik paket',
    kind: 'PACKAGE',
    packagePrice: 60_000,
    packageMinutes: 120,
    windows: [{ daysOfWeek: [], startMinute: 0, endMinute: 0 }],
  });

  // 12:00–15:00: 2 soat paket, qolgan 1 soat kunduzgi tarif bilan.
  const result = calculateSession({
    ...base,
    tariffs: [kunduzi, tunda, paket],
    packageTariffId: 'paket-2soat',
    start: local('10', 12),
    end: local('10', 15),
  });

  assert.equal(result.segments.length, 2);
  assert.equal(result.gameAmount, 60_000 + 40_000);
});

test('paket tanlanmasa avtomatik hisobga qo\'shilmaydi', () => {
  const paket = tariff({
    id: 'tungi-paket',
    name: 'Tungi paket',
    kind: 'PACKAGE',
    priority: 99,
    packagePrice: 250_000,
    packageMinutes: H(10),
    windows: [{ daysOfWeek: [], startMinute: H(22), endMinute: H(9) }],
  });

  const result = calculateSession({
    ...base,
    tariffs: [kunduzi, tunda, paket],
    start: local('10', 23),
    end: local('11', 0),
  });

  assert.equal(result.gameAmount, 30_000);
});

// ------------------------------------------------------------ Chegaralar ---

test('teskari yoki nol uzunlikdagi seans nolga teng', () => {
  const result = calculateSession({ ...base, start: local('10', 12), end: local('10', 12) });
  assert.equal(result.gameAmount, 0);
  assert.equal(result.segments.length, 0);
});

test('tarif umuman topilmasa tizim qulamaydi, ogohlantiradi', () => {
  const result = calculateSession({
    ...base,
    tariffs: [],
    start: local('10', 12),
    end: local('10', 13),
  });

  assert.equal(result.gameAmount, 0);
  assert.equal(result.warnings.length, 1);
});

test('boshqa turdagi joyning tarifi qo\'llanmaydi', () => {
  const ps3 = tariff({ id: 'ps3-kun', name: 'PS-3 kunduzi', stationTypeId: 'ps3' });
  const result = calculateSession({
    ...base,
    tariffs: [ps3],
    start: local('10', 12),
    end: local('10', 13),
  });

  assert.equal(result.gameAmount, 0);
});
