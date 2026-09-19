# TEXNIK VAZIFA
## PlayStation klubini boshqarish tizimi

**Versiya:** 1.1
**Sana:** 2026-yil 16-sentabr
**Buyurtmachi:** Azizullo
**Holat:** 12-bo'limdagi 8 savoldan 5 tasi yopildi. Qolgan 3 tasi — tariflar, joylar ro'yxati va mahsulotlar — raqamlar kutilmoqda; ular kodga emas, boshlang'ich ma'lumotga ta'sir qiladi.

> **v1.0 → v1.1 da nima o'zgardi.** Asosiy arxitektura qarori o'zgardi: klubda lokal
> server bo'lmaydi, tizim **faqat bulutda** ishlaydi (2.3-bo'lim qayta yozildi).
> Shunga bog'liq: sinxronizatsiya qatlami (7.3), `sync_outbox` jadvali, lokal
> Postgres va UPS talabi hamda **QM-7** qabul mezoni 1-versiyadan chiqarildi.
> Fiskal chek — kerak emasligi tasdiqlandi. Telegram orqali bron — qamrovda qoladi.

---

## BAJARILGAN ISHLAR HOLATI — 2026-09-18

Belgilar: **✓** bajarilgan va jonli bazada tekshirilgan · **◐** qisman ·
**✗** boshlanmagan.

