@echo off
rem ==============================================================================
rem PS Klub - Windows Zaxira Nusxasini Yaratish (Windows Backup Script)
rem ==============================================================================

setlocal enabledelayedexpansion

set BACKUP_DIR=backups
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set TIMESTAMP=%dt:~0,8%_%dt:~8,6%
set BACKUP_FILE=%BACKUP_DIR%\psklub_backup_%TIMESTAMP%.sql

echo [PSKLUB-BACKUP] Zaxira nusxasi olinmoqda... (%BACKUP_FILE%)

rem Agar docker compose postgres ishlayotgan bo'lsa:
docker exec -t psklub-postgres pg_dump -U postgres psklub > "%BACKUP_FILE%" 2>nul
if %ERRORLEVEL% EQU 0 (
  echo [PSKLUB-BACKUP] Docker orqali zaxira muvaffaqiyatli olindi: %BACKUP_FILE%
  goto :cleanup
)

rem Aks holda pg_dump orqali:
where pg_dump >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  pg_dump "%DATABASE_URL%" > "%BACKUP_FILE%"
  echo [PSKLUB-BACKUP] pg_dump orqali zaxira olindi: %BACKUP_FILE%
  goto :cleanup
)

echo [PSKLUB-BACKUP] XATO: pg_dump yoki docker topilmadi!
exit /b 1

:cleanup
echo [PSKLUB-BACKUP] Yakunlandi.
