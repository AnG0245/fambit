# Verificación de esta entrega

## Preparación comercial 0.4.0 — 11 de septiembre de 2026

Resultado comprobado en Linux, Node.js 24.19.0:

- 27 pruebas aprobadas, cero fallos, con `node --test tests/production.test.mjs tests/service.test.mjs tests/migration.test.mjs`.
- La prueba HTTP usa el servidor real y SQLite temporal. Comprueba presentación pública, recursos del portal, panel restringido, rechazo de HTTP Basic, inicio con contraseña y TOTP, cookies protegidas, rechazo de escrituras de otro origen, activación sin sesión administrativa, descarga con hash, suspensión y límites de intentos.
- TOTP coincide con los seis vectores SHA-1 publicados en RFC 6238. Se comprueban caducidad por inactividad y absoluta, cierre de sesión, invalidación al reiniciar y rechazo de reutilización de un código incluso tras reiniciar.
- La copia rechaza un servidor activo. Una copia restaurada conserva propietario, IDs, archivo y token de cliente; un archivo alterado y un destino existente se rechazan. El inicio de mantenimiento produce una copia recuperable y devuelve 503 a la API mientras permanece activo.
- El modo local conserva HTTP restringido a loopback y permite el formulario administrativo sin TOTP. La generación privada de credenciales usa una carpeta nueva y no sobrescribe las anteriores.
- TypeScript sin errores; compilación Vite del portal portable y compilación de Sites correctas. Sintaxis JavaScript y shell revisada. La ejecución real de Docker sigue pendiente.

Las solicitudes HTTP de producción se prueban con el origen HTTPS configurado y el proxy simulado por cabeceras en un servidor HTTP local. **No es una prueba de TLS, DNS o del proxy de Render.** Los archivos RFA de prueba son contenedores sintéticos; no validan geometría ni carga nativa en Revit.

No se ejecutaron PowerShell, SignTool, Inno Setup, Docker ni Windows/Revit en este entorno. No se ha contratado ni desplegado Render, transferido una biblioteca real, firmado un EXE, enviado licencias o procesado pagos. No se realizó QA visual en navegador.

El usuario confirmó previamente que 0.2.0 funciona en su Revit. Esta entrega conserva el código de carga y colocación de 0.3.0 y solo cambia la versión del ensamblado; **No puedo confirmar el funcionamiento nativo del instalador 0.4.0 hasta compilarlo y probarlo en Windows.**

Antes de abrir ventas quedan: cuenta de alojamiento y repositorio privado del proyecto, despliegue y prueba TLS/proxy, migración privada, copias externas y su frecuencia, dirección definitiva, compilación y firma, prueba en otra PC, contacto, precios y condiciones comerciales. Los scripts incluidos preparan esos pasos; no los dan por ejecutados.

Las secciones siguientes conservan la historia de verificaciones anteriores.

Fecha: 10 de septiembre de 2026.

## Ejecutado

- Compilación del panel para el entorno privado: correcta.
- Compilación del portal portable: correcta.
- TypeScript `tsc --noEmit --incremental false`: correcto.
- Prueba del servicio con SQLite real y almacenamiento temporal: 12 casos internos y un grupo, 13 resultados aprobados, cero fallos.
- Prueba HTTP del servidor portable: acceso administrativo protegido, HTML y JavaScript servidos, creación de cuenta, activación desde endpoint de cliente y rechazo del token de cliente en administración.

Los casos del servicio comprueban: identidad y origen, generación/hash y duplicados, aislamiento por propietario, activación y límite de equipos en concurrencia, suspensión y reactivación, vencimiento, contenedor básico y versión, descarga/hash y ocultación, actualización de revisión, revocación de equipo, rotación y registro de instalador HTTPS.

Los archivos usados por las pruebas son fixtures sintéticos con cabecera OLE, **no familias Revit reales**. Estas pruebas validan transporte y controles de acceso; no validan geometría, tipos o compatibilidad nativa de un RFA.

## Pendiente

- Compilar C#/WPF con los ensamblados oficiales de Revit y revisar advertencias del compilador.
- Compilar el script Inno Setup, firmar el instalador y probar permisos, rutas no estándar, nombres Unicode, actualización y desinstalación.
- Probar Revit 2024, 2025, 2026 y 2027, además de los cambios .NET 10 dentro de 2025/2026.
- Comprobar que una familia real se carga y que una existente se conserva; documento cerrado, documento activo distinto, solo lectura, edición de familias y fallo de red.
- Ensayar licencias y equipos desde varias instalaciones Windows, expiración, pérdida de conexión y cierre de Revit durante descarga.
- Prueba visual en navegador y accesibilidad asistida. No se ejecutó un navegador en esta entrega.
- WebMCP se registra mediante detección de soporte; no se validó con un contexto de navegador compatible.
- Puesta en servicio de un dominio HTTPS propio, políticas de respaldo y validación de restauración.

