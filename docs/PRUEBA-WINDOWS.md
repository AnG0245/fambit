# Probar FAMBIT 0.4.0 en Revit

El ZIP incluye el código del complemento, el generador del instalador y el servidor con el portal compilado. **El EXE se genera en tu Windows con los compiladores que ya instalaste.** Aquí no hay Revit ni compiladores Windows; la nueva interfaz y la colocación necesitan tu prueba nativa. El usuario confirmó el funcionamiento de FAMBIT 0.2.0. Esta entrega prepara el servidor para internet; conserva el código de carga y colocación. El inicio administrativo local ahora usa un formulario; el complemento mantiene correo y licencia.

## Actualizar tu instalación actual

1. Guarda tu trabajo y cierra Revit. Detén el servidor anterior con `Ctrl+C` y cierra su consola.
2. Conserva tu carpeta de la versión anterior. La actualización utiliza los mismos datos locales y no añade nuevas migraciones respecto de 0.2.0. Si tienes una ruta de datos personalizada, conserva esa configuración.
3. Extrae el ZIP 0.4.0 que recibiste (de preparación comercial o de prueba Windows) en una carpeta nueva. Abre la carpeta extraída; no ejecutes archivos dentro del ZIP.
4. Haz doble clic en **Preparar-Prueba.cmd** e indica **2025**, o el año de tu Revit.
5. Cuando se abra `artifacts\installer`, ejecuta **FAMBIT-Setup-0.4.0-Revit2025-PruebaLocal.exe** y completa la instalación.
6. En la consola del asistente, introduce la contraseña administrativa y déjala abierta. Tus familias, cuentas y licencias locales permanecen en la misma carpeta. En futuras sesiones puedes usar **Iniciar-Servidor-Local.cmd**, sin recompilar.
7. Abre Revit y un proyecto `.rvt`. Pulsa **FAMBIT → Abrir FAMBIT**. Comprueba **FAMBIT 0.4.0** al pie del panel. Aparece como un panel acoplable; puedes arrastrar su barra de título y acoplarlo donde te resulte cómodo.
8. Elige categoría, subcategoría y una tarjeta. Cuando Revit inicie la colocación, lleva el cursor a la vista y haz clic. Para una puerta, señala un muro compatible; una familia basada en cara necesita una cara. **Esc** termina la colocación.

El botón Actualizar refresca el catálogo, no instala esta versión. Reutiliza tu correo y licencia si pide activación. La sesión anterior se conserva cuando continúa vigente. No hace falta reinstalar el SDK o Inno si la compilación anterior funcionó y mantienes el mismo perfil de Revit.

## Menús del nuevo panel

| Control | Acción |
|---|---|
| Cuadrícula, arriba en la barra lateral | Abrir todas las familias. |
| Carpeta, debajo de Biblioteca | Mostrar las categorías. Al elegir una, aparecen sus subcategorías. |
| Flecha circular | Actualizar el catálogo y las imágenes. |
| Persona, abajo en la barra lateral | Abrir Cuenta: cerrar sesión o buscar actualizaciones. |
| Cuadrícula junto al número de resultados | Alternar tarjetas compactas y ampliadas. |
| Tarjeta de una familia | Cargar e iniciar la colocación, igual que en 0.2.0. |

El nombre completo, la subcategoría y la versión de Revit se muestran al dejar el cursor sobre una tarjeta. El número de columnas se adapta al ancho del panel.

## Añadir las imágenes y clasificar lo que ya subiste

1. Con el servidor abierto, entra en **http://127.0.0.1:8787**. Usuario `admin` y la contraseña de la consola.
2. Abre la tarjeta de tu familia y pulsa **Editar familia**.
3. Elige **Arquitectura → Sillas**, **Eléctricas → Luminarias**, u otra combinación adecuada.
4. Adjunta una miniatura **PNG o JPG** de la familia (hasta 2 MB). Puedes dejar vacío **Reemplazar archivo RFA**.
5. Publica la actualización y pulsa Actualizar en el panel FAMBIT de Revit.

Las imágenes se cargan desde administración: esta versión no las extrae automáticamente del RFA. Las tarjetas sin imagen muestran «Sin vista previa». Mobiliario anterior pasa a Arquitectura → Muebles; Puertas y ventanas se conserva como una subcategoría de Arquitectura; otras familias anteriores pasan a Otros para que tú elijas su clasificación.

## Qué revisar en esta prueba

- Acoplar, cambiar el ancho, cerrar el panel y abrirlo desde la pestaña FAMBIT.
- Ver la tipografía Inter, el nombre FAMBIT en negro, el icono y las miniaturas sobre superficies claras; desplazar el contenido cuando el panel es bajo.
- Cargar y colocar una familia libre y una con anfitrión; repetir el clic para colocarla otra vez. Si tiene varios tipos, el inicial es el primero por nombre; usa el selector de tipos nativo de Revit para cambiarlo.
- Cambiar de proyecto **antes** de elegir una tarjeta: debe usar el proyecto activo al hacer clic. Cambiar **durante** la descarga: debe detener esa carga para evitar colocarla en un destino distinto.
- Probar dos familias distintas y verificar que la geometría y el tipo corresponden a cada tarjeta.

Si una categoría o la vista no admite colocación directa, el panel indica que quedó cargada y muestra el motivo. Abre una vista compatible y repite el clic. Conserva los parámetros de familias existentes; esta actualización no incorpora una opción para sobrescribirlas.

## Preparación del equipo

Usa Windows x64 con la versión de Revit que vas a probar. No necesitas instalar las otras versiones de Revit.

