# PS Klub Boshqaruv Tizimi — Foydalanish Qo'llanmasi
**Versiya:** 1.1 | **Klub:** PlayStation Club | **Buyurtmachi:** Azizullo

Ushbu qo'llanma klub egasi, administratorlar va operatorlar uchun tizimdan to'g'ri, tezkor va xavfsiz foydalanish bo'yicha to'liq yo'riqnomadir.

---

## MUNDARIJA
1. [Tizimga kirish va Xavfsizlik](#1-tizimga-kirish-va-xavfsizlik)
2. [Operatorning Kunlik Ish Tartibi](#2-operatorning-kunlik-ish-tartibi)
   - [2.1. Smenani ochish](#21-smenani-ochish)
   - [2.2. Joylar xaritasi va seans ochish](#22-joylar-xaritasi-va-seans-ochish)
   - [2.3. Seansni boshqarish (Uzaytirish, Pauza, Ko'chirish, Split)](#23-seansni-boshqarish)
   - [2.4. Seansga bufet/ichimlik qo'shish](#24-seansga-bufetichimlik-qo'shish)
   - [2.5. Seansni yopish, to'lov va kvitansiya (chek) chiqarish](#25-seansni-yopish-to'lov-va-chek-chiqarish)
3. [Tez Kassa (Alohida bufet sotuvi)](#3-tez-kassa-alohida-bufet-sotuvi)
4. [Smenani Yopish va Kassa Sverkasi](#4-smenani-yopish-va-kassa-sverkasi)
5. [Bronlar va Oldindan Buyurtmalar (Bookings)](#5-bronlar-va-oldindan-buyurtmalar)
6. [Mijozlar Bazasi, Balans va Bonuslar](#6-mijozlar-bazasi-balans-va-bonuslar)
7. [Ombor va Ta'minotchilar Hisobi](#7-ombor-va-ta'minotchilar-hisobi)
8. [Analitika va Hisobotlar (Egasi uchun)](#8-analitika-va-hisobotlar)
9. [Telegram Botlaridan Foydalanish](#9-telegram-botlaridan-foydalanish)
10. [Favqulodda Vaziyatlar (Internet uzilishi)](#10-favqulodda-vaziyatlar)
11. [Klaviatura Tezkor Tugmalari (Hotkeys)](#11-klaviatura-tezkor-tugmalari)

---

## 1. Tizimga kirish va Xavfsizlik

1. Brauzerda dastur manzilini oching (masalan: `https://klub-manzili.uz` yoki mahalliy tarmoqda `http://localhost:3000`).
2. Ro'yxatdan o'z ismingizni tanlang.
3. O'zingizning shaxsiy **4–6 xonali PIN-kodingizni** kiriting va «Kirish» tugmasini bosing.
4. **Xavfsizlik qoidasi:** PIN-kodingizni hech kimga bermang. Tizimdagi barcha amallar (seans ochish, pul qabul qilish, tovar sotish) qaysi xodim tizimga kirgan bo'lsa, o'shaning nomiga yoziladi.

---

## 2. Operatorning Kunlik Ish Tartibi

### 2.1. Smenani ochish
- Ishga kelganda birinchi navbatda **«Smena»** (`Alt+4`) bo'limiga kiring.
- Agar smena ochilmagan bo'lsa, **«Smenani ochish»** tugmasini bosing.
- Kassada oldingi smenadan qolgan boshlang'ich naqd pul summasini sanab kiriting (masalan: `200 000` so'm).
- Shundan so'ng barcha savdo va to'lovlar ushbu smenaga bog'lanadi.

### 2.2. Joylar xaritasi va seans ochish
Asosiy ish ekrani — **«Joylar xaritasi»** (`Alt+1`). Har bir joy holati ranglar bilan ko'rinadi:
- ⚪ **Kulrang (Bo'sh):** Joy bo'sh, mijoz kelishi mumkin.
- 🟢 **Yashil (Band):** O'yin ketmoqda, vaqt va summa hisoblanmoqda.
- 🟡 **Sariq (Oz qoldi):** Seans tugashiga 10 daqiqa qoldi.
- 🔴 **Qizil (Vaqt tugadi / Limit oshdi):** Oldindan to'langan vaqt tugadi yoki ishonch limiti oshdi.
- ⚫ **Qora (Xizmatda emas):** Texnik nosozlik tufayli o'chirilgan.

**Seans ochish tartibi:**
1. Bo'sh joy kartasidagi **«Boshlash»** tugmasini bosing.
2. Tarifni tanlang (masalan: *PS-5 Kunduzgi* yoki *PS-3 Tungi*).
3. Pult sonini belgilang (2 ta, 3 ta yoki 4 ta).
4. To'lov rejimini tanlang:
   - **Ishdan keyin (Postpaid):** Mijoz o'ynab bo'lgach to'laydi (ishonch limiti doirasida).
   - **Oldindan to'lov (Prepaid):** Mijoz oldindan pul beradi yoki ma'lum vaqtga ochiladi (masalan: *1 soat* yoki *50 000 so'm*).
5. Mijozni tanlang (doimiy mijoz bo'lsa qidirib toping, yangi mijoz bo'lsa bo'sh qoldiring — avtomatik *Mehmon* deb ochiladi).
6. **«Seansni boshlash»** tugmasini bosing. Joy yashil rangga kiradi.

### 2.3. Seansni boshqarish
Band joy ustiga bosganda seansning to'liq ma'lumot oynasi ochiladi:
- **Pauza (To'xtatish):** Mijoz tanaffusga chiqsa yoki namozga borsa «Pauza»ni bosing. Pauzada vaqt va pul hisoblanmaydi. Qaytganida «Davom ettirish» bosiladi.
- **Ko'chirish:** Mijoz boshqa xonaga yoki konsolga o'tmoqchi bo'lsa, «Ko'chirish» tugmasini bosib bo'sh joyni tanlang. Hamma hisob-kitob yangi joyga ko'chadi.
- **Uzaytirish (Доплата):** Oldindan to'lovli seansga qo'shimcha vaqt yoki summa qo'shish.
- **Bo'lish (Split):** Do'stlar hisobni teng bo'lib to'lamoqchi bo'lsa, «Bo'lish» tugmasi necha kishiga bo'lishni va kishi boshiga qanchadan to'g'ri kelishini hisoblab beradi.

### 2.4. Seansga bufet/ichimlik qo'shish
1. Seans oynasini oching.
2. «Bufet» bo'limidan kerakli mahsulotni tanlang (tez tugmalar orqali yoki qidirib).
3. Miqdorini belgilang (masalan: *2 ta Coca-Cola*).
4. Mahsulot summasi darhol umumiy seans hisobiga qo'shiladi va ombor qoldig'idan avtomatik yechiladi.

### 2.5. Seansni yopish, to'lov va kvitansiya (chek) chiqarish
1. Seans oynasida **«Seansni yopish»** tugmasini bosing.
2. Ekranda yakuniy hisob chiqadi:
   - O'yin summasi
   - Bufet summasi
   - Chegirma (agar berilgan bo'lsa)
   - **Jami to'lanishi kerak bo'lgan summa**
3. To'lov turini belgilang:
   - **Naqd** (kassaga tushadi).
   - **Karta** (terminal orqali qabul qilinadi).
   - **Mijoz balansi** (agar mijoz doimiy bo'lib, hisobida puli bo'lsa).
   - **Aralash to'lov** (masalan: 50 000 naqd + 30 000 karta).
4. Agar mijozga chek kerak bo'lsa, **«Yopilgandan so'ng chek chiqarish»** belgisini yoqing va «Yopish»ni bosing.
5. Termal printerdan 58mm yoki 80mm formatdagi qulay chek bosib chiqariladi.

---

## 3. Tez Kassa (Alohida bufet sotuvi)

Agar mijoz PlayStation o'ynamasdan, faqat ichimlik, energetik yoki tamaki sotib olsa:
1. Menyu orqali **«Tez kassa»** (`Alt+3`) bo'limiga o'ting.
2. Mahsulotlarni tanlang.
3. To'lov turini tanlab (Naqd / Karta), «Sotish» tugmasini bosing.
4. Pul kassa tushumiga, tovar esa ombor harakatiga darhol yoziladi.

---

## 4. Smenani Yopish va Kassa Sverkasi

Smena topshirilayotganda kassa hisobini to'g'ri topshirish majburiydir:
1. **«Smena»** (`Alt+4`) bo'limiga kiring.
2. **«Smenani yopish»** tugmasini bosing.
3. Tizim kutilayotgan naqd pul summasini hisoblab ko'rsatadi:
   $$\text{Kutilayotgan} = \text{Boshlang'ich naqd} + \text{Naqd tushum} - \text{Chiqimlar}$$
4. Kassadagi naqd pullarni sanang va **«Haqiqiy sanoq»** maydoniga kiriting.
5. **Kassa sverkasi qoidasi:**
   - Agar farq `0` bo'lsa — smena hech qanday savolsiz yopiladi.
   - Agar kamomad yoki ortiqcha pul chiqsa — tizim **majburiy izoh** so'raydi (sababi yozilishi shart).
   - Katta farq bo'lsa, klub egasiga darhol Telegram orqali xabar boradi.
6. Pultlar soni to'liqligini tekshiring va «Yopishni tasdiqlash»ni bosing.

---

## 5. Bronlar va Oldindan Buyurtmalar (Bookings)

Mijozlar telefon orqali yoki Telegram bot orqali joy band qilganida:
1. **«Bronlar»** (`Alt+2`) bo'limiga kiring.
2. Yangi bron qo'shish:
   - Joy raqamini tanlang.
   - Vaqtni belgilang (soat va daqiqa).
   - Mijoz ismi va telefonini kiriting.
3. **Qoidalar (BQ-5):**
   - Bron qilingan vaqtdan **15 daqiqa oldin** joy xaritada sariq rangda band qilib turiladi (boshqa odam o'tirmasligi uchun).
   - Mijoz belgilangan vaqtdan **15 daqiqa kechiksa**, bron avtomatik bekor bo'ladi.
4. Mijoz kelganda bron kartasidagi **«Seansni boshlash»** tugmasini bossangiz, joy darhol o'yinga tayyor holatda ochiladi.

---

## 6. Mijozlar Bazasi, Balans va Bonuslar

Doimiy mijozlarni ro'yxatga olish klubga bo'lgan sodiqlikni oshiradi:
- **Mijoz qo'shish:** Ism, telefon raqami va izoh kiritiladi.
- **Balans to'ldirish:** Mijoz oldindan masalan 200 000 so'm pul solib qo'yishi mumkin. O'ynaganida shu balansdan yechiladi.
- **Soat paketlari (Abonement):** Mijoz arzonroq narxda «10 soatlik VIP paket» sotib olishi mumkin (belgilangan amal qilish muddati bilan).
- **Keshbek va Bonus:** Mijoz har sarflagan pulidan bonus ballari to'playdi. To'plangan ballarni «Balansga o'tkazish» orqali tekinga o'ynash uchun sarflashi mumkin.
- **Qarz nazorati:** Ishonch limiti tugagan mijozga qarzini yopmaguncha yangi xizmat qo'shib bo'lmaydi.
- **Qora ro'yxat:** Tartibbuzar mijozlar qora ro'yxatga kiritiladi va ularga seans ochish bloklanadi.

---

## 7. Ombor va Ta'minotchilar Hisobi

- **Kirim qilish:** Yangi tovar kelganda «Ombor» bo'limida kirim hujjati tuziladi (ta'minotchi, tovar, soni, sotib olish narxi).
- **O'rtacha tannarx:** Tovar yangi narxda kelsa, tizim avtomatik uning o'rtacha tannarxini hisoblaydi.
- **Hisobdan chiqarish (Spisaniye):** Buzilgan, muddati o'tgan yoki to'kilgan mahsulotlar sababini ko'rsatgan holda ombordan chiqariladi va audit jurnaliga yoziladi.
- **Ta'minotchilar bilan hisob-kitob:** Ta'minotchidan nasiyaga olingan tovarlar qarzi ko'rinib turadi. Qarzdorlik to'langanda kassa chiqimi sifatida to'g'ri aks etadi.

---

## 8. Analitika va Hisobotlar (Egasi uchun)

Klub egasi istalgan joydan turib **«Hisobotlar»** (`Alt+8`) bo'limida 5 xil tahlilni ko'ra oladi:
1. **Kunlik hisobot:** O'yin va bufet tushumi, chiqimlar, sof foyda, to'lov turlari, 24-soatlik savdo dinamikasi va eng ko'p sotilgan top-mahsulotlar. Excel va PDF ga yuklab olish mumkin.
2. **Bandlik issiqlik xaritasi (Heatmap):** 7 kun va 24 soat kesimida klubning qaysi paytlarda qanchalik to'la ekanligini ranglar bilan ko'rsatadi. Pik vaqtlar va bo'sh soatlar darhol ko'rinadi.
3. **Operatorlar kesimi:** Qaysi xodim qancha savdo qildi, o'rtacha cheki qancha, nechta seansni bekor qildi va qancha kassa kamomadi chiqardi.
4. **Mijozlar tahlili:** Doimiy mijozlar nisbati, yo'qolib qolganlar va klubga eng ko'p foyda keltirgan **Top-20 mijoz**.
5. **Davr taqqoslash:** Shu haftadagi savdoni o'tgan haftaga yoki shu oyni o'tgan oyga taqqoslash (+/- foiz o'sish).
6. **Zaxira nusxa (Backup):** «Sozlamalar» bo'limidan bir bosishda butun bazaning to'liq zaxira nusxasini (JSON) kompyuterga yuklab olish mumkin.

---

## 9. Telegram Botlaridan Foydalanish

### Egasi boti:
- Har kuni ertalab belgilangan soatda kechagi kunning to'liq moliyaviy xulosasini avtomatik yuboradi.
- Smena ochilganda, smena yopilganda, kassa farqi chiqqanda yoki shubhali amal bajarilganda darhol egasiga xabar beradi.
- Istalgan paytda `/hozir` buyrug'i yuborilsa, shu soniyada klubda nechta joy bandligi va qancha tushum yig'ilganini ko'rsatadi.

### Mijoz boti:
- Mijozlar Telegram orqali bo'sh joylarni ko'rishlari, oldindan bron qilishlari, o'z hisob balansi va tashriflar tarixini tekshirishlari mumkin.

---

## 10. Favqulodda Vaziyatlar (Internet uzilishi)

Klubda lokal server yo'q — tizim bulutda ishlaydi (TZ 2.3 talabi).

- **Internet uzilganda nima bo'ladi?**
  - Ekranda darhol qizil rangli ogohlantirish banneri chiqadi: `⚠ Internet aloqasi yo'q!`.
  - Dastur yopilib qolmaydi (PWA kesh orqali ochiq turadi): qaysi joy qachondan beri o'ynayotgani ekranda ko'rinib turadi.
- **Nima qilish kerak?**
  1. Zaxira 4G modemni tekshiring yoki telefoningizdan internet tarqating.
  2. Internet qaytgan zahoti sahifani yangilash shart emas — dastur avtomatik server bilan qayta bog'lanadi (reconnect).
  3. Agar uzoq vaqt internet bo'lmasa, seanslarni vaqtincha qog'ozga yozib turing. Aloqa tiklangach, administrator ruxsati bilan «o'tgan vaqt bilan seans kiritish» mumkin.

---

## 11. Klaviatura Tezkor Tugmalari (Hotkeys)

Operator tez ishlashi uchun sichqonchani ishlatmasdan klaviaturada quyidagi tugmalarni bosish kifoya:

| Tugma | Bo'lim |
|---|---|
| **Alt + 1** | Joylar xaritasi (Asosiy ekran) |
| **Alt + 2** | Bronlar (Buyurtmalar) |
| **Alt + 3** | Tez kassa (Bar savdosi) |
| **Alt + 4** | Smena (Kassa sverkasi) |
| **Alt + 5** | Mijozlar bazasi |
| **Alt + 6** | Ombor qoldig'i |
| **Alt + 7** | Ta'minotchilar hisobi |
| **Alt + 8** | Hisobotlar va analitika |
| **Alt + 9** | Tariflar sozlamalari |
| **Alt + 0** | Sozlamalar va Zaxira nusxa |

---
*Savollar yoki texnik yordam bo'yicha administrator yoki tizim yaratuvchisiga murojaat qiling.*
