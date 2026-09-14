@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\firebase.ps1" -Action Release
if errorlevel 1 echo No se completo el proceso. Revisa el mensaje anterior.
pause
