@echo off
REM Keep this file ASCII-only (see the note in start.bat).
chcp 65001 >nul
title Gallery Admin - stop
setlocal

echo.
echo   Stopping the gallery admin console...
echo.

set RESULT=
for /f "delims=" %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"') do set RESULT=%%i

if "%RESULT%"=="" goto nothing
if "%RESULT%"=="NONE" goto nothing
echo   [ok] Admin console stopped (%RESULT%).
echo        You can close the page now. If it shows "cannot connect", the service is really down.
goto done

:nothing
echo   [i] No running admin console was found.

:done
echo.
pause
