import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL to\'ldirilmagan — .env fayliga Supabase ulanish manzilini qo\'ying'),
  DIRECT_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET kamida 16 belgidan iborat bo\'lsin'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Muhit o\'zgaruvchilari noto\'g\'ri:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\n.env.example faylidan nusxa olib, .env ni to\'ldiring.');
  process.exit(1);
}

export const env = parsed.data;
