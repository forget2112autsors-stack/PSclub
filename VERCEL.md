# Vercel'ga chiqarish

## Nima o'zgardi va nima uchun

Vercel **serversiz** platforma: doimiy ishlab turadigan jarayon yo'q, har bir
so'rovga funksiya uyg'onadi, javob beradi va o'chadi. Shu sababli uchta narsa
qayta yozildi:

| Nima | Ilgari | Vercel'da |
|---|---|---|
| Telegram bot | uzoq so'rov (polling) | webhook — Telegram o'zi murojaat qiladi |
| Jonli yangilanish | SSE, darhol | har 2 soniyada tekshiriladi |
| Kunlik xulosa | ichki taymer | Vercel Cron |
| PIN urinishlari | xotirada | bazada (`bot_state`) |

**Jonli yangilanish sekinlashdi.** Ilgari o'zgarish darhol ko'rinardi, endi
2 soniyagacha kechikadi. TZ 9-bo'limidagi chegaraga sig'adi, lekin bu orqaga
qadam. Mijoz har 2 soniyada arzon `/api/revision` so'rovini yuboradi va
faqat haqiqatan o'zgarish bo'lganda ma'lumotni qayta yuklaydi.

**Mahalliy rejim saqlanib qoldi.** `BOSHLASH.bat` avvalgidek ishlaydi:
polling, SSE va ichki taymer bilan. Ya'ni klub kompyuterida ishlatish ham,
Vercel ham bir xil koddan ishlaydi.

## Muhit o'zgaruvchilari (Vercel → Settings → Environment Variables)

```
DATABASE_URL              Supabase session pooler (port 5432)
DIRECT_URL                o'sha qiymat — migratsiya uchun
JWT_SECRET                uzun tasodifiy matn
TELEGRAM_BOT_TOKEN        @BotFather bergan token
TELEGRAM_WEBHOOK_SECRET   o'zingiz o'ylab topgan uzun matn
TELEGRAM_DAILY_HOUR       9
CRON_SECRET               uzun tasodifiy matn (cron'ni himoyalash uchun)
PSKLUB_CLUB_NAME          PS Klub
```

`.env` faylini Vercel'ga yuklamang — u git'ga tushmaydi va tushmasligi kerak.
Qiymatlarni saytdagi shaklga qo'lda kiritasiz.

## Funksiya hududi

Vercel → Settings → Functions → Region: bazaga eng yaqin hududni tanlang.
Supabase hozir **ap-northeast-1 (Tokio)** da, demak Vercel'da ham Tokio
(`hnd1`) tanlang. Aks holda har bir baza so'rovi okean osha ketadi.

O'lchangan: API baza bilan bir hududda bo'lsa so'rov ~1 ms, boshqa qit'ada
bo'lsa ~200 ms. Bir sahifa 5-6 so'rov yuboradi.

## Chiqarish tartibi

1. Kodni GitHub'ga yuklang (repozitoriy **yopiq** bo'lsin — TZ va narxlar ichida)
2. Vercel'da **Add New → Project** → repozitoriyni tanlang
3. Muhit o'zgaruvchilarini kiriting (yuqoridagi ro'yxat)
4. Deploy
5. Telegram webhook'ni ulang — bir marta, brauzerdan ochib:
   `https://<loyihangiz>.vercel.app/api/telegram-setup`
   (yoki quyidagi buyruq bilan)

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<loyiha>.vercel.app/api/telegram&secret_token=<SECRET>"
```

## Bilib qo'yish kerak

**Bepul tarif tijorat uchun emas.** Vercel Hobby shartlarida tijorat loyihasi
taqiqlangan. Klub biznesi uchun Pro kerak — oyiga $20.

**Sovuq start.** Uzoq vaqt so'rov bo'lmasa birinchi murojaat sekinroq
bajariladi (funksiya uyg'onishi kerak). Klub ish vaqtida bu sezilmaydi.

**Migratsiya avtomatik qo'llanmaydi.** Sxema o'zgarsa `npx prisma migrate
deploy` ni o'zingiz (yoki men) ishga tushirishimiz kerak — Vercel buni
qilmaydi.
