@echo off
chcp 65001 >nul
title FPL Coach
cd /d "%~dp0"

REM Finn Python (Windows bruker ofte "python", ikke "python3")
where python >nul 2>&1
if %ERRORLEVEL%==0 (
  set "PY=python"
) else (
  where py >nul 2>&1
  if %ERRORLEVEL%==0 (
    set "PY=py -3"
  ) else (
    echo Fant ikke Python.
    echo Installer fra https://www.python.org/downloads/
    echo Huk av "Add python.exe to PATH" under installasjonen.
    pause
    exit /b 1
  )
)

set "RAW=https://raw.githubusercontent.com/Rubixre/grouper/main/fpl/tools"

REM Last ned coach-filen hvis den mangler
if not exist "fpl_cli.py" (
  echo Laster ned fpl_cli.py ...
  powershell -NoProfile -Command "Invoke-WebRequest -Uri '%RAW%/fpl_cli.py' -OutFile 'fpl_cli.py'"
  if not exist "fpl_cli.py" (
    echo Kunne ikke laste ned fpl_cli.py. Sjekk nett.
    pause
    exit /b 1
  )
)

echo Starter FPL Coach ...
echo.
%PY% fpl_cli.py
echo.
pause
