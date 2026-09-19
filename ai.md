# PS Klub Boshqaruv Tizimi — To'liq Kod Tahlili, Kamchiliklar va Xatolar Hisoboti

Ushbu hujjat **PS Klub** (PlayStation klubini boshqarish tizimi) loyihasining barcha qismlari (`packages/domain`, `apps/api`, `apps/web`, `api/`, arxitektura, xavfsizlik va `TZ.md` talablariga muvofiqligi) to'liq ko'rib chiqilib tuzildi.

---

## MUNDARIJA

1. [Umumiy Xulosa va Loyiha Holati](#1-umumiy-xulosa-va-loyiha-holati)
2. [Kritik va Moliyaviy Xatolar (Critical & Financial Bugs)](#2-kritik-va-moliyaviy-xatolar)
3. [Xavfsizlik Zaifliklari (Security Vulnerabilities)](#3-xavfsizlik-zaifliklari)
4. [Biznes Mantiqi va Hisob-Kitobdagi Xatolar (Business Logic Errors)](#4-biznes-mantiqi-va-hisob-kitobdagi-xatolar)
5. [Frontend (UI/UX) dagi Kamchilik va Xatolar](#5-frontend-uiux-dagi-kamchilik-va-xatolar)
6. [Texnik Vazifa (TZ.md) Talablarining Bajarilmagan Qismlari](#6-texnik-vazifa-tzmd-talablarining-bajarilmagan-qismlari)
7. [Deploy, Vercel va Infratuzilmadagi Muammolar](#7-deploy-vercel-va-infratuzilmadagi-muammolar)
8. [Tuzatishlar Bo'yicha Bosqichma-Bosqich Reja (Action Plan)](#8-tuzatishlar-boyicha-bosqichma-bosqich-reja)

---

## 1. Umumiy Xulosa va Loyiha Holati

Loyiha arxitekturasi yaxshi o'ylangan:
- **`packages/domain`**: Bazadan mustaqil, toza biznes mantiqi (`calculateSession`, `sessionTotals`, `reconcileCash`, `weightedCost`). Ushbu modulda 65 ta avtotest mavjud va barchasi muvaffaqiyatli o'tadi.
- **`apps/api`**: Fastify 5 + Prisma ORM + PostgreSQL.
- **`apps/web`**: React 18 + Vite + TailwindCSS + TanStack Query + Zustand.

Biroq, tizimni ishlab chiqarishga (production) yoki klubda real mijozlar bilan sinovdan o'tkazishga to'sqinlik qiluvchi bir qator **kritik moliyaviy tranzaksiya xatoliklari**, **xavfsizlik teshiklari** va **UI funksiyalarining yetishmasligi** aniqlandi.

---

## 2. Kritik va Moliyaviy Xatolar

### 2.1. `closeSession` da Tranzaksiyasizlik va Mablag' Yo'qotish Xatosi
- **Fayl:** `apps/api/src/services/session.ts` (385–466-qatorlar)
- **Muammo:**
  1. Seans yopilayotganda `session.discount` yangilanadi va `recordPayments` funksiyasi chaqiriladi.
  2. `recordPayments` ichida mijoz balansi (`customer.balance`) darhol kamaytiriladi va `customerBalanceTx` hamda `payment` bazaga yoziladi (tranzaksiyasiz).
  3. Shundan so'ng `computeSession` chaqirilib, `if (!totals.canClose) fail(...)` tekshiriladi (masalan, mehmon seansida to'lov yetarli bo'lmasa yoki boshqa cheklovda).
  4. Natijada: **Xatolik berib seans ochiq qoladi, ammo mijozning balansi allaqachon yechib bo'lingan va to'lov bazada saqlanib qolgan!** Agar operator qayta "Yopish" tugmasini bossa, pul ikkinchi marta yechiladi.
- **Tavsiya:** Seansni yopishdagi barcha operatsiyalar (to'lovlarni tekshirish, balansdan yechish, segmentlarni yozish, seans holatini `CLOSED` ga o'tkazish) yagona `prisma.$transaction` ichida atomik tarzda bajarilishi shart.

### 2.2. Tez Kassa (`/api/sales`) da Tranzaksiyasizlik va 0 So'm bilan Mahsulot Chiqarish
- **Fayl:** `apps/api/src/routes/sessions.ts` (168–194-qatorlar)
- **Muammo:**
  1. `/api/sales` da mahsulotlar tsiklda `addItem` orqali birma-bir ombordan ayriladi. Agar savatdagi 2-mahsulot omborda yetarli bo'lmasa (`fail('Omborda yetarli emas')`), xato otiladi. Lekin 1-mahsulot allaqachon ombordan tushib ketgan va bazada qolgan bo'ladi (Rollback bo'lmaydi).
  2. **To'lov summasi tekshirilmaydi:** `payments: z.array(paymentSchema).default([])`. Agar so'rovda `payments: []` yuborilsa yoki to'lov summasi savat summasidan kam bo'lsa ham tizim xato bermaydi! Operator yoki foydalanuvchi 100 000 so'mlik tovarlarni 0 so'm to'lov bilan sotib yuborishi mumkin.
  3. **Mijoz balansi yechilmaydi:** `paymentSchema` to'lov usuli sifatida `BALANCE` ni qabul qiladi. Lekin tez kassada `customerId` olinmaydi, hech qanday balans tekshirilmaydi va yechilmaydi. Shunchaki `method: 'BALANCE'` deb to'lov saqlanadi.
- **Tavsiya:**
  - Jami to'lov summasi savatdagi tovarlar summasiga teng yoki kattaligini majburiy tekshirish (`sum(payments) >= totalAmount`).
  - Butun sotuv jarayonini (qoldiqlarni kamaytirish va to'lovlarni yozish) bitta Prisma tranzaksiyasiga olish.
  - Agar mijoz tanlanmagan bo'lsa, `BALANCE` to'lov usulini taqiqlash.

### 2.3. Bekor Qilingan Seansda (`cancelSession`) Mahsulotlar va To'lovlarning Taqdiri
- **Fayl:** `apps/api/src/services/session.ts` (511–547-qatorlar)
- **Muammo:**
  Seans bekor qilinganda (`CANCELLED`), uning holati o'zgaradi va joy bo'shaydi. Biroq:
  - Seans davomida olingan bufet mahsulotlari (`orderItem`) omborga qaytarilmaydi (`stockQty` oshirilmaydi).
  - Agar seans uchun oldindan to'lov yoki oraliq to'lovlar qilingan bo'lsa, pullar qaytarilmaydi (mijoz balansiga qaytmaydi yoki kassadan chiqim qilinmaydi).
- **Tavsiya:** Bekor qilinganda seansga biriktirilgan mahsulotlarni omborga qaytarish (`stockMovement: IN`) va qabul qilingan to'lovlar bo'lsa, ularni qaytarish (refund) mexanizmini kiritish.

### 2.4. Seans Yopilganda Ochiq Qolgan Pauza (`SessionPause`)
- **Fayl:** `apps/api/src/services/session.ts` (419–466-qatorlar)
- **Muammo:**
  Agar seans `PAUSED` holatida turganida operator uni yopsa, `sessionPause` jadvalidagi ochiq yozuv (`endedAt: null`) yopilmay qoladi. Garchi seansning o'zi `CLOSED` bo'lsa-da, pauza yozuvining `endedAt` ustuni doimiy `null` bo'lib qoladi.
- **Tavsiya:** `closeSession` tranzaksiyasi ichida `prisma.sessionPause.updateMany({ where: { sessionId: session.id, endedAt: null }, data: { endedAt } })` chaqirilishi kerak.

### 2.5. Bir Vaqtda Bir Nechta Smena Ochilishi (Race Condition)
- **Fayl:** `apps/api/src/services/shift.ts` (13–35-qatorlar)
- **Muammo:**
  `openShift` avval `currentShift` bormi deb tekshiradi, so'ng `prisma.shift.create` qiladi. Agar ikkita operator bir vaqtda smena ochish tugmasini bossa, ikkalasi ham ochiq smena yo'q deb topadi va bazada 2 ta `status = 'OPEN'` bo'lgan smena paydo bo'ladi.
  Prisma sxemasida esa `[clubId, status]` faqat oddiy indeks (`@@index`), unikal cheklov (`@@unique`) emas.
- **Tavsiya:** PostgreSQL darajasida qisman unikal indeks (Partial Unique Index) qo'shish: `CREATE UNIQUE INDEX unique_open_shift_per_club ON shift (club_id) WHERE status = 'OPEN';`.

---

## 3. Xavfsizlik Zaifliklari

### 3.1. Telegram Botda PIN-kodni Cheksiz Tanlash (Brute Force Zaifligi)
- **Fayl:** `apps/api/src/telegram.ts` (224–250-qatorlar)
- **Muammo:**
  Koddagi izohda: `// PIN 4 xonali — cheksiz urinish berilsa uni topish oson bo'lib qoladi` deb yozilgan va `urinish > MAX_PIN_ATTEMPTS` tekshiriladi.
  Lekin PIN noto'g'ri bo'lgan taqdirda **`failedPins` qiymati bazada hech qachon oshirilmaydi!** `prisma.botState.update` chaqiruvi yo'q.
  Natijada tajovuzkor Telegram orqali 4 xonali PIN-kodni (jami 10 000 ta variant) hech qanday blokirovkasiz bir necha daqiqada topib, o'z chatini Administrator yoki Egasi roliga ulab olishi mumkin!
- **Tavsiya:** Noto'g'ri PIN kiritilganda `prisma.botState.upsert` orqali `failedPins` ni `+1` oshirish va 5 ta xatodan keyin chatni vaqtinchalik (masalan, 1 soatga) bloklash.

### 3.2. Ko'p Klublilik (Multi-tenancy) Izolyatsiyasining Buzilishi
- **Fayl:** `apps/api/src/routes/settings.ts` (62, 109, 168-qatorlar) va `apps/api/src/app.ts` (74-qator)
- **Muammo:**
  1. `/api/station-types`, `/api/stations`, `/api/tariffs` so'rovlarida `where: { clubId: req.user.clubId }` filtri yo'q! Ular bazadagi **barcha klublarning** joylari, turlari va tariflarini aralashtirib qaytaradi.
  2. `/api/auth/users` da `club = await prisma.club.findFirst()` qilib, bazadagi barcha xodimlarni qaytaradi.
- **Tavsiya:** Barcha SELECT so'rovlariga joriy foydalanuvchining `clubId` sini filtr sifatida qo'shish (`where: { clubId: req.user.clubId }`).

### 3.3. Realtime Oqimi (`/api/stream`) va `/api/revision` da Avtorizatsiya Yo'qligi
- **Fayl:** `apps/api/src/realtime.ts` (36–70-qatorlar)
- **Muammo:**
  `/api/stream` (SSE) va `/api/revision` ochiq endpoint bo'lib, ularda `requireAuth` tekshiruvi yo'q. Istalgan tashqi shaxs bu oqimga ulanishi va klubdagi ochiq seanslar soni hamda o'zgarishlar vaqtini kuzatib turishi mumkin.
- **Tavsiya:** Ushbu marshrutlarga ham JWT autentifikatsiyasini qo'shish.

---

## 4. Biznes Mantiqi va Hisob-Kitobdagi Xatolar

### 4.1. Telegram Botda Joy Bron Qilishdagi Qo'pol Mantiqiy Xato
- **Fayl:** `apps/api/src/telegram.ts` (535–576-qatorlar)
- **Muammo:**
  Mijoz kelajakdagi vaqtga (masalan, ertaga soat 20:00 ga) joy band qilmoqchi bo'lsa:
  ```ts
  const stations = await listStations(c.id);
  const bosh = stations.find((s) => s.status === 'FREE');
  if (!bosh) {
    await ctx.answerCallbackQuery("Bo'sh joy qolmadi.");
    return;
  }
  ```
  Bot joyning ertaga bo'sh bo'lishini emas, **aynan hozirgi daqiqada bo'sh yoki bandligini** tekshiradi! Agar hozir klub to'la bo'lsa, mijoz kechqurungi yoki ertangi vaqtga umuman bron qila olmaydi.
  Bundan tashqari:
  - Mijoz qaysi konsolni (PS-5, PS-3 yoki VIP) tanlayotgani so'ralmaydi, tasodifiy hozir bo'sh turgan konsol biriktiriladi.
  - O'sha tanlangan joyda so'ralgan vaqtda boshqa bron bor-yo'qligi tekshirilmaydi.
- **Tavsiya:** Bron qilishda mijozga konsol turini tanlatish va `freeSlots` hamda `prisma.booking` orqali aynan o'sha tanlangan vaqt oralig'ida bo'sh bo'lgan joyni band qilish.

### 4.2. Kunlik Hisobotda Chegirma (`discount`) ning Hisobga Olinmasligi
- **Fayl:** `apps/api/src/services/report.ts` (112–129-qatorlar) va `apps/api/src/routes/reports.ts` (62–68-qatorlar)
- **Muammo:**
  `dailyReport` funksiyasida jami tushum quyidagicha hisoblangan:
  ```ts
  totalRevenue: gameRevenue + itemsRevenue + quickSales,
  ```
  Bu formulada **`discounts` (chegirmalar) ayrilmagan!**
  Excel eksportda esa:
  - O'yin: `+gameRevenue`
  - Bufet: `+itemsRevenue`
  - Tez kassa: `+quickSales`
  - Chegirma: `-discounts`
  - Jami tushum: `totalRevenue` (qaytadan chegirmasiz to'liq summa chiqariladi).
  Natijada Exceldagi qatorlar yig'indisi yakuniy `Jami tushum` raqamiga matematik jihatdan to'g'ri kelmaydi!
- **Tavsiya:** `totalRevenue: Math.max(0, gameRevenue + itemsRevenue + quickSales - discounts)` deb to'g'rilash.

---

## 5. Frontend (UI/UX) dagi Kamchilik va Xatolar

### 5.1. Seansni Yopishda Chegirma va Balansdan To'lash Maydonlari Yo'q
- **Fayl:** `apps/web/src/components/SessionDetail.tsx` (327–376-qatorlar)
- **Muammo:**
  Backend API da `discount` (chegirma) va to'lov usuli sifatida `BALANCE` (mijoz hisobidan to'lash) to'liq qo'llab-quvvatlanadi. Lekin veb-interfeysda seans yopilayotganda faqat ikkita maydon bor: **Naqd** va **Karta**.
  Operator seansga chegirma bera olmaydi va doimiy mijozning balansidagi puldan yopish uchun foydalana olmaydi.
- **Tavsiya:** Yopish modal oynasiga "Chegirma (so'm)" va "Mijoz balansi" maydonlarini qo'shish.

### 5.2. Seansni Bekor Qilish (`cancelSession`) Tugmasi UI da Mavjud Emas
- **Fayl:** `apps/web/src/components/SessionDetail.tsx`
- **Muammo:**
  Backendda `/api/sessions/:id/cancel` (administratorlar uchun bekor qilish) marshruti bor. Ammo `SessionDetail` komponentida seansni bekor qilish tugmasi umuman yo'q. Agar xato ochilgan seans bo'lsa, uni operatorda ham, administratorda ham interfeys orqali bekor qilish imkoni yo'q.

### 5.3. Joyni Boshqa Konsolga Ko'chirish (`moveSession`) Tugmasi UI da Yo'q
- **Fayl:** `apps/web/src/components/SessionDetail.tsx`
- **Muammo:**
  Backendda `/api/sessions/:id/move` mavjud, lekin interfeysda mijozni boshqa PS ga o'tkazish imkoniyati chiqarilmagan.

### 5.4. Bufet Mahsulotlarini Qo'shish Cheklovi
- **Fayl:** `apps/web/src/components/SessionDetail.tsx` (207–228-qatorlar)
- **Muammo:**
  Seansga bufet qo'shish faqat `isQuickKey = true` bo'lgan mahsulotlar uchun va faqat 1 donadan bosish orqali ishlaydi. Katalogdagi boshqa tovarlarni qidirish yoki birdaniga 5 ta kiritish imkoni yo'q.

### 5.5. `Login.tsx` dagi `useEffect` Xatosi
- **Fayl:** `apps/web/src/pages/Login.tsx` (60–70-qatorlar)
- **Muammo:**
  ```tsx
  useEffect(() => {
    function onKey(event: KeyboardEvent) { ... }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // <-- Qaramliklar massivi [] YO'Q!
  ```
  `useEffect` ga ikkinchi argument berilmagan. Natijada har safar PIN raqami bosilganda va komponent qayta chizilganda yangi event listener qo'shilib, eskisi o'chiriladi. Bu ortiqcha xotira va protsessor yuklamasini keltirib chiqaradi.

---

## 6. Texnik Vazifa (TZ.md) Talablarining Bajarilmagan Qismlari

`TZ.md` da ko'rsatilgan, lekin kodda mavjud bo'lmagan yoki chala qolgan bandlar:

1. **Abonementlar va Soat Paketlari (M5.2):**
   - Bazada `CustomerPackage` modeli bor, biroq tizimda mijozga paket sotish (`/api/customers/:id/packages`), seans ochilganda ushbu paket soatlaridan foydalanish yoki paket muddatini boshqarish API lari va UI umuman yozilmagan.
2. **Bonus Tizimi (M5.2):**
   - Mijoz kartasida `bonusPoints` ustuni bor, lekin har bir seansdan bonus yig'ilishi (cashback) yoki bonus orqali to'lov qilish mantiqi yo'q.
3. **PWA va Offline Kesh (QM-7, TZ 2.3, 7.3):**
   - Texnik vazifada internet uzilganda o'qish uchun PWA keshi ishlashi majburiy qilib belgilangan. Hozirda Service Worker va `manifest.json` ulanmagan. Internet uzilsa, sahifa ochilmaydi.
4. **O'tgan Vaqt Bilan Seans Kiritish (TZ 2.3, 7.3):**
   - Internet uzoq vaqt uzilib qolganda operator qog'ozda yozib turishi, so'ng administrator o'tgan vaqt bilan kiritishi kerak edi. Backendda `openSession` faqat `new Date()` (hozirgi vaqt) ni oladi, administrator o'tgan vaqtni kirita olmaydi.
5. **Rus Tili Mahalliylashtiruvi (M8):**
   - "Interfeys tili: o'zbek (asosiy), rus (ikkinchi)". Faqat o'zbek tili mavjud, i18n tizimi yo'q.
6. **Avtomatik Zaxira Nusxa (Backup) (M8):**
   - PostgreSQL bazasini har kuni avtomatik zaxiralash skripti yoki cron vazifasi yo'q.
7. **`apps/api` da Birlik Testlarining Yo'qligi:**
   - `npm test` buyrug'i bajarilganda `@psklub/domain` dagi 65 ta test o'tadi, lekin `@psklub/api` uchun **0 ta** test yozilgan. Barcha marshrutlar (routes) va xizmatlar (services) avtotestlarsiz qolgan.

---

## 7. Deploy, Vercel va Infratuzilmadagi Muammolar

### 7.1. `VERCEL.md` dagi Mavjud Bo'lmagan `/api/telegram-setup` Yo'li
- **Fayl:** `VERCEL.md` (57-qator)
- **Muammo:**
  Qo'llanmada Telegram webhook ulash uchun brauzerda `https://<loyihangiz>.vercel.app/api/telegram-setup` manzilini ochish so'ralgan. Biroq loyihada **bunday endpoint umuman mavjud emas!** `setupWebhook` funksiyasi `telegram.ts` da yozilgan, ammo u hech qaysi Fastify marshrutiga yoki Vercel funksiyasiga ulanmagan. Foydalanuvchi bu manzilni ochganda 404 xatosini oladi.
- **Tavsiya:** `apps/api/src/app.ts` yoki `api/` ichida webhook o'rnatuvchi xavfsiz endpoint ochish.

### 7.2. Suppliers dagi N+1 SQL So'rovlari Muammosi
- **Fayl:** `apps/api/src/routes/suppliers.ts` (48–50-qatorlar)
- **Muammo:**
  ```ts
  const rows = await prisma.supplier.findMany(...);
  return Promise.all(rows.map(async (s) => ({ ...s, ...(await supplierBalance(s.id)) })));
  ```
  Har bir ta'minotchi uchun alohida `supplierBalance` chaqiriladi (u o'z navbatida 2 ta alohida SQL so'rov yuboradi). Agar 20 ta ta'minotchi bo'lsa, bu 41 ta SQL so'roviga aylanadi.
- **Tavsiya:** Yagona `GROUP BY supplier_id` so'rovi orqali barcha qarz va to'lovlarni bitta so'rovda hisoblash.

---

## 8. Tuzatishlar Bo'yicha Bosqichma-Bosqich Reja

### 1-Bosqich: Zudlik Bilan Tuzatilishi Kerak Bo'lgan Xatolar (Moliyaviy va Xavfsizlik)
1. **`closeSession` ni atomik qilish:** To'lov qabul qilish, balans yechish va seans yopishni yagona Prisma tranzaksiyasiga olish.
2. **Tez kassani himoyalash:** `/api/sales` da to'lov summasi tekshiruvini qo'shish va barcha mahsulotlarni tranzaksiyada yechish.
3. **Telegram bot PIN brute-force himoyasi:** `botState.failedPins` hisoblagichini to'g'rilash va blokirovka qo'yish.
4. **Telegram bot bron qilish mantiqini to'g'rilash:** Joyning hozirgi holatiga emas, bron qilinayotgan vaqtdagi bandligiga qarash va konsol turini tanlash imkonini berish.
5. **Kunlik hisobot matematikasini to'g'rilash:** `totalRevenue` da chegirmalarni ayirish.

### 2-Bosqich: Foydalanuvchi Interfeysi (UI) ni To'ldirish
1. `SessionDetail.tsx` oynasiga **Chegirma**, **Mijoz balansi orqali to'lash**, **Seansni boshqa joyga ko'chirish** va **Bekor qilish** amallarini qo'shish.
2. Tez kassada to'lov to'liq bo'lmaguncha sotish tugmasini nofaol (disabled) qilish.
3. `Login.tsx` dagi `useEffect` qaramliklar massivini to'g'rilash (`[]`).

### 3-Bosqich: Ko'p Klublilik va API Xavfsizligi
1. Barcha sozlamalar so'rovlariga (`stations`, `station-types`, `tariffs`) `clubId` filtrini qo'shish.
2. Realtime SSE va revision endpointlariga token tekshiruvini kiritish.
3. Vercel uchun `/api/telegram-setup` endpointini yaratish.

### 4-Bosqich: TZ Bo'yicha Qolgan Imkoniyatlar
1. PWA (Service Worker) ni ulash (QM-7 talabi).
2. Administrator uchun "o'tgan vaqt bilan seans kiritish" imkoniyatini yaratish.
3. Abonement (soat paketlari) va Bonus tizimi modullarini to'liq ishlab chiqish.
4. `apps/api` marshrutlari uchun integratsion testlar yozish.
