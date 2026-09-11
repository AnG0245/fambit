@echo off
setlocal
title FAMBIT - Servidor de prueba local
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0installer\prueba-local.ps1" -ServerOnly
if errorlevel 1 echo No se inicio el servidor. Revisa el mensaje anterior.
pause
