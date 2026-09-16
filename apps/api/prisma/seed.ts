// Boshlang'ich ma'lumot — `npm run seed`. Qayta ishga tushirsa bo'ladi:
// mavjud yozuvlarga tegmaydi.
//
// Tarif, joy va mahsulotlar ataylab yaratilmaydi — TZ 12-bo'limidagi 1, 2 va 6
// savollar hali ochiq. Soxta "namuna" narxlar bazaga tushsa, keyin ular
// haqiqiysi bilan aralashib ketadi. Ularni Sozlamalar oynasidan kiritasiz.

import { randomInt } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPin } from '../src/auth.ts';

const prisma = new PrismaClient();

function readPin(envName: string): { value: string; generated: boolean } {
  const fromEnv = process.env[envName];
  if (fromEnv) {
    if (!/^\d{4,8}$/.test(fromEnv)) {
      throw new Error(`${envName} 4-8 ta raqamdan iborat bo'lishi kerak.`);
    }
    return { value: fromEnv, generated: false };
  }
  // Standart PIN yo'q: internetga ochiq tizimda "1111" tipidagi qiymat xavfli.
  return { value: String(randomInt(1000, 10000)), generated: true };
}

const staff = [
  { fullName: 'Operator', role: 'OPERATOR' as const, env: 'PSKLUB_OPERATOR_PIN' },
  { fullName: 'Administrator', role: 'ADMIN' as const, env: 'PSKLUB_ADMIN_PIN' },
  { fullName: 'Egasi', role: 'OWNER' as const, env: 'PSKLUB_OWNER_PIN' },
];

const club =
  (await prisma.club.findFirst()) ??
  (await prisma.club.create({ data: { name: process.env.PSKLUB_CLUB_NAME ?? 'PS Klub' } }));

const created: string[] = [];

for (const person of staff) {
  const exists = await prisma.appUser.findFirst({ where: { clubId: club.id, role: person.role } });
  if (exists) continue;

  const pin = readPin(person.env);
  await prisma.appUser.create({
    data: {
      clubId: club.id,
      fullName: person.fullName,
      role: person.role,
      pinHash: await hashPin(pin.value),
    },
  });
  created.push(`  ${person.fullName.padEnd(15)} ${pin.value}${pin.generated ? '  (tasodifiy yaratildi)' : ''}`);
}

for (const [index, name] of ['PS-5', 'PS-3', 'VIP'].entries()) {
  const exists = await prisma.stationType.findFirst({ where: { clubId: club.id, name } });
  if (!exists) {
    await prisma.stationType.create({ data: { clubId: club.id, name, sortOrder: index } });
  }
}

console.log(`\n  Klub: ${club.name}`);
if (created.length > 0) {
  console.log('\n  PIN-kodlar (shu yerda bir marta ko\'rsatiladi):');
  console.log(created.join('\n'));
  console.log('\n  Ularni yozib oling. Boshqa ko\'rsatilmaydi.');
} else {
  console.log('  Xodimlar allaqachon yaratilgan — o\'zgartirilmadi.');
}
console.log('\n  Keyingi qadam: Sozlamalar oynasidan joylar va tariflarni kiriting.\n');

await prisma.$disconnect();
