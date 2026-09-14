# FAMBIT 0.5.0 — Firebase

Biblioteca de familias para Revit, con panel acoplable, administración de licencias y distribución mediante un instalador de Windows.

**La publicación ahora se prepara para Firebase:** Hosting sirve la web y el EXE; Authentication protege el acceso administrativo; Functions valida licencias; Firestore conserva cuentas y catálogo; Storage almacena los RFA y miniaturas privados. Render no se utiliza en este despliegue.

**Empieza con doble clic en `ABRIR-GUIA-PUBLICACION.html`.** La guía completa está en [docs/PUBLICAR-FIREBASE.md](docs/PUBLICAR-FIREBASE.md).

| Asistente de Windows | Para qué sirve |
|---|---|
| `Configurar-Firebase.cmd` | Instalar herramientas, guardar proyecto/UID y configurar el autenticador. |
| `Probar-Firebase.cmd` | Comprobar servicios en emuladores locales, con Node 22 y Java 21. |
| `Publicar-Firebase.cmd` | Publicar el servidor y el panel en tu proyecto. |
| `Preparar-Instalador-Comercial.cmd` | Compilar el EXE con tu URL Firebase y referencias oficiales de Revit. |
| `Publicar-Instalador-Firebase.cmd` | Verificar y publicar el EXE final en Hosting. |

Los clientes usan correo + licencia; no necesitan una cuenta Firebase ni compilar el programa. La configuración administrativa es privada y no se incluye en el instalador.