La existencia del código y las pruebas del servidor no acreditan el funcionamiento del add-in dentro de Revit.

## Preparación Windows 0.1.1

Se corrigió el empaquetado para elegir uno o varios años sin exigir las cuatro instalaciones, con carpetas de compilación separadas y una lista explícita de archivos propios. Se añadieron comprobaciones de compiladores y referencias, selección del perfil .NET, arranque del servidor local y un modo del cliente limitado a HTTP de loopback. El cliente normal continúa exigiendo HTTPS.

Se corrigió la comprobación de rutas estáticas del servidor portable para usar rutas relativas del sistema; la comparación anterior usaba `/` incluso en Windows. La prueba HTTP también convierte correctamente URL de archivo a ruta Windows.

Tras estos cambios se volvieron a ejecutar en Linux los 13 resultados del servicio y la prueba HTTP: todos pasaron. Se comprobó también que el XAML y el proyecto C# son XML bien formado; esto no equivale a compilarlos.

No se dispone aquí de PowerShell, .NET, Inno Setup ni Revit: no se han ejecutado los asistentes Windows, la compilación WPF, el compilador Inno ni la carga de una familia real. El ZIP 0.1.1 sigue siendo un paquete de preparación, sin EXE.

## Corrección de proyecto de destino 0.1.2 — 11 de septiembre de 2026

Evidencia aportada por el usuario: pudo compilar e instalar el complemento 0.1.1 en Revit 2025, activar la licencia y ver la familia en el catálogo. Su captura muestra el aviso «El proyecto activo cambió. Vuelve al proyecto original o abre la biblioteca de nuevo.». Este aviso sale antes de `LoadFamily`; no demuestra un problema con el contenido RFA. No puedo confirmar si el usuario cambió realmente de proyecto a partir de esa captura.

El código anterior comparaba `app.ActiveUIDocument?.Document != _target`. C# compara referencias para clases que no sobrecargan esos operadores; `Document` expone una sobreescritura de `Equals`. Ahora se usa `active.Equals(_target)`, con comprobaciones previas de validez. No se compara por título, ruta ni hash, y no se cambia silenciosamente el destino de una carga en curso. La transacción usa el documento activo después de comprobar que corresponde al destino original.

Fuentes técnicas consultadas:

- [Microsoft: operadores de igualdad de C#](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/equality-operators).
- [Referencia de la API Revit 2025, clase Document y método Equals](https://www.revitapidocs.com/2025/db03274b-a107-aa32-9034-f3e0df4bb1ec.htm), documentación de Autodesk reproducida por Revit API Docs.

Esta corrección todavía no se compiló ni ejecutó en Windows/Revit desde este entorno. Las siguientes comprobaciones deben realizarse con el instalador 0.1.2 generado en Windows:

| Comprobación en Revit | Resultado esperado |
|---|---|
| Abrir biblioteca en un proyecto y cargar sin cambiar de proyecto | La comprobación de identidad permite llegar a la carga. |
| Cambiar de vista dentro del mismo proyecto | La comprobación permite la carga. |
| Cambiar a otro proyecto mientras la biblioteca sigue abierta | Se rechaza la carga, con los nombres del destino y del proyecto activo; ninguno recibe la familia. |
| Volver al proyecto de destino y pulsar cargar de nuevo | Se permite un nuevo intento. |
| Cerrar el proyecto de destino | Se indica que debe cerrarse y abrirse de nuevo la biblioteca desde un proyecto. |
| Activar el editor de familias o dejar Revit sin documento activo | Se muestra una instrucción específica y no se inicia una transacción. |
| Cargar una familia válida que aún no exista en el proyecto | Se confirma la carga y aparece en el navegador del proyecto. |
| Cargar una familia que ya existe | Se conserva la existente. |

No se cambiaron la validación de licencias, la descarga, los datos del servidor ni el contrato de la API en 0.1.2.

## FAMBIT 0.2.0 — 11 de septiembre de 2026

El usuario confirmó después de la corrección anterior: «Perfecto ya funciona». Esa confirmación corresponde a la carga anterior en su equipo; no valida todavía los cambios de interfaz y colocación de esta entrega.

Verificaciones realizadas en este entorno:

- `pnpm exec tsc --noEmit --incremental false`: sin errores.
- `pnpm run test:service`: 16 pruebas aprobadas, 0 fallos. Incluye creación, suspensión, vencimiento, aislamiento, límites de equipos, descarga con hash, jerarquía, edición de miniatura sin RFA y actualización de una base anterior con archivos y licencia NUBE.
- La prueba de migración compara IDs, archivos, hashes, revisiones, cuentas y equipos anteriores; comprueba que la sesión y clave anteriores funcionan y que un segundo inicio no repite la migración.
- Compilación Vite del portal portable y compilación de Sites completas.
- Prueba HTTP: administración protegida, portal y fuente servidos, creación de cuenta, activación del cliente y denegación de privilegios administrativos al cliente.
- XML del XAML y proyecto analizado; nombres de controladores comprobados; tablas de nombres y pesos de las fuentes verificadas. Esto no sustituye la compilación WPF.

Sin ejecución de la nueva interfaz en Windows/Revit ni pruebas de clics en el navegador. Aquí no hay SDK .NET, PowerShell, Inno Setup ni Revit. **No puedo confirmar el funcionamiento nativo de FAMBIT 0.2.0 antes de compilarlo y probarlo en Revit.** El paquete no incluye un EXE ni una DLL del complemento compilados.

| Prueba nativa pendiente | Resultado previsto |
|---|---|
| Abrir, acoplar, ocultar y reabrir FAMBIT | Panel persistente registrado con `IDockablePaneProvider`. |
| Reducir ancho y altura; recorrer categorías | Tarjetas adaptables, contenido desplazable y controles accesibles. |
| Subir miniatura y editar la clasificación sin RFA | Misma familia y revisión; imagen nueva en portal y panel. |
| Elegir familia desde una vista compatible | Carga y solicitud nativa de colocación al cursor. |
| Repetir clic y comprobar familias distintas | Reutiliza el tipo existente del elemento correspondiente del catálogo. |
| Familia con varios tipos | Empieza por el primero en orden alfabético; selector nativo disponible según herramienta. |
| Puerta o familia con anfitrión | Revit solicita el anfitrión apropiado; Esc termina. |
| Cambiar de proyecto antes del clic | El destino se captura de nuevo para ese clic. |
| Cambiar o cerrar proyecto durante descarga | Cancela la carga; no modifica un proyecto diferente. |
| Suspender la licencia y actualizar/cargar | Deniega próximas solicitudes; los elementos ya colocados permanecen. |

Fuentes API consultadas: [muestra DockableDialogs del SDK Revit](https://github.com/jeremytammik/RevitSdkSamples/tree/master/SDK/Samples/DockableDialogs/CS) y [ejemplo de PostRequestForElementTypePlacement de The Building Coder](https://github.com/jeremytammik/the_building_coder_samples/blob/master/BuildingCoder/CmdPostRequestInstancePlacement.cs). El código propio conserva la comparación `Document.Equals` y solicita la colocación fuera de su transacción, dentro de un `ExternalEvent`.

## FAMBIT 0.3.0 — revisión visual, 11 de septiembre de 2026

El usuario confirmó para 0.2.0: «está perfecto y funciona». Esa confirmación valida su prueba de la entrega anterior, no la interfaz nueva de 0.3.0.

Esta revisión incorpora Inter, el icono generado, una presentación neutra, navegación lateral, una vista de Cuenta y el selector de tamaño de tarjetas. Se comprobó que `lib/service.ts`, `lib/catalog.ts`, `db/schema.ts`, las migraciones, `FamilyPlacement.cs`, `RevitEventBridge.cs` y `RepositoryClient.cs` no tienen cambios respecto de 0.2.0. La descarga, activación y colocación mantienen su implementación anterior.

Comprobaciones ejecutadas para 0.3.0:

- TypeScript sin errores con `pnpm exec tsc --noEmit --incremental false`.
- Compilación del portal portable con `pnpm run build:selfhost` y compilación de Sites completas.
- Prueba HTTP aprobada: portal protegido, acceso administrativo, activación, acceso del cliente, denegación de privilegios administrativos al cliente y entrega de los archivos Inter y PNG del logo.
- XAML y proyecto analizados como XML; controladores de eventos y ruta del recurso del icono comprobados.
- Fuentes Inter estáticas verificadas: familia y estilo en la tabla de nombres, pesos 400, 500, 600 y 700. SHA del original contrastado con el blob obtenido de Google Fonts.
- PNG inspeccionado: dimensiones 1254 × 1254, RGBA con transparencia. Copias incorporadas al portal y al complemento.

No se dispone de Revit ni del compilador WPF en este entorno. **No puedo confirmar todavía el funcionamiento nativo del rediseño 0.3.0.** La revisión XML no es una compilación ni una prueba de interacción. No se ejecutaron pruebas visuales en navegador ni se generaron capturas que simulen una ejecución en Revit.

En Windows, revisar apertura del panel, logo del botón y cabecera, tipografía, categorías, subcategorías, tamaño de tarjetas, Cuenta → volver, cierre de sesión, actualizaciones y colocación en el proyecto. Probar el panel estrecho y ampliar su ancho para comprobar la adaptación de columnas.
