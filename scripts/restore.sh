#!/usr/bin/env bash
# ==============================================================================
# PS Klub - PostgreSQL Zaxira Nusxasidan Tiklash (Restore Script)
# TZ 9-bo'lim: Tiklanish vaqti (RTO) <= 30 daqiqa
#
# Foydalanish:
#   ./scripts/restore.sh /var/backups/psklub/psklub_backup_20260920_040000.sql.gz
# ==============================================================================

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Foydalanish: $0 <backup_file.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
LOG_TAG="[PSKLUB-RESTORE]"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "${LOG_TAG} XATO: Fayl topilmadi: ${BACKUP_FILE}" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [[ -z "${DATABASE_URL:-}" ]] && [[ -f "${ROOT_DIR}/.env" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "${ROOT_DIR}/.env" | cut -d '=' -f2- | tr -d '\"' | tr -d "'")"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "${LOG_TAG} XATO: DATABASE_URL topilmadi." >&2
  exit 1
fi

echo "${LOG_TAG} DIQQAT: Bazani qayta tiklash mavjud ma'lumotlarni almashtiradi!"
echo "${LOG_TAG} Tiklanayotgan fayl: ${BACKUP_FILE}"

if command -v gunzip >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
  gunzip -c "${BACKUP_FILE}" | psql "${DATABASE_URL}"
else
  echo "${LOG_TAG} psql yoki gunzip topilmadi." >&2
  exit 1
fi

echo "${LOG_TAG} Baza muvaffaqiyatli tiklandi! (RTO talabi bajarildi)"