**Coste:** Firebase requiere Blaze para Functions y Storage. Existen cuotas gratuitas, pero no se garantiza coste cero. Los límites de descargas y almacenamiento de FAMBIT no son un límite de facturación. [Requisitos oficiales](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

**Estado comprobado:** [GitHub Actions aprobado](https://github.com/AnG0245/fambit/actions/runs/34796744628) con instalación limpia, TypeScript, portales compilados y emuladores completos de Hosting, Functions, Authentication, Firestore y Storage: 11 resultados de integración, 2 de herramientas y 27 de regresión portable. Consulta [docs/VALIDACION.md](docs/VALIDACION.md). No se ha desplegado un proyecto real ni compilado o probado el EXE 0.5.0 en Windows/Revit desde este entorno. No puedo confirmar su funcionamiento nativo hasta esa prueba.

La importación opcional conserva licencias, equipos y archivos desde una copia del servidor anterior. El código no incluye tu biblioteca real: sigue en tu equipo hasta que la traslades.

## Referencia histórica: servidor portable y entrega 0.4.0

El contenido siguiente documenta la alternativa anterior. Para la nueva publicación usa la guía de Firebase enlazada arriba.

Biblioteca de familias Revit por categorías, cuentas con licencia y distribución mediante un instalador de Windows.

**Estado real:** el usuario confirmó que FAMBIT 0.2.0 funciona en su Revit. Esta entrega 0.4.0 prepara el servidor de internet: presentación pública, panel privado con contraseña y TOTP, sesiones revocables, configuración de Render, copias recuperables y asistente de compilación comercial. El código nativo de carga y colocación no cambió. No se ha desplegado en Render ni compilado un EXE en este entorno. El ZIP contiene código fuente y portal compilado, sin EXE ni DLL del add-in.

La guía técnica del servidor portable está en [docs/PUBLICAR-FAMBIT.md](docs/PUBLICAR-FAMBIT.md). Para una prueba local, consulta [docs/PRUEBA-WINDOWS.md](docs/PRUEBA-WINDOWS.md).

## Qué puedes usar

- Panel nativo acoplable FAMBIT, tipografía Inter incorporada, nombre negro y superficies blancas y grises; animaciones sutiles que respetan la preferencia de animación de Windows.
- Navegación lateral de Biblioteca, Categorías, Actualizar y Cuenta. Cuenta agrupa cierre de sesión y búsqueda de actualizaciones. Tarjetas con tamaño compacto o ampliado.
- Cinco disciplinas con subcategorías: Arquitectura, Estructura, Sanitarias, Eléctricas y Genéricos. Arquitectura incluye puertas, ventanas, muebles, sillas y mesas.
- Tarjetas con nombre e imagen real subida por el administrador; búsqueda y filtro de versión. Es posible editar imagen y clasificación sin reemplazar el RFA.
- Crear cuentas con correo, clave de activación, vencimiento y límite de equipos; suspender, renovar, liberar equipos y rotar claves.
- Validación del acceso en el servidor para cada solicitud del cliente.
- Registro de versiones del instalador con enlace HTTPS, novedades y SHA-256.
- Servidor portable con SQLite y archivos locales. El portal ya compilado está en `selfhost/dist` dentro del ZIP.
- Un clic en la tarjeta descarga la familia e inicia la herramienta nativa de colocación de Revit. Se usa `ExternalEvent` para capturar el proyecto de destino y para cargar; la solicitud de colocación se hace fuera de la transacción.
- Script para generar un instalador con componentes separados para Revit 2024, 2025, 2026 y 2027.
- Asistente `Preparar-Prueba.cmd` para compilar un solo año y arrancar el servidor de licencias en la misma PC. Instrucciones y requisitos en `docs/PRUEBA-WINDOWS.md`.

La biblioteca inicia vacía. No se incluyeron familias de terceros ni familias de muestra inventadas.

## Dos entornos distintos

1. **Panel privado de revisión:** usa la identidad del propietario y sus datos persistentes. Permite revisar el diseño y gestionar una biblioteca privada. Su acceso de navegador no sustituye la autenticación del cliente Windows.
2. **Servidor independiente:** `selfhost/server.mjs` sirve el mismo panel y la API de licencias. Es la opción incluida para conectar el add-in a una URL HTTPS propia. Sus datos son independientes del panel privado; no existe sincronización entre ambos.

La contraseña del administrador pertenece al servidor. Los usuarios finales ingresan correo + clave de licencia en el complemento. No necesitan cuentas de ChatGPT para el servidor independiente.

## Iniciar el servidor incluido

Entorno probado: Node.js 24.19.0. Usa Node.js 24 y conserva una copia de tus datos.

En PowerShell, desde la raíz del paquete extraído:

```powershell
$env:NUBE_ADMIN_USER = 'admin'
$secret = Read-Host 'Contraseña del administrador (mínimo 20 caracteres)' -AsSecureString
$env:NUBE_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
$env:NUBE_PUBLIC_ORIGIN = 'http://localhost:8787'
node selfhost/server.mjs
```

Abre `http://localhost:8787` en tu navegador e ingresa las credenciales en el formulario de inicio de sesión. El paquete compilado no requiere instalar módulos npm para ejecutar este servidor. En uso real, configura el secreto en tu servicio y no lo guardes en el repositorio. Al terminar la prueba, elimina la variable de esa terminal:

```powershell
Remove-Item Env:NUBE_ADMIN_PASSWORD
```

Para uso con clientes, pon el servidor detrás de un proxy HTTPS y establece `NUBE_PUBLIC_ORIGIN` en su dominio real. El add-in normal exige HTTPS; la compilación explícita `-LocalTest` solo permite HTTP en loopback para probar en la misma PC. El proceso escucha en `127.0.0.1` por defecto; el proxy debe pasar las rutas `/` y `/api/`. El panel usa una cookie HttpOnly/SameSite=Strict, Secure en producción, y requiere contraseña y TOTP. HTTP Basic ya no concede acceso. El formulario y la API administrativa comparten el origen y rechazan escrituras de otro origen. La carpeta `NUBE_DATA_DIR` debe ser persistente y escribible por el servicio.

La API y la interfaz se sirven desde el mismo origen. No habilites CORS abierto ni publiques archivos de la carpeta de datos como contenido estático. Las claves se generan dentro de la aplicación; el administrador las entrega por el canal que elija.

## Preparar el complemento de Windows

Consulta `docs/COMPATIBILIDAD.md` antes de compilar. Necesitas Windows, herramientas .NET, el Developer Pack de .NET Framework 4.8 y ensamblados oficiales de cada Revit objetivo. El código no redistribuye `RevitAPI.dll` ni `RevitAPIUI.dll`.

```powershell
.\installer\build.ps1 -ApiBaseUrl 'https://bim.tudominio.com/api/' -Years 2024
```

El dominio del ejemplo no existe como servicio de este proyecto: reemplázalo por tu servidor. Para generar un instalador de prueba de una sola versión, instala Inno Setup 6.3 o posterior de la serie 6:

```powershell
.\installer\build.ps1 -ApiBaseUrl 'https://bim.tudominio.com/api/' -Years 2024 -PackageInstaller
```

Puedes usar `-Years 2024,2025` o añadir los otros años; solo necesitas las referencias de las versiones elegidas. El archivo de configuración queda incluido junto a cada DLL. El instalador prevé instalación por usuario, detección de Revit, registro `.addin` solo para componentes incluidos, bloqueo si Revit está abierto y desinstalación de los manifiestos. Cada compilación usa una carpeta nueva y genera el SHA-256 del EXE. **Estos comportamientos necesitan pruebas reales en Windows.** La detección cubre rutas habituales y una clave de registro; prueba también instalaciones personalizadas.

Antes de distribuir, firma el EXE con tu certificado de editor y prueba instalación, apertura, licencia, carga, actualización y desinstalación. No publiques una versión del instalador como disponible si todavía no ha pasado esa validación.

## Flujo previsto para el usuario

1. Ejecuta un único instalador y abre Revit.
2. Abre **FAMBIT → Abrir FAMBIT** e ingresa correo y clave si no hay una sesión vigente.
3. Elige categoría y subcategoría; haz clic en la tarjeta de una familia.
4. El servidor valida licencia y versión; el cliente comprueba SHA-256 y Revit carga la familia. Cuando admite su colocación, haz clic en la vista o sobre el anfitrión correspondiente. Esc termina la herramienta.
5. Las nuevas familias aparecen al actualizar el catálogo, sin reinstalación. Las nuevas versiones del add-in se descargan e instalan por separado con Revit cerrado.

## Límites de esta entrega

- El usuario confirmó el funcionamiento de 0.2.0. No puedo confirmar el funcionamiento nativo del instalador 0.4.0 ni del rediseño 0.3.0 sin una nueva prueba en Windows/Revit.
- Carga de familias `.rfa`; no incluye familias de sistema, archivos `.rvt`, materiales externos ni catálogos de tipos `.txt`.
- La versión original de una familia la declara el administrador. El servidor revisa extensión y contenedor OLE básico; no interpreta la estructura completa de Revit. Una revisión sintáctica no acredita que el archivo sea una familia válida.
- Se solicita colocar el primer tipo disponible en orden alfabético. Revit permite elegir el tipo desde su selector nativo. El usuario define posición y anfitrión; algunas categorías/vistas no admiten esta herramienta. Se conservan las familias existentes y sus parámetros.
- Los archivos temporales usan el nombre del catálogo y un identificador por familia; no comparten todos el nombre `family.rfa`. Ese sufijo puede aparecer en el nombre de la familia dentro de Revit.
- Las imágenes se suben como PNG/JPG en administración y se muestran también en Revit. No se extrae automáticamente la miniatura del RFA; si falta, la tarjeta dice «Sin vista previa».
- Licencias con conexión obligatoria, sin modo offline, cobros automáticos, recuperación por correo ni renovación de sesión automática. El token dura como máximo 30 días; después se debe activar de nuevo.
- El límite de equipos usa una identidad de instalación por perfil Windows. No es una huella de hardware ni un DRM. La licencia controla el acceso al repositorio; no puede retirar familias que ya entraron a un proyecto.
- Los archivos descargados por el add-in son temporales y se eliminan tras la carga; un cierre forzado de Revit puede dejar temporales.
- La clave completa aparece una sola vez. La clave y el token se guardan como hash en el servidor; el cliente guarda el token en el Administrador de credenciales de Windows.
- El registro de versiones conserva SHA-256. El cliente actual abre el enlace HTTPS en el navegador; no ejecuta actualizaciones silenciosas ni verifica automáticamente la firma del instalador descargado.
- El servidor portable es de una instancia, con un administrador. La limitación de intentos es local al proceso; solo interpreta la cadena de proxies si se configura su número de saltos. La topología de Render, operación y límites requieren la validación del despliegue real. Las sesiones del administrador se invalidan al reiniciar; las licencias persisten en SQLite.
- El historial guarda revisiones numéricas; los objetos anteriores permanecen privados, pero no hay interfaz de restauración.

## Mantenimiento y reconstrucción

Usa `selfhost/backup.mjs` con el servidor detenido para crear una instantánea SQLite y una copia de archivos con hashes. La restauración solo acepta una carpeta nueva. Para Render se incluye un inicio temporal de mantenimiento; el procedimiento y la copia externa se describen en `docs/PUBLICAR-FAMBIT.md`. No copies únicamente `nube.sqlite` durante escrituras/WAL activas. Las copias no se programan ni se exportan automáticamente en esta entrega.

El repositorio conserva el código del portal. Para reconstruirlo usa la versión de pnpm indicada en `package.json` y su lockfile:

```text
pnpm install --frozen-lockfile
node scripts/build-selfhost.mjs
pnpm exec vite build --config selfhost/vite.config.mjs
node --test tests/service.test.mjs tests/migration.test.mjs
node tests/http-smoke.mjs
python scripts/package-windows.py
```

No ejecutes el servidor contra una base cuya migración aplicada haya sido editada: se comprueba su hash y el inicio se detiene. Añade nuevas migraciones para cambios de esquema.

Consulta los contratos en `docs/API.md` y las verificaciones en `docs/VALIDACION.md`.

## Actualización y tipografía

La migración incorporada en 0.2.0, `0001_fambit_subcategories.sql`, añade subcategorías y conserva IDs, archivos y licencias. Mobiliario pasa a Arquitectura → Muebles; la categoría anterior Puertas y ventanas se conserva dentro de Arquitectura hasta que la reclasifiques. Las otras familias quedan en Otros. No se infiere su clasificación por el nombre.

Se mantienen las rutas e identificadores internos NubeBIM para actualizar la instalación existente. Las claves NUBE anteriores siguen válidas; las nuevas usan FAMBIT. Fuente: `docs/TIPOGRAFIA.md`. El concepto del icono y su prompt se documentan en `docs/IDENTIDAD-FAMBIT.md`.

0.3.0 conserva el contrato del servidor, las migraciones, las licencias, la descarga y el código de carga y colocación de 0.2.0. El cambio se concentra en la presentación y navegación.