| Modul | Holat | Nima qolgan |
|---|---|---|
| M1 Joylar xaritasi va seans | ◐ | Seansni **bo'lish (split)** yo'q; smena yopishda **umumiy pult sverkasi** yo'q |
| M2 Tariflar | ✓ | — |
| M3 Bufet va ombor | ◐ | **Inventarizatsiya (sanoq)** yo'q; shtrix-kod ishlatilmaydi |
| M4 Kassa, to'lov, smena | ◐ | Limit oshganda **administrator ruxsati bilan ochish** yo'q; Click/Payme (2-bosqich) |
| M5 Mijozlar | ✗ | Butun modul — baza tayyor, interfeys yo'q (5-bosqich) |
| M6 Hisobot va analitika | ◐ | Kunlik hisobot va Excel ✓. **Bandlik issiqlik xaritasi, xodim kesimi, mijoz segmentatsiyasi, davr taqqoslash, PDF** yo'q |
| M7 Telegram bot | ✗ | Butun modul (4 va 5-bosqich) |
| M8 Tizim, xavfsizlik, audit | ◐ | Rollar, PIN, audit ✓. **Avtomatik backup sozlanmagan**, rus tili yo'q |
| PWA / offline kesh | ✗ | 4-bosqichda (2.3-bo'limdagi majburiy chora) |

**Qabul mezonlari:** 9 ta bajarildi (QM-1…QM-6, QM-8, QM-9, QM-11),
QM-7 qisman, QM-10 va QM-12 qolgan. Batafsil 10-bo'limda.

**Eng muhim to'siq:** klubda sinovni (3-bosqich) boshlash uchun haqiqiy
mahsulot ro'yxati va tasdiqlangan tariflar kerak. Hozir PS-3 tunda va VIP
narxlari — taxminiy qiymatlar.

---

## 1. Loyiha haqida

### 1.1. Hozirgi holat

Klubda **GameClass3 Server** dasturi ishlatiladi. U asosiy vazifani bajaradi (seans vaqtini sanaydi, bufet xizmatini seansga qo'shadi, postoplata va ishonch limitini yuritadi), lekin quyidagi cheklovlari bor:

- faqat klubdagi kompyuterda ishlaydi — egasi uzoqdan ko'ra olmaydi;
- hisobotlar cheklangan, analitika yo'q (joylar bandligi, eng faol soatlar, xodim kesimi);
- mijoz bazasi, abonement va bonus tizimi yo'q — hamma seans «Гость»;
- onlayn to'lov (Click/Payme) ulanmagan;
- interfeys rus tilida va eskirgan, yangi operatorni o'qitish qiyin;
- ma'lumotlar bazasi yopiq — o'z hisobotini yozib bo'lmaydi.

### 1.2. Loyihaning maqsadi

O'z klubimiz uchun zamonaviy boshqaruv tizimini yaratish. Tizim quyidagi savollarga istalgan payt, istalgan joydan javob berishi kerak:

1. Hozir nechta joy band, qaysi biri qancha vaqtdan beri ishlayapti, qancha summa yig'ilgan?
2. Bugun/shu oy qancha daromad bo'ldi — o'yindan va bufetdan alohida?
3. Kassada qancha pul bo'lishi kerak va haqiqatda qancha bor?
4. Qaysi soatlarda joylar bo'sh turibdi — chegirma qachon kerak?
5. Kim doimiy mijoz, u qancha pul olib keladi?

### 1.3. Muvaffaqiyat mezoni

Tizim muvaffaqiyatli deb hisoblanadi, agar:

| Mezon | Maqsad |
|---|---|
| Seansni ochish vaqti | ≤ 5 soniya (2 ta bosish) |
| Bufet sotuvini qayd qilish | ≤ 5 soniya |
| Smena yopishda kassa farqi | ≤ 1 % aylanmadan |
| Operator o'qitish vaqti | ≤ 30 daqiqa, qo'llanmasiz |
| Tizim ishlamay qolgan vaqt | oyiga ≤ 30 daqiqa |
| Egasi kunlik hisobotni olishi | har kuni avtomatik, so'ramasdan |

---

## 2. Qamrov (Scope)

### 2.1. Kiradi

- 1 ta klub, ~14 ta PlayStation joyi (PS-3, PS-5 va boshqa turlar)
- Seans va tarif hisobi, postoplata + ishonch limiti
- Bufet sotuvi va ombor qoldig'i
- Kassa, smena (ochish/yopish), to'lov turlari
- Mijoz bazasi, balans, abonement, chegirma
- Mijozlar bazasi shakllantirilsin.
- Ombor xisobi yuritilsin.
- Ta'minotchilar xisobi yuritilsin.
- Hisobot va analitika
- Telegram bot (egasi + mijoz)
- Web (brauzer) — asosiy ko'rinish, klub kompyuterida kiosk rejimida; PWA mobil
- Bulut server (VPS) — klubda alohida server yo'q

### 2.2. Kirmaydi (1-versiyada)

- Konsolni avtomatik yoqish/o'chirish (smart rozetka) — arxitekturada joyi qoldiriladi
- Fiskal chek / ОФД integratsiyasi — 2-bosqichda ko'riladi
- Bir nechta filial — ma'lumotlar modeli tayyor, UI keyin
- Buxgalteriya (1C) bilan integratsiya
- Native iOS/Android ilova (PWA yetarli)
- Video kuzatuv bilan bog'lanish
- **Lokal server va offline rejim** — 2.3-bo'limdagi yangi qarorga ko'ra chiqarildi
- **Windows .exe (Tauri)** — brauzer kiosk rejimi yetarli, keyinroq ko'riladi

### 2.3. Asosiy qaror: faqat bulut

*(v1.1 da o'zgardi. v1.0 da «lokal server — haqiqat manbai, bulut — ko'zgu» deb
yozilgan edi. Klubda lokal server uchun kompyuter yo'qligi aniqlangach, qaror
qayta ko'rildi.)*

**Butun tizim bulutdagi bitta VPS da ishlaydi.** Klubda alohida server ham,
lokal baza ham yo'q — operator kompyuterida faqat brauzer ochiladi.

Buning sababi va narxi:

| | |
|---|---|
| **Yutuq** | Sinxronizatsiya qatlami, `sync_outbox`, konflikt qoidalari, lokal Postgres, UPS va mini-PC xarajati — hammasi tushadi. Baholangan tejash: **2–3 hafta ishlab chiqish** va ~$300–500 uskuna. |
| **Yutuq** | Egasi, Telegram bot va operator bir xil bazaga qaraydi — «qaysi raqam to'g'ri?» degan savol umuman tug'ilmaydi. |
| **Narxi** | **Internet uzilsa klub ishlay olmaydi** — hatto kim o'ynayotganini ko'rib ham bo'lmaydi. Bu GameClass3 ga nisbatan aniq orqaga qadam, chunki u lokal ishlardi. |

**Shuning uchun majburiy choralar (1-versiyaga kiradi):**

1. **Zaxira internet kanali** — asosiy provayder uzilganda avtomatik o'tadigan
   4G modem (router darajasida). Bu eng arzon va eng samarali chora.
2. **PWA keshi** — aloqa uzilganda interfeys yopilib qolmaydi: oxirgi ma'lum
   holat (qaysi joy band, qachondan beri) **faqat o'qish uchun** ko'rinib turadi.
   Yangi seans ochib bo'lmaydi, lekin operator nima bo'layotganini biladi.
3. **Qog'oz zaxira tartibi** — aloqa uzoq uzilsa operator seanslarni qo'lda
   yozib turadi, aloqa tiklangach kiritadi. Buning uchun «o'tgan vaqt bilan
   seans kiritish» imkoni administrator huquqi ostida bo'ladi.

**Kelajakka yo'l ochiq qoladi.** Domen mantiqi (tarif hisobi, seans, kassa)
bazadan mustaqil modul sifatida yoziladi. Agar keyinchalik lokal server
olinsa, shu modul lokalda ham ishlaydi — faqat sinxronizatsiya qatlami
qo'shiladi, biznes mantiqi qayta yozilmaydi.

---

## 3. Foydalanuvchi rollari

| Rol | Kim | Nima qila oladi |
|---|---|---|
| **Operator** | Smenadagi xodim | Seans ochish/yopish/uzaytirish, bufet sotuvi, to'lov qabul qilish, o'z smenasini ochish-yopish, o'z smenasi hisobotini ko'rish |
| **Administrator** | Klub menejeri | Operator huquqlari + tarif va mahsulot sozlash, chegirma berish, seansni tuzatish/bekor qilish, barcha hisobotlar, ombor kirimi |
| **Egasi** | Azizullo | Hamma narsa + xodim boshqaruvi, moliyaviy analitika, audit jurnali, tizim sozlamalari |
| **Mijoz** | Klub mehmoni | Telegram bot: o'z balansi, seanslari tarixi, bron qilish, onlayn to'lash |

**Qoida:** operator hech qachon o'z seansini o'chira olmaydi — faqat «bekor qilish» so'rovi yuboradi, administrator tasdiqlaydi. Har qanday o'chirish/tuzatish audit jurnaliga tushadi.

---

## 4. Funksional talablar

### M1. Joylar xaritasi va seans

**M1.1. Joylar xaritasi (asosiy ekran)**

Barcha joylar kartochka ko'rinishida, real vaqtda yangilanadi (WebSocket):

- **Bo'sh** — kulrang, «Boshlash» tugmasi
- **Band** — yashil, o'tgan vaqt, yig'ilgan summa, mijoz nomi
- **Tugashiga 10 daqiqa** — sariq, ovozli signal
- **Vaqt tugadi / limit oshdi** — qizil, tepada ogohlantirish
- **Xizmatda emas** (texnik nosozlik) — qora, izoh bilan

Har bir kartochkada: joy raqami, turi (PS-5 / PS-3), tarif nomi, boshlanish vaqti, o'tgan vaqt, joriy summa, pult soni.

**M1.2. Seans ochish**

Kerakli maydonlar: joy, tarif, to'lov rejimi (oldindan / ishdan keyin), mijoz (ixtiyoriy — mehmon bo'lishi mumkin), pult soni, izoh.

- Oldindan to'lov rejimida: summa yoki vaqt kiritiladi, vaqt shu summaga hisoblanadi
- Ishdan keyin to'lov rejimida: ishonch limiti belgilanadi (standart qiymat sozlamalardan, masalan 600 000 so'm)
- Seans boshlangan vaqt server vaqtidan olinadi, operator o'zgartira olmaydi

**M1.3. Seansni boshqarish**

- **Uzaytirish (доплата)** — qo'shimcha vaqt yoki summa
- **To'xtatish (пауза)** — vaqt sanalmaydi; pauzada o'tgan vaqt alohida qayd qilinadi
- **Joyni almashtirish** — seans boshqa joyga ko'chadi, tarix saqlanadi
- **Yopish** — yakuniy hisob chiqadi (o'yin + bufet), to'lov qabul qilinadi
- **Bo'lish (split)** — bir seansni bir necha mijoz o'rtasida taqsimlash

**M1.4. Pult (joystick) nazorati**

PS klublarida eng ko'p yo'qotish manbai. Seans ochilganda nechta pult berilgani qayd qilinadi, yopilganda qaytarilgani tasdiqlanadi. Smena yopishda umumiy pult soni sverka qilinadi.

---

### M2. Tariflar

**M2.1. Tarif tuzilmasi**

Har bir tarif quyidagilardan iborat:

- Nomi (PS-5 kunduzi, PS-3 tunda, ...)
- Qaysi joy turiga tegishli
- Soatlik narx (butun so'mda)
- Minimal vaqt (masalan 30 daqiqa)
- Yaxlitlash qoidasi: daqiqama-daqiqa / har 15 daqiqa / boshlangan soat
- Amal qilish vaqti: hafta kunlari + soat oralig'i (masalan Du–Ju 09:00–18:00)
- Pult soniga koeffitsient (2 pult — asosiy narx, 3–4 pult — +X %)

**M2.2. Paket tariflar**

Belgilangan summaga belgilangan vaqt: «Tungi paket 22:00–08:00 — 150 000 so'm», «3 soat — 2 soat narxiga».

**M2.3. Tariflarning ustuvorligi**

Bir vaqtga bir nechta tarif to'g'ri kelsa — ustuvorlik raqami yuqorisi ishlaydi. Seans bir necha tarif oralig'ini kesib o'tsa (masalan 21:00 da boshlanib 23:00 gacha) — vaqt bo'laklarga bo'linib, har biri o'z tarifi bilan hisoblanadi.

---

### M3. Bufet va ombor

**M3.1. Mahsulot katalogi**

Kategoriya (ichimlik, shirinlik, tamaki, taomlar), nomi, shtrix-kod (ixtiyoriy), sotib olish narxi, sotish narxi, o'lchov birligi, minimal qoldiq (ogohlantirish uchun).

**M3.2. Sotuv**

- Seansga bog'lab (postoplataga qo'shiladi) — rasmdagi kabi
- Alohida sotuv (mijoz o'ynamasdan faqat ichimlik oldi)
- Bir bosishda qo'shish uchun «tez tugmalar» (eng ko'p sotiladigan 12 ta mahsulot)

**M3.3. Ombor**

- Kirim hujjati (yetkazib beruvchi, sana, narx)
- Qoldiq har sotuvda avtomatik kamayadi
- Inventarizatsiya (sanoq) va farqni qayd qilish
- Qoldiq minimal darajaga tushganda ogohlantirish
- Marja hisoboti: mahsulot bo'yicha foyda

---

### M4. Kassa, to'lov va smena

**M4.1. Smena**

- **Ochish:** operator kirib, kassadagi boshlang'ich naqd summani kiritadi
- **Davomida:** barcha operatsiyalar shu smenaga bog'lanadi
- **Yopish:** tizim kutilayotgan summani ko'rsatadi (boshlang'ich + naqd tushum − chiqim), operator haqiqiy sanoqni kiritadi, farq qayd qilinadi va izoh so'raladi
- Yopilgan smenani faqat administrator qayta ocha oladi (audit bilan)

**M4.2. To'lov turlari**

| Tur | 1-bosqich | Izoh |
|---|---|---|
| Naqd | ✅ | Kassaga tushadi |
| Karta (terminal) | ✅ | Operator qo'lda qayd qiladi, kassaga tushmaydi |
| Mijoz balansi | ✅ | Oldindan to'langan summadan yechiladi |
| Abonement / paket | ✅ | Soatlardan yechiladi |
| Click / Payme | 2-bosqich | QR orqali, avtomatik tasdiqlanadi |

Bitta hisobni **aralash** to'lash mumkin bo'lishi kerak (masalan: 50 000 balansdan + 30 000 naqd).

**M4.3. Chiqim (расход)**

Smena davomidagi xarajatlar: tovar sotib olish, ta'mirlash, kommunal. Kategoriya va izoh bilan, kassa qoldig'idan chiqadi.

**M4.4. Qarz nazorati**

Ishdan keyin to'lov rejimida balans manfiy ketadi. Ishonch limiti oshsa — qizil ogohlantirish va yangi xizmat qo'shish bloklanadi (administrator ruxsati bilan ochiladi).

---

### M5. Mijozlar

**M5.1. Karta (profil)**

Ism, telefon, tug'ilgan sana (ixtiyoriy — tug'ilgan kun bonusi uchun), ro'yxatdan o'tgan sana, izoh, qora ro'yxat belgisi.

