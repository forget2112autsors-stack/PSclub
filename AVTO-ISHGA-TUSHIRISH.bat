@echo off
chcp 65001 >nul
title PS Klub - avtomatik ishga tushirishni sozlash
cd /d "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP%\PS Klub.lnk"
set "TARGET=%~dp0BOSHLASH.bat"
set "WORKDIR=%~dp0"

echo.
echo   ====================================
echo     Avtomatik ishga tushirish
echo   ====================================
echo.
echo   Bu sozlama kompyuter yoqilganda PS Klub serverini
echo   o'zi ishga tushiradi - hech kim hech narsa bosmaydi.
echo.

if exist "%LINK%" goto YOQILGAN

echo   Hozirgi holat:  O'CHIRILGAN
echo.
echo     1 - Yoqish
echo     2 - Hech narsa qilmaslik
echo.
set "JAVOB="
set /p "JAVOB=  Tanlang (1 yoki 2): "
if "%JAVOB%"=="1" goto YOQ
goto CHIQ

:YOQILGAN
echo   Hozirgi holat:  YOQILGAN
echo.
echo     1 - O'chirish
echo     2 - Hech narsa qilmaslik
echo.
set "JAVOB="
set /p "JAVOB=  Tanlang (1 yoki 2): "
if "%JAVOB%"=="1" goto OCHIR
goto CHIQ

:YOQ
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LINK); $s.TargetPath=$env:TARGET; $s.WorkingDirectory=$env:WORKDIR; $s.Description='PS Klub boshqaruv tizimi'; $s.Save()" 2>nul
if not exist "%LINK%" goto XATO
echo.
echo   [OK] Yoqildi. Kompyuter keyingi safar yonganda server o'zi ishga tushadi.
echo.
echo   Eslatma: server ishlashi uchun Windows ga kirilgan bo'lishi kerak.
echo   Kompyuterni o'chirmang - doim yoqiq qoldiring.
echo.
goto CHIQ

:OCHIR
del "%LINK%" 2>nul
if exist "%LINK%" goto XATO
echo.
echo   [OK] O'chirildi. Endi serverni qo'lda ishga tushirasiz (BOSHLASH.bat).
echo.
goto CHIQ

:XATO
echo.
echo   [X] Amalni bajarib bo'lmadi. Antivirus to'sgan bo'lishi mumkin.
echo.

:CHIQ
pause
