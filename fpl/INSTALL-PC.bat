@echo off
chcp 65001 >nul
title FPL Coach — setup
cd /d "%~dp0"

echo === FPL Coach — forste gangs oppsett ===
echo.
echo Dette lager mappen %%USERPROFILE%%\fpl-coach
echo og laster ned programmet dit.
echo.

set "DEST=%USERPROFILE%\fpl-coach"
set "RAW=https://raw.githubusercontent.com/Rubixre/grouper/main/fpl/tools"
mkdir "%DEST%" 2>nul

powershell -NoProfile -Command "Invoke-WebRequest -Uri '%RAW%/fpl_cli.py' -OutFile '%DEST%\fpl_cli.py'"
powershell -NoProfile -Command "Invoke-WebRequest -Uri '%RAW%/START-FPL.bat' -OutFile '%DEST%\START-FPL.bat'"

if not exist "%DEST%\fpl_cli.py" (
  echo Nedlasting feilet. Sjekk nett.
  pause
  exit /b 1
)

echo.
echo Ferdig! Mappe: %DEST%
echo Dobbeltklikk START-FPL.bat der for aa starte.
echo.
explorer "%DEST%"
pause
