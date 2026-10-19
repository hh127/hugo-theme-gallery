@echo off
REM Keep this file ASCII-only: cmd.exe decodes .bat lines with the active code page,
REM and non-ASCII text here breaks parsing. Chinese docs live in tools\admin\README.md.
REM This copy ships inside the theme (themes\<theme>\tools\admin\). The server locates the
REM Hugo site root itself, by walking up to the folder with hugo.toml/config.* and content\.
chcp 65001 >nul
title Gallery Admin
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [x] Node.js not found. Install it first: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting the gallery admin console. The management page will open in your browser.
echo   To stop it: press Ctrl+C in this window, or double-click stop.bat next to this file.
echo.

node "%~dp0server.mjs" %*

echo.
echo   Admin console stopped.
pause
