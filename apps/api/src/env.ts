import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL to\'ldirilmagan — .env fayliga Supabase ulanish manzilini qo\'ying'),
  DIRECT_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET kamida 16 belgidan iborat bo\'lsin'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Bo'sh bo'lsa bot ishga tushmaydi — tizim baribir ishlayveradi.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_DAILY_HOUR: z.coerce.number().int().min(0).max(23).default(9),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  console.error('Muhit o\'zgaruvchilari noto\'g\'ri:\n' + parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
  if (!process.env.VERCEL) {
    console.error('\n.env.example faylidan nusxa olib, .env ni to\'ldiring.');
    process.exit(1);
  }
  throw new Error(`Muhit o'zgaruvchilari noto'g'ri yoki kiritilmagan: ${issues}. Vercel Environment Variables sozlamalarini tekshiring.`);
}

export const env = parsed.data;
