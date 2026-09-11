@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0installer\produccion.ps1"
if errorlevel 1 (
  echo No se completo la preparacion. Revisa el mensaje anterior y ABRIR-GUIA-PUBLICACION.html.
)
pause
endlocal
