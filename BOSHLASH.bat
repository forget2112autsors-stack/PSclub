@echo off
chcp 65001 >nul
title PS Klub - server
cd /d "%~dp0"

echo.
echo   ====================================
echo     PS KLUB - boshqaruv tizimi
echo   ====================================
echo.

rem --- Node.js bormi? -------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 goto NONODE

node -e "var v=process.versions.node.split('.').map(Number);process.exit((v[0]>22||(v[0]===22&&v[1]>=6))?0:1)"
if errorlevel 1 goto OLDNODE

rem --- .env bormi? ----------------------------------------------------------
if not exist ".env" goto NOENV

rem --- Kutubxonalar ---------------------------------------------------------
if not exist "node_modules" (
  echo   Kutubxonalar o'rnatilmoqda... ^(bir marta, 2-3 daqiqa^)
  call npm install
  if errorlevel 1 goto FAIL
  echo.
)

rem --- Prisma mijozi --------------------------------------------------------
if not exist "node_modules\.prisma\client\index.js" (
  echo   Baza mijozi tayyorlanmoqda...
  call npx prisma generate --schema apps/api/prisma/schema.prisma
  if errorlevel 1 goto FAIL
  echo.
)

rem --- Interfeys ------------------------------------------------------------
if not exist "apps\web\dist\index.html" (
  echo   Interfeys yig'ilmoqda... ^(bir marta, 1 daqiqa^)
  call npm run build --workspace @psklub/web
  if errorlevel 1 goto FAIL
  echo.
)

rem --- Ishga tushirish ------------------------------------------------------
echo   Server ishga tushmoqda...
echo.
echo   Shu kompyuterda:     http://localhost:3000
echo   Boshqa qurilmadan:   http://%COMPUTERNAME%:3000
echo.
echo   To'xtatish: shu oynani yoping yoki Ctrl+C bosib "Y" deng.
echo   Oyna ochiq turishi kerak - yopilsa dastur ham to'xtaydi.
echo.

if not "%PSKLUB_NO_BROWSER%"=="1" start "" http://localhost:3000

rem Dastur kutilmaganda to'xtasa (masalan internet uzilib, baza javob
rem bermay qolsa) o'zi qayta ishga tushadi - operator hech narsa qilmaydi.
:QAYTA
node --no-warnings --env-file=.env apps/api/src/index.ts
echo.
echo   [!] Server to'xtadi. 5 soniyadan keyin qayta urinaman...
echo       Butunlay to'xtatish uchun shu oynani yoping.
timeout /t 5 /nobreak >nul
goto QAYTA

:NONODE
echo   [X] Node.js topilmadi.
echo.
echo   1. https://nodejs.org saytiga kiring
echo   2. Katta yashil tugmadagi "LTS" versiyasini yuklab oling
echo   3. O'rnatib bo'lgach shu faylni qayta ishga tushiring
echo.
pause
exit /b 1

:OLDNODE
echo   [X] Node.js versiyasi eski. Kamida 22.6 kerak. Hozirgi:
node -v
echo.
echo   https://nodejs.org dan yangi LTS versiyasini o'rnating.
echo.
pause
exit /b 1

:NOENV
echo   [X] .env fayli topilmadi.
echo.
echo   .env.example faylidan nusxa olib, .env deb nomlang va
echo   Supabase ulanish manzilini ichiga yozing.
echo.
pause
exit /b 1

:FAIL
echo.
echo   [X] Xatolik yuz berdi - yuqoridagi xabarni o'qing.
echo.
pause
exit /b 1

:END
echo.
echo   Server to'xtadi.
pause
