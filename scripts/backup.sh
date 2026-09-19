#!/usr/bin/env bash
# ==============================================================================
# PS Klub - PostgreSQL Avtomatik Zaxira Nusxasi (Backup Script)
# TZ 4-bo'lim (M8) va 9-bo'lim talablari:
#   - VPS da kuniga 1 marta avtomatik bajariladi
#   - Zaxiralar 30 kun saqlanadi (30 kundan eskisi o'chiriladi)
#   - RTO <= 30 daqiqa (tez tiklash uchun gzip siqilgan SQL dump)
# ==============================================================================

set -euo pipefail

# Konfiguratsiya
BACKUP_DIR="${BACKUP_DIR:-/var/backups/psklub}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="${BACKUP_DIR}/psklub_backup_${TIMESTAMP}.sql.gz"
LOG_TAG="[PSKLUB-BACKUP]"

# .env faylidan DATABASE_URL ni o'qish (agar berilmagan bo'lsa)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [[ -z "${DATABASE_URL:-}" ]] && [[ -f "${ROOT_DIR}/.env" ]]; then
  # DATABASE_URL ni .env dan ajratib olish
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "${ROOT_DIR}/.env" | cut -d '=' -f2- | tr -d '\"' | tr -d "'")"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "${LOG_TAG} XATO: DATABASE_URL topilmadi. .env faylini tekshiring yoki muhit o'zgaruvchisini o'rnating." >&2
  exit 1
fi

# Zaxira papkasini yaratish
mkdir -p "${BACKUP_DIR}"

echo "${LOG_TAG} ${TIMESTAMP} - Zaxira nusxasini yaratish boshlandi..."

# pg_dump orqali dump olish va gzip bilan siqish
if command -v pg_dump >/dev/null 2>&1; then
  pg_dump "${DATABASE_URL}" | gzip > "${BACKUP_FILE}"
else
  # Agar pg_dump o'rnatilmagan bo'lsa va docker mavjud bo'lsa
  if command -v docker >/dev/null 2>&1 && docker ps | grep -q "postgres"; then
    CONTAINER_NAME="$(docker ps --filter "ancestor=postgres" --format "{{.Names}}" | head -n1)"
    docker exec -t "${CONTAINER_NAME}" pg_dump -U postgres psklub | gzip > "${BACKUP_FILE}"
  else
    echo "${LOG_TAG} XATO: pg_dump yoki docker topilmadi!" >&2
    exit 1
  fi
fi

FILE_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
echo "${LOG_TAG} Zaxira nusxasi muvaffaqiyatli saqlandi: ${BACKUP_FILE} (Hajmi: ${FILE_SIZE})"

# 30 kundan eski zaxiralarni tozalash (TZ M8: 30 kun saqlanadi)
echo "${LOG_TAG} ${RETENTION_DAYS} kundan eski zaxira fayllari tozalanmoqda..."
find "${BACKUP_DIR}" -type f -name "psklub_backup_*.sql.gz" -mtime +"${RETENTION_DAYS}" -exec rm -f {} \;

echo "${LOG_TAG} Yakunlandi: barcha zaxiralar barqaror holatda."
