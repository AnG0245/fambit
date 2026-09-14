# Publicación anterior con servidor portable

Para la entrega 0.5.0 y la migración elegida a Firebase, usa [PUBLICAR-FIREBASE.md](PUBLICAR-FIREBASE.md). Esta guía conserva la alternativa anterior.

# Preparar la publicación de FAMBIT 0.4.0

Esta entrega prepara el servidor, la web pública y el generador del instalador. **Todavía no es un servicio publicado ni un EXE compilado.** No se contrataron servicios, no se conectó un dominio y no se cargaron datos del usuario a un servidor externo.

Para comenzar sin comandos, abre `ABRIR-GUIA-PUBLICACION.html` con doble clic. Los archivos `.md` son documentos de consulta; no se ejecutan.

## Qué hace cada parte

| Dirección del servidor | Acceso | Función |
|---|---|---|
| `/` | Público en producción | Presentación del producto y enlace al instalador cuando esté configurado. |
| `/admin` | Administrador | Biblioteca, cuentas, equipos y versiones. |
| `/admin/login` | Formulario público | Contraseña y código TOTP; no permite crear administradores. |
| `/admin/logout` | POST del mismo origen | Cierra e invalida la sesión administrativa. |
| `/api/client/activate` | Correo, licencia e instalación | Crea la sesión del complemento. |
| Resto de `/api/client/` | Token y licencia vigentes | Catálogo y descargas autorizadas. |
| Resto de `/api/` | Sesión administrativa | Gestión privada. |
| `/healthz` | Público | Estado básico, sin información de clientes ni claves. |

En prueba local HTTP, `/` dirige al panel. En producción HTTPS, muestra la presentación. Los archivos del repositorio y los ZIP fuente no se publican mediante el servidor portable.

## 1. Preparar las cuentas y el acceso

1. Crea un **repositorio privado** de GitHub para FAMBIT. Copia el contenido de este paquete en su raíz, de modo que `render.yaml` y `Dockerfile` queden en el primer nivel. El repositorio de código de este proyecto en Sites no es un repositorio de GitHub conectable directamente a Render.
2. Crea una cuenta de Render y conecta ese repositorio privado. Conserva la titularidad de ambas cuentas. No hace falta proporcionar tus contraseñas al asistente.
3. En tu Windows, ejecuta `Configurar-Servidor.cmd`. Usa Node.js 24, que ya se utiliza para el servidor local.
4. Se abrirá una página local con usuario, contraseña y clave TOTP. Añade FAMBIT en tu aplicación de autenticación mediante una clave manual, basada en tiempo, seis dígitos y período de 30 segundos.
5. Conserva esa página y `servidor.env` en un lugar privado. El asistente crea una carpeta nueva en `%LOCALAPPDATA%\FAMBIT\Configuracion-Servidor`; no cambia credenciales anteriores.

El código TOTP solo protege al administrador. Los clientes siguen usando correo y licencia. No incluyas `servidor.env`, la página con credenciales, archivos RFA, bases de datos ni certificados privados en GitHub o en el paquete del cliente.

## 2. Crear el servicio en Render

En Render, crea un **Blueprint** y selecciona el repositorio. Revisa la configuración propuesta antes de contratar:

- Servicio web Docker de una instancia; plan propuesto `0.5c-512mb` y región Virginia. Es una configuración inicial que necesita la prueba de consumo real, no una capacidad garantizada.
- Disco persistente de 5 GB en `/var/data`, compartido por los datos y sus copias. Su tamaño debe ajustarse al catálogo y la retención de copias.
- Inicio normal: `node selfhost/server.mjs`.
- Comprobación de salud: `/healthz`.
- Despliegues automáticos desactivados; cada actualización se lanza después de revisarla.
- Variables secretas solicitadas: `NUBE_ADMIN_PASSWORD` y `FAMBIT_ADMIN_TOTP_SECRET`. Copia los valores de tu configuración privada. En el segundo campo va la **clave TOTP**, no el código temporal de seis dígitos.

Render asigna una URL HTTPS propia. El servidor la toma de `RENDER_EXTERNAL_URL` si no defines `NUBE_PUBLIC_ORIGIN`; por tanto, puedes preparar el piloto antes de comprar un dominio. Para venta pública conviene fijar primero la dirección que se incluirá en el instalador.

La plantilla conserva `NUBE_ADMIN_OWNER=local-test` para que puedas trasladar las cuentas de tu prueba Windows. Si tu base usa otro propietario, conserva ese valor. Cambiarlo no transfiere las cuentas: puede hacer que el panel parezca vacío.