**M5.2. Balans va abonement**

- **Balans:** mijoz oldindan pul solib qo'yadi, seansdan avtomatik yechiladi
- **Soat paketi:** «10 soat PS-5» sotib oladi, muddati bor (masalan 60 kun)
- **Bonus:** har sarflangan summadan X % bonus qaytadi, bonus bilan to'lash mumkin

**M5.3. Tarix va segmentatsiya**

Mijozning barcha seanslari, sarflagan summasi, o'rtacha chek, oxirgi tashrif. Segmentlar: yangi / doimiy / yo'qolgan (30 kundan beri kelmagan).

---

### M6. Hisobot va analitika

**M6.1. Operativ hisobotlar**

- **Smena hisoboti** — smena yopilganda avtomatik: tushum turlari bo'yicha, kassa farqi, seanslar soni
- **Kunlik hisobot** — o'yin daromadi, bufet daromadi, chiqimlar, sof natija, to'lov turlari kesimi

**M6.2. Analitik hisobotlar**

- **Joylar bandligi (загрузка)** — har bir joy va soat kesimida foizda; issiqlik xaritasi (hafta kuni × soat)
- **Soatlik daromad** — qaysi soatlarda pul kelmayapti
- **Mahsulot reytingi** — savdo va marja bo'yicha
- **Xodim kesimi** — operator bo'yicha aylanma, o'rtacha chek, kassa farqlari, bekor qilingan seanslar soni
- **Mijozlar** — top-20 mijoz, yangi/qaytgan nisbati
- **Taqqoslash** — o'tgan hafta / o'tgan oy bilan

