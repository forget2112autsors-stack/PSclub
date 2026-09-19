# PS Klub — Ma'lumotlar Zaxirasi va Tiklash (Backup & Restore)

Ushbu qo'llanma **Texnik Vazifa (TZ v1.1) 4-bo'lim (M8) va 9-bo'lim** talablariga asosan ishlab chiqilgan:
- **Zaxiralash davriyligi:** Har kuni avtomatik (VPS da crontab orqali).
- **Saqlash muddati:** 30 kun (30 kundan oshgan eski fayllar avtomatik o'chiriladi).
- **Haftalik nusxa:** Ikkinchi xavfsiz joyga ko'chirish (Google Drive, S3 yoki lokal kompyuterga).
- **RTO (Recovery Time Objective):** Tiklanish vaqti ≤ 30 daqiqa.

---

## 1. VPS da Avtomatik Backup (Cron) Sozlash

VPS serverda `crontab -e` buyrug'ini ishga tushiring va quyidagi qatorni qo'shing (har kuni tungi soat 04:00 da avtomatik ishlaydi):

```bash
0 4 * * * /var/www/psklub/scripts/backup.sh >> /var/log/psklub-backup.log 2>&1
```

Skriptga ruxsat bering:
```bash
chmod +x /var/www/psklub/scripts/backup.sh
chmod +x /var/www/psklub/scripts/restore.sh
```

---

## 2. Qo'lda Zaxira Nusxasini Olish

### Linux VPS:
```bash
./scripts/backup.sh
```
Zaxira fayli `/var/backups/psklub/psklub_backup_YYYYMMDD_HHMMSS.sql.gz` manziliga saqlanadi.

### Windows:
```cmd
scripts\backup.bat
```

---

## 3. Zaxiradan Qayta Tiklash (Restore — RTO ≤ 30 daqiqa)

Baza buzilgan yoki yangi serverga ko'chirilgan holatda:

```bash
./scripts/restore.sh /var/backups/psklub/psklub_backup_20260920_040000.sql.gz
```

---

## 4. Web Interfeys Orqali Eksport (Egasi va Admin uchun)

Tizimning «Sozlamalar» sahifasida **«Zaxira nusxani yuklab olish (JSON)»** tugmasi mavjud. Egasi istalgan paytda barcha ma'lumotlar bazasining to'liq snapshotini bitta bosishda o'z kompyuteri yoki telefoniga yuklab olishi mumkin.