El contenedor ajusta permisos del disco y ejecuta Node como el usuario `node`. Solo expón el puerto mediante el proxy HTTPS. `FAMBIT_TRUST_PROXY_HOPS=1` se propone para ese despliegue; comprueba las cabeceras del proxy real y los límites antes del piloto. Fuera de ese entorno usa cero hasta configurar una cadena de proxies conocida.

La plantilla usa planes y campos de la [referencia de Blueprints de Render](https://render.com/docs/blueprint-spec). Render documenta que los [archivos fuera del disco persistente](https://render.com/docs/disks) se pierden entre reinicios y despliegues, y que una instancia con disco tiene una interrupción al actualizarse. Consulta el precio vigente en tu cuenta antes de contratar; no se ha cotizado ni pagado un servicio desde esta entrega.

## 3. Trasladar tus familias y licencias

Los datos actuales están en `%LOCALAPPDATA%\NubeBIM\TestServer`. El ZIP fuente no contiene tus familias ni tus cuentas.

1. Detén el servidor Windows con `Ctrl+C`.
2. Crea una copia consistente en una carpeta nueva. Desde PowerShell, en la raíz del paquete:

```powershell
$origenFambit = Join-Path $env:LOCALAPPDATA 'NubeBIM\TestServer'
$copiaFambit = Join-Path $env:USERPROFILE ('Documents\FAMBIT-copia-' + (Get-Date -Format yyyyMMdd-HHmmss))
node selfhost/backup.mjs create $origenFambit $copiaFambit
```

3. Comprueba la restauración en otra carpeta nueva con `node selfhost/backup.mjs restore ORIGEN_COPIA DESTINO_NUEVO`. No sustituyas los originales hasta comparar biblioteca, licencias e imágenes.
4. Transfiere esa copia de forma privada al disco del servicio. La migración debe hacerse con el servidor de aplicación detenido o en el modo de mantenimiento descrito abajo. La carpeta final de datos debe contener `nube.sqlite` y `objects`, y conservar el propietario de los registros.
5. Entra en `/admin` con tu nueva contraseña y autenticador. Verifica que aparecen las cuentas y familias originales.

La copia incluye una instantánea SQLite producida con `VACUUM INTO`, los archivos y un manifiesto de hashes. La restauración verifica el manifiesto y rechaza destinos existentes. [SQLite documenta que VACUUM INTO produce una copia consistente](https://sqlite.org/lang_vacuum.html). El script bloquea una copia mientras el servidor de esta versión usa la misma carpeta; aun así, debes detener cualquier servidor de una versión anterior.

Las claves de clientes siguen siendo válidas si conservas la base. La dirección nueva requiere activar el complemento contra ese servidor. El dispositivo mantiene su identidad si no se borran sus datos de perfil. No existe sincronización automática con el panel privado de ChatGPT.

## 4. Generar el instalador para los clientes

1. Comprueba que la URL del servidor abre y que `/healthz` responde con `service: FAMBIT`, `status: ok` y `production: true`.
2. Cierra Revit y ejecuta `Preparar-Instalador-Comercial.cmd` en Windows.
3. Introduce la dirección HTTPS del servidor, sin `/api`. El asistente comprueba el servidor y solicita el año de Revit; por defecto propone 2025.
4. El script detecta el perfil de Revit instalado y compila sin el modo `LocalTest`.
5. El archivo resultante aparecerá en `artifacts\installer`, por ejemplo `FAMBIT-Setup-0.4.0-Revit2025.exe`.
6. Prueba ese EXE en otra computadora. El cliente necesita Revit compatible, conexión a internet y licencia FAMBIT. No necesita Node, SDK de compilación, Inno Setup ni el servidor local.

El usuario ya confirmó que la versión 0.2.0 funciona en su equipo. Esta entrega conserva la carga y colocación de familias de 0.3.0. Eso **no confirma** todavía la compilación ni la instalación comercial de 0.4.0; prueba cada año y actualización antes de anunciar compatibilidad.

## 5. Firma, descarga y versiones

Con un certificado de firma de código y SignTool instalado, el script `installer/firmar.ps1` firma y verifica el EXE, y vuelve a calcular su SHA-256:

```powershell
.\installer\firmar.ps1 -Installer 'RUTA-DEL-EXE' -CertificateThumbprint 'HUELLA-DEL-CERTIFICADO' -SignTool 'RUTA-DE-SIGNTOOL'
```

Las rutas y la huella son marcadores para sustituir, no comandos listos para ejecutar. [Microsoft documenta SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool), los algoritmos de firma y la verificación. El script requiere un certificado del almacén del usuario; otros proveedores de firma pueden necesitar una integración específica. No incluye un certificado ni se ha firmado un EXE aquí.

Aloja el EXE final en una dirección HTTPS de descarga y añade en Render:

| Variable | Valor que debes proporcionar |
|---|---|
| `FAMBIT_DOWNLOAD_URL` | Enlace HTTPS al EXE probado. |
| `FAMBIT_DOWNLOAD_VERSION` | Versión del EXE, por ejemplo `0.4.0`. |
| `FAMBIT_DOWNLOAD_REVIT` | Años comprobados incluidos en ese EXE, por ejemplo `2025`. |
| `FAMBIT_CONTACT_EMAIL` | Correo comercial que tú elijas. |

Mientras no exista ese enlace, la página indica que el lanzamiento está en preparación. No muestra un botón que descargue un ZIP de código. No se han definido precios ni un correo comercial ficticio.

Registra la misma versión, enlace, novedades y SHA-256 en **Add-in y versiones** del panel. La web pública usa estas variables; el catálogo de actualizaciones usa los registros del panel. Debes mantener ambos datos coherentes. El complemento abre el enlace en el navegador: la actualización no es silenciosa.

## 6. Copias del servidor y recuperación

La entrega incluye una copia **manual con mantenimiento**; aún no programa respaldos diarios ni los transfiere automáticamente a otro proveedor.

En Render puedes crear una copia consistente sin ejecutar el servidor sobre la misma carpeta:

1. Programa una ventana de mantenimiento. En el servicio, cambia temporalmente **Docker Command** a `node selfhost/maintenance.mjs` y despliega. El servicio normal termina antes del cambio de instancia.
2. El proceso crea una copia en `/var/data/backups/fambit-FECHA`, informa su ruta en los registros y permanece en mantenimiento. La API devuelve 503; `/healthz` indica mantenimiento. No se permiten operaciones de clientes durante este período.
3. Transfiere el directorio de copia completo a un almacenamiento externo privado. Render documenta [SCP y las opciones de transferencia](https://render.com/docs/disks). Verifica la restauración y los hashes en un destino nuevo.
4. Restablece **Docker Command** a `node selfhost/server.mjs` y despliega. Comprueba una activación y una descarga.

Antes de vender, fija una frecuencia de respaldo, retención, responsable y copia fuera del mismo disco. Una copia dentro del servicio no protege frente a la pérdida total de ese disco. Las copias crecen con el catálogo; controla el espacio disponible. La puesta en marcha real de este procedimiento en Render sigue pendiente.

Si un cierre forzado deja `.fambit-lock.json`, el servidor solo limpia automáticamente un PID inexistente del mismo host. Si cambió el contenedor, verifica primero que no hay otra instancia ni copia activa y elimina **solo ese archivo de bloqueo** desde el mantenimiento. No borres `nube.sqlite`, sus archivos WAL/SHM ni `objects` para resolver el bloqueo.

La recuperación de una copia debe usar una carpeta nueva y su configuración de propietario. Reemplaza la carpeta operativa únicamente con el servicio en mantenimiento, conserva la anterior y revisa permisos del usuario `node`. Las credenciales de Render y la clave del autenticador requieren su propia copia privada; no están dentro de la copia de la biblioteca.

## 7. Control de licencias y piloto comercial

- Venta inicial manual: recibes el pago, creas una cuenta, defines vencimiento y equipos, y entregas correo, clave y enlace al EXE.
- Desde **Cuentas y licencias** puedes suspender, renovar, liberar instalaciones y rotar una clave. Una licencia suspendida o vencida bloquea futuras solicitudes.
- Una familia ya incorporada al proyecto del cliente permanece allí. La licencia controla acceso al repositorio y nuevas descargas.
- Las sesiones del cliente duran hasta 30 días o hasta el vencimiento de la licencia; después requieren activación de nuevo. No hay modo sin conexión ni renovación automática de sesión.
- La sesión administrativa caduca tras 30 minutos sin actividad o a las ocho horas, y se invalida al cerrar sesión o reiniciar el servidor. TOTP tolera un paso de 30 segundos a cada lado y rechaza reutilización; usa la hora automática en servidor y teléfono.
- Los pagos automáticos, entrega por correo y varios administradores con permisos diferentes no forman parte de esta entrega.

El piloto debe comprobar instalación/desinstalación, licencia incorrecta, vencimiento, suspensión, segundo equipo, carga de una familia real, pérdida de conexión y actualización. Define precio, duración, soporte y condiciones de uso antes de abrir ventas. No se han realizado esas pruebas externas ni publicado una oferta de venta.

Referencias de acceso: [OWASP sobre sesiones y cookies](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) y [RFC 6238 sobre TOTP](https://www.rfc-editor.org/rfc/rfc6238). Las pruebas del proyecto verifican el comportamiento implementado; no constituyen una auditoría externa de seguridad.