**M6.3. Eksport**

Har bir hisobot Excel (.xlsx) va PDF ga chiqariladi.

---

### M7. Telegram bot

**M7.1. Egasi uchun**

- Har kuni ertalab (sozlanadigan vaqtda) — kechagi kun xulosasi
- Real vaqt bildirishnomalari: smena ochildi/yopildi, kassa farqi chegaradan oshdi, seans bekor qilindi, ishonch limiti oshdi
- `/hozir` buyrug'i — shu daqiqadagi holat (nechta joy band, bugungi tushum)

**M7.2. Mijoz uchun**

- Telefon raqami orqali ro'yxatdan o'tish
- Bo'sh joylarni ko'rish va bron qilish
- O'z balansi, paket qoldig'i, seanslar tarixi
- Balansni onlayn to'ldirish (2-bosqich)
- Aksiya va chegirmalar haqida xabar

---

### M8. Tizim, xavfsizlik va audit

- Rollar va huquqlar (3-bo'limga muvofiq)
- **Audit jurnali:** kim, qachon, nimani o'zgartirdi — eski va yangi qiymat bilan. O'chirilmaydi
- Kritik amallar (seansni o'chirish, narx o'zgartirish, smenani qayta ochish) alohida belgilanadi
- Avtomatik zaxira nusxa (backup): VPS da kuniga 1 marta, 30 kun saqlanadi; haftada 1 marta boshqa joyga nusxa (VPS provayderi ishdan chiqsa ham ma'lumot qoladi)
- Barcha pul qiymatlari **butun so'mda** (BIGINT) saqlanadi — kasrli sonlar ishlatilmaydi
- Interfeys tili: o'zbek (asosiy), rus (ikkinchi)

---

## 5. Biznes qoidalari (aniq formulalar)

**BQ-1. Seans summasi**

```
Seans summasi = O'yin summasi + Bufet summasi − Chegirma

O'yin summasi = Σ (har bir tarif oralig'i uchun):
    yaxlitlangan_vaqt(daqiqa) / 60 × soatlik_narx × pult_koeffitsienti

Agar hisoblangan vaqt < tarifning minimal vaqti bo'lsa,
minimal vaqt bo'yicha olinadi.
```

**BQ-2. Yaxlitlash**

Tarif sozlamasiga qarab:
- `daqiqa` — o'tgan daqiqalar qanday bo'lsa shundayligicha
- `15 daqiqa` — yuqoriga 15 daqiqalikka yaxlitlanadi (37 daqiqa → 45)
- `soat` — boshlangan soat to'liq hisoblanadi (61 daqiqa → 2 soat)

**BQ-3. Qarz va limit**

```
Joriy balans = To'langan summa − Yig'ilgan summa

Balans < 0                      → qarz
|Balans| ≥ Ishonch limiti       → yangi xizmat qo'shish bloklanadi
Seans yopilganda balans < 0     → qarz mijoz kartasiga yoziladi
                                  (mijoz mehmon bo'lsa — yopib bo'lmaydi)
```

**BQ-4. Kassa sverkasi**

```
Kutilayotgan naqd = Smena boshidagi naqd
                  + Naqd tushumlar
                  − Naqd chiqimlar
                  − Qaytarilgan summalar

Farq = Haqiqiy sanoq − Kutilayotgan naqd
```

Farq 0 dan farq qilsa — majburiy izoh. Farq belgilangan chegaradan oshsa — egasiga darhol Telegram xabar.

**BQ-5. Bron**

Bron qilingan joy belgilangan vaqtdan 15 daqiqa oldin «band» holatiga o'tadi. Mijoz 15 daqiqa kechiksa — bron avtomatik bekor bo'ladi.

---

## 6. Ma'lumotlar modeli (asosiy jadvallar)

```
club                — klub (kelajakda filiallar uchun)
app_user            — foydalanuvchi (operator/admin/egasi), rol, PIN-kod
station             — joy: raqam, nom, turi, holati
station_type        — joy turi: PS-3, PS-5, VIP
tariff              — tarif: narx, min_vaqt, yaxlitlash, amal qilish oralig'i
tariff_schedule     — tarifning hafta kuni va soat oralig'i
package             — paket tarif (tungi paket, 3 soat)

session             — seans: joy, tarif, boshlanish, tugash, rejim,
                      ishonch_limiti, holati, mijoz, pult_soni, operator
session_segment     — seansning tarif bo'yicha bo'laklari (hisob uchun)
session_pause       — pauza oraliqlari

product             — mahsulot: nom, kategoriya, narxlar, qoldiq
product_category    — kategoriya
stock_movement      — ombor harakati: kirim/sotuv/inventarizatsiya
order_item          — sotilgan pozitsiya (seansga yoki alohida)

payment             — to'lov: summa, turi, seans/mijoz, smena
expense             — chiqim: summa, kategoriya, izoh, smena
shift               — smena: operator, ochilish/yopilish, naqd, farq

customer            — mijoz: ism, telefon, izoh
customer_balance_tx — balans harakati (to'ldirish/yechish/bonus)
customer_package    — mijozdagi paket: qolgan soat, muddat
booking             — bron: joy, vaqt, mijoz, holati

audit_log           — audit: kim, qachon, nima, eski/yangi qiymat
```

*(v1.1: `sync_outbox` olib tashlandi — 2.3-bo'limdagi qarorga ko'ra
sinxronizatsiya qatlami 1-versiyada yo'q.)*

**Muhim:** `session` va `payment` yozuvlari hech qachon fizik o'chirilmaydi — faqat `status = 'cancelled'` bo'ladi, sababi va kim bekor qilgani bilan.

---

## 7. Texnik arxitektura

### 7.1. Texnologiyalar

| Qatlam | Tanlov | Sabab |
|---|---|---|
| Til | TypeScript | Backend va frontendda bitta til — ishlab chiqish tez |
| Backend | Node.js 20 + Fastify | Yengil, tez, WebSocket bilan yaxshi ishlaydi |
| Baza | PostgreSQL 16 | Ishonchli, tranzaksiyalar kuchli, bepul |
| ORM | Prisma | Migratsiya va tiplar avtomatik |
| Real vaqt | SSE (brauzerdagi EventSource) | *(v1.2: Socket.IO o'rniga — biz faqat "yangilan" signalini yuboramiz, ikki tomonlama aloqa ishlatilmagan. SSE brauzerda tayyor, o'zi qayta ulanadi, mijoz paketi 13 KB yengillashdi)* |
| Frontend | React 18 + Vite + Tailwind | Tez, keng qo'llab-quvvatlanadi |
| Holat | TanStack Query + Zustand | Server ma'lumoti keshi va qayta ulanish mantiqi |
| Mobil | PWA (Progressive Web App) | Alohida ilova yozish shart emas |
| Windows | Brauzer kiosk rejimi | *(v1.1: Tauri chiqarildi — bulutda ishlaganda .exe qiymat qo'shmaydi)* |
| Telegram | grammY | Backend ichida, alohida servis kerak emas |
| Konteyner | Docker Compose | Lokal va bulutda bir xil ishga tushadi |
| Hisobot | ExcelJS + brauzer chop etish | *(v1.2: Puppeteer o'rniga — u ~200 MB Chromium tortadi; brauzerning "Chop etish -> PDF" imkoni bir xil natija beradi)* |

### 7.2. Joylashuv sxemasi

```
        KLUB                                  BULUT (VPS)
┌──────────────────────┐              ┌───────────────────────────┐
│  Operator kompyuteri │   HTTPS /    │  Docker Compose           │
│  (brauzer, kiosk)    │──WebSocket──▶│  ┌─────────────────────┐  │
│                      │◀─────────────│  │ API (Fastify)       │  │
│  ┌────────────────┐  │              │  │ + WebSocket         │  │
│  │ Asosiy internet│  │              │  │ + Telegram bot      │  │
│  │ + 4G zaxira    │  │              │  └──────────┬──────────┘  │
│  └────────────────┘  │              │             │             │
└──────────────────────┘              │  ┌──────────┴──────────┐  │
                                      │  │ PostgreSQL 16       │  │
┌──────────────────────┐              │  │ (yagona baza)       │  │
│  Egasi telefoni      │─────────────▶│  └─────────────────────┘  │
│  Mijoz (Telegram)    │              └───────────────────────────┘
└──────────────────────┘
```

Yagona baza — «qaysi raqam to'g'ri?» degan savol yo'q. Operator, egasi va
Telegram bot bir xil ma'lumotni ko'radi.

### 7.3. Aloqa uzilganda xatti-harakat

*(v1.1: sinxronizatsiya qoidalari o'rniga. Lokal baza yo'q — sinxronlash uchun
narsa ham yo'q.)*

1. Frontend har bir yozuv amalini serverga yuboradi; javob kelmasa — amal
   **bajarilmagan** hisoblanadi va operatorga aniq xabar ko'rsatiladi
   («Aloqa yo'q — seans ochilmadi»). Yarim bajarilgan holat bo'lmaydi.
2. PWA keshi oxirgi ma'lum holatni faqat o'qish uchun ko'rsatib turadi.
3. Aloqa tiklangach interfeys o'zi qayta ulanadi (WebSocket reconnect),
   sahifani yangilash shart emas.
4. Uzoq uzilishdan keyin administrator «o'tgan vaqt bilan» seans kirita oladi —
   har bir bunday yozuv audit jurnalida alohida belgilanadi.
5. Pul operatsiyalari hech qachon brauzerda navbatga qo'yilmaydi — ikki marta
   yozilish xavfi pul yo'qotishdan ham yomonroq.

### 7.4. Talab qilinadigan uskuna

| Nima | Minimal talab | Taxminiy narx |
|---|---|---|
| Bulut VPS | 2 vCPU, 4 GB RAM, 80 GB SSD | oyiga ~10–15 $ |
| Domen | 1 ta | yiliga ~10–20 $ |
| Operator kompyuteri | Brauzer ishlasa yetarli (mavjud) | — |
| **4G zaxira modem** | Asosiy internet uzilganda avtomatik o'tish | bir martalik ~$30–60 |

*(v1.1: lokal server va UPS talabi olib tashlandi.)*

---

## 8. Asosiy ekranlar

1. **Joylar xaritasi** — dasturning yuragi, operator 90 % vaqtini shu yerda o'tkazadi
2. **Seans oynasi** — seansni ochish/uzaytirish/yopish, bufet qo'shish
3. **Tez kassa** — alohida bufet sotuvi
4. **Smena** — ochish, joriy holat, yopish va sverka
5. **Mijozlar** — qidiruv, karta, balans, tarix
6. **Ombor** — mahsulotlar, qoldiq, kirim
7. **Hisobotlar** — sana oralig'i tanlab, jadval va grafik
8. **Sozlamalar** — joylar, tariflar, foydalanuvchilar, bot

**UI talablari:**

- Asosiy amallar **klaviatura yorliqlari** bilan ham bajarilsin (tez ishlash uchun)
- Sensorli ekranda ishlash uchun tugmalar katta (≥ 44 px)
- Qorong'i (dark) rejim — klub sharoitida ko'zga qulay
- Har qanday amal ≤ 3 bosishda

---

## 9. Nofunksional talablar

| Talab | Qiymat |
|---|---|
| Sahifa ochilish vaqti | ≤ 2 soniya (klub internetida) |
| Joylar xaritasi yangilanishi | ≤ 2 soniya kechikish |
| Aloqa uzilganini aniqlash | ≤ 10 soniya — interfeysda aniq ko'rsatiladi |
| Bir vaqtda ishlovchilar | 5 ta operator + 200 mijoz (bot) |
| Baza hajmi (3 yil) | ≤ 5 GB |
| Backup | VPS da kuniga 1 marta avtomatik, 30 kun saqlanadi + haftalik nusxa boshqa joyga |
| Tiklanish vaqti (RTO) | ≤ 30 daqiqa |
| Parol saqlash | bcrypt; operator uchun 4–6 raqamli PIN |
| Kirish | JWT + refresh token, sessiya 12 soat |
| Log | Barcha xatolar va kritik amallar 90 kun saqlanadi |

---

## 10. Qabul mezonlari (Acceptance Criteria)

1-versiya qabul qilinadi, agar quyidagi ssenariylar to'liq ishlasa.

**Holat 2026-09-18:** `[x]` — jonli bazada tekshirilgan · `[~]` — qisman ·
`[ ]` — bajarilmagan. 9 tasi bajarildi, 1 tasi qisman, 2 tasi qoldi.

- [x] **QM-1.** Operator smena ochadi, boshlang'ich naqd summa kiritiladi
- [x] **QM-2.** 9-joyga PS-3 tarifida, ishdan keyin to'lov rejimida seans ochiladi; xaritada yashil bo'lib vaqt sanay boshlaydi
- [x] **QM-3.** Shu seansga 3 ta bufet mahsuloti qo'shiladi; summa seansga to'g'ri qo'shiladi, ombor qoldig'i kamayadi
- [x] **QM-4.** Ishonch limiti oshganda tizim bloklaydi va ogohlantiradi
- [x] **QM-5.** Seans yopiladi, yakuniy hisob (o'yin + bufet) to'g'ri chiqadi, aralash to'lov (naqd + balans) qabul qilinadi
- [x] **QM-6.** Tarif chegarasini kesib o'tgan seans (masalan 21:00–23:30, tunda tarif o'zgaradi) to'g'ri hisoblanadi
- [~] **QM-7.** *(v1.1 da o'zgartirildi — eski matn: «internet uzilgan holatda barcha amallar ishlaydi».)* Internet uzilganda tizim buni ≤ 10 soniyada aniqlaydi va operatorga aniq xabar ko'rsatadi; yarim bajarilgan yozuv qolmaydi; aloqa tiklangach interfeys o'zi qayta ulanadi va holat to'g'ri ko'rinadi
- [x] **QM-8.** Smena yopiladi, kassa farqi to'g'ri hisoblanadi, izohsiz yopib bo'lmaydi
- [x] **QM-9.** Kunlik hisobot Excel ga chiqadi va qo'lda hisoblangan summa bilan to'liq mos keladi
- [ ] **QM-10.** Egasi Telegramda kunlik xulosani avtomatik oladi
- [x] **QM-11.** Operator o'chirgan/tuzatgan har bir yozuv audit jurnalida ko'rinadi
- [ ] **QM-12.** Bir hafta GameClass3 bilan **parallel** ishlanganda ikkala tizim daromadi bir xil chiqadi (±1 %)

---

## 11. Risklar va ularni kamaytirish

*(v1.1: «faqat bulut» qarori risklar tartibini o'zgartirdi — internet endi
1-raqamli risk, sinxronizatsiya riski esa umuman yo'q.)*

| Risk | Ehtimol | Ta'sir | Chora |
|---|---|---|---|
| **Internet uzilishi** | **Yuqori** | **Juda yuqori** | 4G zaxira modem (avtomatik o'tish); PWA keshi — holat o'qish uchun ko'rinadi; qog'oz zaxira tartibi + «o'tgan vaqt bilan kiritish» |
| VPS yoki provayder ishdan chiqishi | Past | Juda yuqori | Kunlik avtomatik backup + haftalik tashqi nusxa; tiklash tartibi yozib qo'yiladi va amalda sinaladi (RTO ≤ 30 daqiqa) |
| Elektr uzilishi (klubda) | Yuqori | O'rta | Konsollar ham o'chadi — ish baribir to'xtaydi. Operator telefonidan kirib seanslarni to'g'rilay oladi |
| Operator tizimga qarshilik qilishi | Yuqori | Yuqori | Parallel ishlash davri, qisqa o'qitish, interfeys GameClass ga o'xshash mantiqda |
| Pul hisobida xatolik | O'rta | Juda yuqori | Butun so'mda saqlash, avtotestlar, parallel sverka (QM-12) |
| Loyiha cho'zilib ketishi | Yuqori | O'rta | MVP qat'iy chegaralangan; 2.2-bo'limdagi narsalar 1-versiyaga qo'shilmaydi |
| Click/Payme integratsiyasi kechikishi | O'rta | Past | 1-versiyada qo'lda qayd; integratsiya alohida bosqich |

---

## 12. Savollar va javoblar

*(v1.1 — 2026-09-16 da 5 ta savol yopildi.)*

### Yopilgan

**3. Nechta operator va smena qanday?**
→ **2 smena × 12 soat.** Smena mantiqi shunga quriladi: bir vaqtda bitta ochiq
smena, topshirish paytida kassa sverkasi majburiy.

**5. Klubda lokal server uchun kompyuter bormi?**
→ **Yo'q, va yaqin orada bo'lmaydi.** Shu sababli 2.3-bo'lim qayta yozildi:
tizim faqat bulutda ishlaydi. Bu TZ dagi eng katta o'zgarish.

**7. Fiskal chek (ОФД) talabi bormi?**
→ **Yo'q, hozircha kerak emas.** 2.2-bo'limda qolganidek, 1-versiyaga
kirmaydi. Talab paydo bo'lsa — alohida bosqich sifatida ko'riladi.

**8. Bron xizmati kerakmi?**
→ **Ha, Telegram orqali** (M7.2). Eslatma: v1.0 da bron «bulutdan lokalga
qaytadigan yagona yozuv oqimi» edi va shuning uchun murakkab hisoblangan.
Faqat bulut arxitekturasida bu murakkablik yo'qoladi — bron oddiy jadval
yozuvi. BQ-5 qoidasi kuchda qoladi.

**4. GameClass3 dagi eski ma'lumot ko'chirilsinmi?**
→ **Aniq emas — GameClass3 bazasi yopiq** (1.1-bo'limda aytilganidek).
Qaror: 1-versiya **toza boshlanadi**. Ko'chirish imkoni alohida tekshiriladi;
imkon topilsa, faqat mijozlar ro'yxati (ism, telefon, qarz) ko'chiriladi —
seanslar tarixisiz. Bu 1-versiyani bloklamaydi.

### Ochiq qolgan (raqamlar kutilmoqda)

Bu uchtasi **kod arxitekturasiga ta'sir qilmaydi** — ular boshlang'ich
ma'lumot (seed). Kod ular kelguncha ham yozilaveradi, lekin klubda sinovni
(3-bosqich) ularsiz boshlab bo'lmaydi.

**1. Tariflar aniq qanday?** ⚠️ eng muhimi
Har bir joy turi uchun: soatlik narx, minimal vaqt, yaxlitlash qoidasi,
kunduzgi/tungi oraliq, pult soniga koeffitsient, paket tariflar.

**2. Nechta joy va qaysi turdan?**
Ma'lum: PS-5 va PS-3 dan tashqari **VIP yoki boshqa tur ham bor**.
Kerak: jami son va har bir turdan nechtaligi; VIP nimasi bilan farq qiladi
(alohida xona? boshqa narx? boshqa konsol?).

**6. Bufetda nechta nom mahsulot bor?**
Kategoriya, nom, tannarx, sotuv narxi, boshlang'ich qoldiq.

---

# YO'L XARITASI

**1-versiya (0–4-bosqichlar):** ~8 hafta *(v1.0 da ~10 hafta edi)*
**To'liq tizim (0–6-bosqichlar):** ~12 hafta *(v1.0 da ~14 hafta edi)*
*(kuniga 2–3 soat ishlash hisobida)*

> **v1.1:** «faqat bulut» qarori 4-bosqichdan sinxronizatsiya ishini
> (7.3-bo'lim) va 3-bosqichdan lokal server o'rnatishni olib tashladi —
> jami ~2 hafta qisqardi. Bulut 1-bosqichdanoq ishlaydi, chunki boshqa
> muhit yo'q.

---

## 0-bosqich — Tayyorgarlik  ◐ QISMAN
**Muddat: 3–5 kun | Natija: aniqlik**

| № | Ish | Holat |
|---|---|---|
| 0.1 | «Ochiq savollar» bo'limiga javob | ✓ 5 tasi yopildi, 1 tasi (mahsulotlar) ochiq |
| 0.2 | Tarif jadvalini yozib chiqish | ◐ kiritildi, lekin PS-3 tunda va VIP narxlari **taxminiy** |
| 0.3 | Bufet mahsulotlari ro'yxati | ✗ faqat 2 ta sinov mahsuloti bor |
| 0.4 | Hozirgi jarayonni kuzatish | ✗ |
| 0.5 | VPS va domen olish | ◐ baza Supabase'da ishlayapti; API hali lokal |
| 0.6 | 4G zaxira modem masalasini hal qilish (2.3-bo'lim) | ✗ |

**Nazorat nuqtasi:** TZ tasdiqlangan, boshlang'ich ma'lumot tayyor.

---

## 1-bosqich — Poydevor  ✓ BAJARILDI
**Muddat: 2 hafta | Natija: bo'sh, lekin ishlaydigan skelet**

| № | Ish |
|---|---|
| 1.1 | Repozitoriy, monorepo tuzilmasi, Docker Compose, VPS ga deploy (HTTPS bilan) |
| 1.2 | PostgreSQL + Prisma sxemasi (6-bo'lim bo'yicha, `sync_outbox` siz) |
| 1.3 | Autentifikatsiya, rollar, PIN-kod bilan kirish |
| 1.4 | Sozlamalar: joylar, joy turlari, tariflar CRUD |
| 1.5 | Frontend skeleti: layout, navigatsiya, dark mode |
| 1.6 | Avtotestlar uchun asos (tarif hisobi birlik testlari) |

**Nazorat nuqtasi:** Joylar va tariflar kiritilgan, tizimga kirish ishlaydi.

---

## 2-bosqich — MVP yadro ⭐  ✓ BAJARILDI
**Muddat: 3 hafta | Natija: klubda ishlatsa bo'ladigan versiya**

| № | Ish | Modul |
|---|---|---|
| 2.1 | Joylar xaritasi + WebSocket real vaqt | M1 |
| 2.2 | Seans: ochish, uzaytirish, pauza, ko'chirish, yopish | M1 |
| 2.3 | Tarif hisobi (BQ-1, BQ-2) + segmentlar bo'yicha bo'lish | M2 |
| 2.4 | Postoplata va ishonch limiti (BQ-3) | M1/M4 |
| 2.5 | Bufet: katalog, tez tugmalar, seansga qo'shish | M3 |
| 2.6 | Ombor qoldig'i va kirim hujjati | M3 |
| 2.7 | Smena: ochish/yopish, kassa sverkasi (BQ-4) | M4 |
| 2.8 | To'lovlar: naqd, karta, aralash | M4 |
| 2.9 | Chiqim qayd qilish | M4 |
| 2.10 | Kunlik va smena hisoboti + Excel eksport | M6 |
| 2.11 | Audit jurnali | M8 |
| 2.12 | Pult nazorati | M1 |

**Nazorat nuqtasi:** QM-1 … QM-6, QM-8, QM-9, QM-11 bajarilgan.

---

## 3-bosqich — Klubda sinov (parallel ishlash) ⭐  ✗ BOSHLANMAGAN
**Muddat: 2 hafta | Natija: haqiqiy sharoitda tekshirilgan tizim**

| № | Ish |
|---|---|
| 3.1 | Klub kompyuterini sozlash (kiosk rejim), 4G zaxirani sinash |
| 3.2 | Operatorni o'qitish (30 daqiqa) + qisqa qo'llanma |
| 3.3 | **1 hafta GameClass3 bilan parallel ishlash** — har kuni sverka |
| 3.4 | Topilgan xato va noqulayliklarni tuzatish |
| 3.5 | Aloqa uzilishini ataylab sinash: kabelni uzib ko'rish, 4G ga o'tish, qayta ulanish |
| 3.6 | Backup va tiklashni amalda tekshirish (RTO ≤ 30 daqiqa) |

**Nazorat nuqtasi:** QM-7, QM-12 bajarilgan. **GameClass3 dan voz kechish qarori shu yerda qabul qilinadi.**

> Bu bosqichni o'tkazib yuborish — loyihadagi eng katta xato bo'ladi. Parallel ishlash bir haftalik ortiqcha mehnat, lekin u pul hisobidagi xatoni real pul yo'qotilishidan oldin topadi.

---

## 4-bosqich — Egasi paneli va Telegram  ✗ BOSHLANMAGAN
**Muddat: 1 hafta | Natija: egasi uzoqdan ko'radi**

*(v1.1: VPS va HTTPS 1-bosqichga ko'chdi, sinxronizatsiya va Tauri chiqarildi —
bosqich 2 haftadan 1 haftaga qisqardi.)*

| № | Ish | Modul |
|---|---|---|
| 4.1 | Egasi paneli — moliyaviy ko'rsatkichlar | M6 |
| 4.2 | Telegram bot: egasi uchun kunlik xulosa va ogohlantirishlar | M7.1 |
| 4.3 | PWA — telefonda ilova sifatida o'rnatish + offline kesh (2.3-bo'lim) | — |
| 4.4 | Aloqa uzilishini bildiruvchi interfeys (QM-7) | — |

**Nazorat nuqtasi:** QM-10 bajarilgan. 1-versiya **tugallangan**.

---

## 5-bosqich — Mijozlar va to'lovlar  ✗ BOSHLANMAGAN
**Muddat: 2 hafta | Natija: doimiy mijozlar bilan ishlash**

| № | Ish | Modul |
|---|---|---|
| 5.1 | Mijoz bazasi, karta, tarix | M5 |
| 5.2 | Balans va balansdan to'lov | M5 |
| 5.3 | Abonement / soat paketlari | M5 |
| 5.4 | Bonus tizimi | M5 |
| 5.5 | Click / Payme integratsiyasi | M4 |
| 5.6 | Mijoz uchun Telegram bot (balans, tarix, bron) | M7 |

---

## 6-bosqich — Analitika va o'sish  ✗ BOSHLANMAGAN
**Muddat: 2 hafta | Natija: raqamga asoslangan qarorlar**

| № | Ish | Modul |
|---|---|---|
| 6.1 | Bandlik issiqlik xaritasi (hafta × soat) | M6 |
| 6.2 | Soatlik daromad va bo'sh vaqt tahlili | M6 |
| 6.3 | Xodim KPI hisoboti | M6 |
| 6.4 | Mahsulot marja hisoboti | M6 |
| 6.5 | Mijoz segmentatsiyasi va qaytarish kampaniyasi | M5 |
| 6.6 | Taqqoslash hisobotlari (davr × davr) | M6 |

---

## 7-bosqich — Kelajak (ixtiyoriy)

- Smart rozetka orqali konsolni avtomatik o'chirish
- Fiskal chek / ОФД integratsiyasi
- Bir nechta filial va markazlashgan hisobot
- Turnir va musobaqa moduli
- Boshqa klublarga sotish (SaaS ga aylantirish)

---

## Bosqichlar jadvali

| Bosqich | Haftalar | Asosiy natija |
|---|---|---|
| 0 — Tayyorgarlik | 1 | TZ yopilgan, VPS va ma'lumot tayyor |
| 1 — Poydevor | 2–3 | Bulutda ishlaydigan skelet: baza, rollar, tariflar |
| 2 — MVP yadro | 4–6 | Seans, bufet, kassa, hisobot ishlaydi |
| 3 — Klubda sinov | 7 | ⭐ Parallel sverka, GameClass'dan voz kechish |
| 4 — Egasi paneli + Telegram | 8 | ⭐ **1-versiya tayyor** |
| 5 — Mijoz va to'lov | 9–10 | Balans, abonement, bron, Click/Payme |
| 6 — Analitika | 11–12 | Bandlik, KPI, marja hisobotlari |

---

## Keyingi qadam

*(v1.1 da yangilandi.)*

5-savol yopilgani bilan arxitektura aniq bo'ldi — **1-bosqichni boshlash mumkin.**
Qolgan 3 ta ochiq savol (tariflar, joylar, mahsulotlar) boshlang'ich ma'lumotga
tegishli, kod tuzilmasiga emas.

**Parallel ketadigan ikki ish:**

| Kim | Nima |
|---|---|
| Buyurtmachi | Tarif jadvalini yozib chiqish (0.2), joylar ro'yxatini aniqlashtirish, bufet mahsulotlari ro'yxati (0.3), VPS va domen olish (0.5) |
| Ishlab chiquvchi | 1-bosqich: repozitoriy, Docker Compose, Prisma sxemasi, autentifikatsiya, tarif hisobi moduli **avtotestlari bilan** |

Tarif hisobi moduli raqamlarsiz ham yoziladi: narxlar bazadan o'qiladi, kod
ularga bog'liq emas. Raqamlar kelganda ular shunchaki seed ga kiritiladi.

**Bloklovchi chegara:** 3-bosqich (klubda parallel sinov) haqiqiy tariflarsiz
boshlanmaydi — QM-12 (daromad ±1 % mos kelishi) uchun ular shart.
