# Compilación en GitHub Actions

El flujo `.github/workflows/revit-installer.yml` está preparado para Windows, pero todavía no se ha ejecutado. No acredita que el add-in compile ni que funcione dentro de Revit.

## Datos que faltan para continuar

1. Un repositorio **privado** para FAMBIT, inicializado con un README. El conector disponible en esta sesión permite trabajar con repositorios existentes; no expone una operación para crear uno. Se puede crear desde https://github.com/new y compartir su enlace en la conversación.
2. `RevitAPI.dll` y `RevitAPIUI.dll` de la instalación del año elegido. El proyecto comprueba ambos archivos en `installer/build.ps1`. En una instalación estándar se encuentran junto a `Revit.exe`, por ejemplo en `C:\Program Files\Autodesk\Revit 2024`. Usa las dos DLL de la misma instalación y comunica también la versión/actualización exacta.

Las referencias se colocarán en `refs/2024/`, `refs/2025/` o la carpeta del año correspondiente dentro del repositorio privado. No hace falta tener todas las versiones. Si una actualización 2025/2026 requiere .NET 10, se puede indicar `net10.0-windows` en `refs/2026/framework.txt` para ese año o seleccionar el perfil al ejecutar el flujo. Consulta `COMPATIBILIDAD.md`.

## Ejecución prevista

El flujo admite ejecución manual desde Actions y compilación de prueba al actualizar la rama `build-revit`. En esta última modalidad elige los años que tienen referencias y usa el servidor local `http://127.0.0.1:8787/api/`. El modo manual permite elegir año, perfil .NET y URL. Solo ejecuta el trabajo en un repositorio privado.

La máquina de GitHub instala el SDK .NET 10 y el compilador Inno Setup 6.3.3; no instala ni ejecuta Revit. Cada EXE se construye con el script existente, que exige referencias reales y detiene el proceso ante un error de compilación. Los resultados incluyen los EXE y sus SHA-256. Las DLL oficiales de Autodesk no forman parte de los instaladores ni del resultado descargable.

Para probar el resultado local necesitas Revit y el servidor de licencias. El servidor incluido requiere Node.js 24 y se inicia con `Iniciar-Servidor-Local.cmd` del paquete Windows. La biblioteca privada de ChatGPT no se sincroniza con él; usa el RFA original para la prueba. El EXE no incorpora el servidor.

## Fuentes de las herramientas elegidas

- [GitHub: configuración del SDK .NET](https://github.com/actions/setup-dotnet).
- [GitHub: entorno Windows Server 2022 y componentes .NET Framework](https://github.com/actions/runner-images/blob/main/images/windows/Windows2022-Readme.md).
- [GitHub: almacenamiento de artefactos](https://github.com/actions/upload-artifact).
- [Paquete Chocolatey de Inno Setup 6.3.3](https://community.chocolatey.org/packages/innosetup/6.3.3). Se fija esta versión para la preparación inicial; no se afirma que sea la más reciente.
