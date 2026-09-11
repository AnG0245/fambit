# Compatibilidad prevista y límites

Consulta técnica: 10 de septiembre de 2026. Todos los perfiles de este proyecto están pendientes de compilación y pruebas reales con Revit.

| Revit | Perfil inicial del proyecto | Tratamiento necesario |
|---|---|---|
| 2024 | `net48` | Compilar contra la API oficial de 2024 y probar en Windows. |
| 2025 | `net8.0-windows` | Probar por separado el producto base y las actualizaciones que migren a .NET 10. |
| 2026 | `net8.0-windows` | Probar por separado la versión base y 2026.5, que cambia a .NET 10. |
| 2027 | `net10.0-windows` | Compilar contra la API oficial de 2027; revisar manifiesto y aislamiento de dependencias. |
| Posteriores | Sin perfil | No se promete compatibilidad. Revisar SDK y preparar un nuevo componente. |

Autodesk identifica Revit 2025 y 2026 como productos originalmente basados en .NET 8 y describe la migración a .NET 10. La actualización de runtime no implica por sí misma cambios de API; el fabricante pide probar complementos ante cambios incompatibles del runtime. El anuncio incluye Revit 2026.5 y Revit 2025.5 como actualización/preview, con fechas sujetas a disponibilidad. Este proyecto no presupone que cualquier actualización 2025 ya esté instalada. Fuente: [Autodesk, actualización de productos 2025/2026](https://blog.autodesk.io/autodesk-desktop-products-2025-2026-net-10-updates/) y [anuncio de migración Revit 2025/2026](https://blog.autodesk.io/call-for-preview-testing-revit-2026-2025-migration-to-net-10/).

Revit 2027 usa .NET 10 y cambia las ubicaciones de complementos para todos los usuarios. Este instalador utiliza ubicación por usuario para evitar depender de la antigua ruta global. Fuente: [Autodesk, SDK Revit 2027](https://blog.autodesk.io/revit-2027-sdk-net-10-api-changes-and-additions/).

El perfil 2024 usa .NET Framework 4.8 como objetivo del código. La verificación realizada aquí no incluyó sus ensamblados oficiales; la compilación y ejecución de ese perfil siguen pendientes.

Si una API instalada de 2025/2026 o sus dependencias ya requiere .NET 10, no fuerces un ensamblado incompatible dentro del perfil .NET 8. Prepara un perfil de compilación .NET 10 explícito con las referencias adecuadas y decide si se mantiene una variante para instalaciones base .NET 8. Por ejemplo, MSBuild permite un `TargetFramework` global:

```powershell
dotnet build .\revit\NubeBIM\NubeBIM.csproj -c Release -p:RevitYear=2026 -p:TargetFramework=net10.0-windows -p:RevitApiDir='C:\SDKs\Revit2026.5'
```

El instalador inicial elige componentes por año, **no por actualización de runtime**. Si necesitas entregar simultáneamente variantes .NET 8 y .NET 10 del mismo año, falta incorporar esa detección y selección antes de distribuir. No mezcles una DLL que exija .NET 10 en instalaciones .NET 8.

Desde la preparación 0.1.1 se puede generar un EXE de un solo año con `installer/build.ps1 -Years 2024 -PackageInstaller` más la URL correspondiente. El script admite `-TargetFrameworks @{2026='net10.0-windows'}` para seleccionar explícitamente una variante. `Preparar-Prueba.cmd` lee la configuración de runtime de Revit cuando está disponible, pero esa detección no sustituye comprobar la actualización instalada. Consulta `PRUEBA-WINDOWS.md`.

La política del repositorio permite ofrecer una familia declarada en una versión igual o anterior a la del cliente. Esa comparación numérica es un filtro; no constituye una prueba de carga. El servidor no convierte archivos a versiones anteriores. En el control de calidad real, abre el RFA con la versión mínima declarada y carga sus tipos en un proyecto de prueba de cada versión admitida.

No puedo confirmar la compatibilidad real con Revit 2024–2027 ni sus actualizaciones hasta completar esas pruebas.
