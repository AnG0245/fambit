@echo off
setlocal
title FAMBIT - Preparar prueba en Revit
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0installer\prueba-local.ps1"
if errorlevel 1 echo No se completo la preparacion. Revisa el mensaje anterior y docs\PRUEBA-WINDOWS.md.
pause