| Componente | Para qué se usa |
|---|---|
| SDK .NET 8 o 10 x64 | Compila el complemento; el runtime que trae Revit no incluye el compilador. Para perfiles .NET 10 necesitas SDK 10. [Instalación oficial de Microsoft](https://learn.microsoft.com/en-us/dotnet/core/install/windows). |
| Developer Pack de .NET Framework 4.8 | Solo para compilar Revit 2024. El paquete de desarrollo incluye las referencias necesarias. [Documentación oficial](https://learn.microsoft.com/en-us/dotnet/framework/install/guide-for-developers). |
| Inno Setup 6.3 o posterior de la serie 6 | Genera el instalador EXE. Usa el instalador del fabricante, disponible en https://jrsoftware.org/isdl.php. |
| Node.js 24 x64 | Ejecuta el panel y el servidor local de licencias. Descarga desde https://nodejs.org/en/download. |

El proceso lee `RevitAPI.dll` y `RevitAPIUI.dll` de tu instalación y no las incluye en el instalador. La primera compilación puede requerir conexión para restaurar componentes de .NET.

## Primera prueba

1. Extrae el ZIP completo en una carpeta de tu usuario. Cierra Revit.
2. Ejecuta `Preparar-Prueba.cmd`. Indica el año de Revit; si está en una carpeta distinta, indica la carpeta que contiene `Revit.exe`.
3. Si la compilación termina correctamente, se abre `artifacts/installer`. Allí estará `FAMBIT-Setup-0.4.0-Revit2024-PruebaLocal.exe` para 2024, o el equivalente del año elegido, junto a su archivo SHA-256. Si falla un compilador, el proceso se detiene y muestra el error; no fabrica un EXE de sustitución.
4. Ejecuta ese EXE, termina la instalación y abre un proyecto de prueba en Revit.
5. En la ventana del asistente, elige la contraseña del administrador local. Cuando indique que el servidor inició, abre **http://127.0.0.1:8787**. Usuario: `admin`. Usa la contraseña que elegiste.
6. En el panel, crea una cuenta con licencia activa, fecha futura y un equipo permitido. Copia la clave que aparece una sola vez. Sube tu archivo `.rfa` original, indicando categoría y versión mínima.
7. En Revit, abre **FAMBIT → Abrir FAMBIT**, activa con el correo y la clave, actualiza la biblioteca y haz clic en una tarjeta para iniciar la colocación.

La familia que ya subiste al panel privado no está dentro de este ZIP ni se transfiere automáticamente al servidor local. Usa el archivo original para esta prueba. La conexión del add-in al panel privado continúa pendiente: su sesión de ChatGPT no es una sesión de licencia Windows.

Si Windows bloquea un archivo descargado, revisa su procedencia y el código antes de permitir su ejecución desde las propiedades del ZIP. El lanzador usa la política `RemoteSigned` solo para ese proceso y respeta las políticas de organización; no modifica la política permanente del equipo.

## Qué comprobar con la licencia

| Acción | Resultado esperado, pendiente de comprobar dentro de Revit |
|---|---|
| Activar con correo y clave correctos | Se muestra el catálogo compatible. |
| Activar con clave incorrecta | Se rechaza la activación. |
| Suspender desde el panel y actualizar en Revit | Se rechaza el acceso. Una familia ya cargada permanece en el proyecto. |
| Reactivar la licencia | Se permite activar nuevamente. |
| Cambiar la clave o revocar el equipo | El token anterior deja de autorizar solicitudes. |
| Cerrar sesión desde Revit | Se libera ese equipo de la licencia. |
| Detener el servidor local | No se permiten nuevas consultas o descargas. |

La prueba local solo comunica procesos de la misma PC. Para comprobar el límite con dos PC necesitas el servidor HTTPS compartido y compilaciones normales que apunten a él.

Deja abierta la consola mientras pruebas. Para volver a iniciar el servidor sin recompilar, ejecuta `Iniciar-Servidor-Local.cmd`. Los datos quedan en `%LOCALAPPDATA%\NubeBIM\TestServer`; no se borran al cerrar. La contraseña administrativa se establece al iniciar y no se incluye en el EXE.

## Versión exacta de Revit y compilación normal

Los perfiles siguen pendientes de validación nativa. Para 2025/2026 el asistente busca la configuración de runtime de Revit y selecciona .NET 10 si la encuentra; si no, usa .NET 8. Verifica la actualización instalada con `docs/COMPATIBILIDAD.md`. Puedes indicar el perfil de forma explícita:

```powershell
.\installer\prueba-local.ps1 -Year 2026 -Runtime net10.0-windows
```

Para un servidor HTTPS propio, ya operativo, puedes generar un instalador de una sola versión:

```powershell
.\installer\build.ps1 -ApiBaseUrl 'https://bim.tudominio.com/api/' -Years 2025 -PackageInstaller
```

Ese dominio es un ejemplo. Para combinar versiones, usa `-Years 2024,2025`; solo necesitas las referencias de esos años. Para una actualización de 2025/2026 que requiera .NET 10, pasa `-TargetFrameworks @{2026='net10.0-windows'}`. La detección del instalador es por año, no por actualización: entrega cada variante únicamente a instalaciones compatibles y prueba el resultado antes de distribuir.

El modo `-LocalTest` solo admite HTTP hacia loopback y conserva la validación de licencias. El modo normal solo admite HTTPS. Ambos registran el mismo complemento: si cambias de modo, reemplazas su configuración para ese año. Revit debe estar cerrado durante instalación y desinstalación.

GitHub está conectado en esta conversación y el flujo de compilación está preparado en el código. Faltan un repositorio privado de destino y las referencias de Revit; no se ha ejecutado una compilación remota. Consulta `COMPILAR-GITHUB.md`. La conexión de GitHub no conecta el panel privado con el cliente.
