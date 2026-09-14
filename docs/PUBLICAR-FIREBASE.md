# FAMBIT 0.5.0 en Firebase

Esta entrega prepara Firebase Hosting, Authentication, Cloud Functions, Firestore y Cloud Storage. El cliente de Revit conserva el panel acoplable y el acceso mediante correo + licencia. El administrador usa correo + contraseña de Firebase y un código de autenticador. Render deja de ser necesario para este despliegue.

**El código no equivale a un servicio ya publicado.** Falta conectar tu proyecto, desplegar, trasladar tu biblioteca real, compilar el EXE y probarlo en Windows/Revit. El repositorio no contiene un EXE de esta versión. Los archivos `.md` se leen; los asistentes `.cmd` se abren con doble clic en Windows.

## 1. Primero, decide sobre la facturación

Firebase **no permite todo este funcionamiento en Spark sin facturación**. Functions necesita Blaze para desplegar y Storage exige Blaze, incluso para conservar acceso a los buckets. Hay cuotas sin coste, pero el importe depende del uso y de la región. No puedo confirmar un coste mensual de cero. Consulta [precios](https://firebase.google.com/pricing), [requisitos de Storage](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) y [despliegue de Functions](https://firebase.google.com/docs/functions/get-started).

Los scripts no contratan servicios ni vinculan una tarjeta. Las pruebas con el proyecto ficticio `demo-fambit` son locales. Si no quieres habilitar facturación, puedes preparar y probar el código, pero no publicar esta arquitectura completa en Firebase.

Controles incluidos para empezar con poco tráfico:

| Control de FAMBIT | Valor inicial | Alcance |
|---|---|---|
| Instancias de Functions | 0 en reposo, máximo 2 configurado | Reduce consumo en reposo; puede haber arranque en frío y saturación. |
| Descargas desde la API | 256 MiB por día UTC | Incluye RFA y miniaturas, también las del administrador. Al alcanzarlo devuelve 429. |
| Biblioteca activa | 1.024 MiB | Suma archivos y miniaturas referenciados. Rechaza subidas que lo superen. |
| Archivos | RFA 25 MiB; PNG/JPG 2 MiB | Rechaza adjuntos mayores. |
| Intentos de activación e inicio de sesión | Límites por minuto y globales | Persisten entre instancias. |

Estos controles **no son un tope de facturación**. El EXE público y los recursos web consumen Hosting por separado. También cuentan operaciones de Firestore/Storage, imágenes de compilación, secretos y posibles versiones retenidas de objetos. Las alertas de presupuesto avisan; no cortan automáticamente el gasto. Configura un presupuesto pequeño, revisa las alertas y los paneles de consumo, y revisa la retención de Artifact Registry y Storage. [Guía oficial para evitar cargos inesperados](https://firebase.google.com/docs/projects/billing/avoid-surprise-bills).

## 2. Crea el proyecto una sola vez

En [Firebase Console](https://console.firebase.google.com/), con tu cuenta propietaria:

1. Crea un proyecto. Guarda su **ID exacto**: no es el nombre visible ni el número del proyecto. Ejemplo ficticio: `fambit-tuempresa`.
2. Registra una **aplicación web** desde Configuración del proyecto. No hace falta activar Analytics. Hosting proporciona la configuración pública en `/__/firebase/init.json`; no se pega una cuenta de servicio en el navegador. [Configuración reservada de Hosting](https://firebase.google.com/docs/hosting/reserved-urls).
3. En Authentication, habilita **Email/Password**. En Users, crea tu usuario administrador con tu correo y una contraseña fuerte. Copia su **UID**. Crear otros usuarios no les dará acceso al panel: la API solo admite el UID configurado.
4. Cuando aceptes las condiciones de Blaze, habilita la facturación en tu propia cuenta. Crea Firestore **Standard, Native mode**, base `(default)`, en `us-central1`, con reglas de producción.
5. Crea Storage en `us-central1`, también con reglas de producción. Copia el nombre del bucket sin `gs://`: para un proyecto nuevo suele ser `ID.firebasestorage.app`. Si Firebase muestra otro nombre, usa exactamente ese. La región debe elegirse antes de cargar datos; la función está configurada en `us-central1`.

**No subas los RFA a GitHub ni los hagas públicos en Storage.** Los archivos se cargan desde el panel y la API comprueba la licencia al descargarlos. Las reglas incluidas deniegan el acceso directo de clientes, incluso de un usuario autenticado en Firebase. El servidor usa su identidad IAM. [Reglas y bibliotecas de servidor](https://firebase.google.com/docs/firestore/security/get-started).

## 3. Configura tu copia del código en Windows

Descarga esta rama del repositorio y extrae el ZIP completo. Usa una carpeta nueva para 0.5.0 y conserva tu servidor local anterior con sus datos.

Instala [Node.js 22 LTS](https://nodejs.org/en/download). Para probar los emuladores necesitas además Java 21. Para construir el complemento necesitas el SDK .NET, Inno Setup 6 y Revit, como en tu prueba anterior.

Haz doble clic en **`Configurar-Firebase.cmd`**. Instala las dependencias fijadas y te pide:

| Pregunta | Qué copiar |
|---|---|
| ID del proyecto | Configuración del proyecto → ID del proyecto. |
| UID del administrador | Authentication → Users → tu usuario → UID. |
| Bucket | Storage → nombre del bucket, sin `gs://`. |

Al terminar abre una página privada del autenticador. Añade esa clave como cuenta **basada en tiempo** en tu aplicación de autenticación. Guarda su copia de recuperación. La clave queda fuera del repositorio, en `%LOCALAPPDATA%\FAMBIT\Firebase\ID\`; no se entrega a clientes. ID, UID y bucket son configuración; contraseña, clave TOTP y credenciales de servicio son privadas.

Para usar tu dominio propio desde el inicio, ejecuta `node firebase/configure.mjs --project ID --uid UID --bucket BUCKET --origin https://tu-dominio` en vez del asistente y configura ese dominio en Hosting. Usa el mismo origen para entrar al panel y compilar el add-in. Cambiar el dominio posteriormente requiere otra configuración del cliente.

## 4. Publica el servidor y entra al panel

Haz doble clic en **`Publicar-Firebase.cmd`**. Te pedirá iniciar sesión con Google en el navegador. Revisa que sea la cuenta propietaria del proyecto. Publica Hosting, la función `fambitApi`, reglas e índices y sube el secreto del autenticador a Secret Manager. Después comprueba `/healthz`.

Direcciones, reemplazando `ID`:

- Web: `https://ID.web.app`
- Panel: `https://ID.web.app/admin`
- API del complemento: `https://ID.web.app/api/`

Entra al panel con correo, contraseña y código de seis dígitos. Si pide verificar el correo, pulsa **Enviar verificación**, abre el enlace del mensaje y vuelve a entrar. No existe registro público de administradores. Solo hay una sesión administrativa activa; caduca tras 30 minutos sin actividad o 8 horas desde el inicio. Un código ya utilizado no se admite otra vez.

**Permisos del servidor:** comprueba la cuenta de servicio de ejecución de `fambitApi` en Google Cloud. En proyectos nuevos puede no tener permisos automáticos. Necesita `roles/datastore.user` sobre el proyecto, `roles/firebaseauth.admin` para verificar usuarios/sesiones y `roles/storage.objectAdmin` sobre el bucket de FAMBIT. El despliegue debe conceder acceso al secreto específico. No conviertas el bucket en público ni abras las reglas para solucionar un 503. El UID del panel no sustituye esos permisos IAM. [Roles de Firebase](https://firebase.google.com/docs/projects/iam/roles-predefined-product), [identidad de ejecución de Functions](https://firebase.google.com/docs/functions/manage-functions).

Si Firebase pide configurar la limpieza de imágenes de compilación, elige una retención corta apropiada. El estado `/healthz` comprueba Firestore y la configuración básica; no demuestra todavía una descarga, una firma digital ni el funcionamiento en Revit.

## 5. Conserva tus familias y licencias anteriores

GitHub contiene el código; tu biblioteca de prueba sigue en tu computadora. Puedes empezar vacío y volver a subir la familia desde el panel, o importar una copia para conservar tus licencias y equipos.

Para importar, **hazlo antes de crear cuentas o familias nuevas en Firebase**. Detén el servidor local y crea una copia privada con la herramienta existente. Ejemplo en PowerShell, sustituyendo la carpeta de destino por una nueva:

```powershell
node selfhost/backup.mjs create "$env:LOCALAPPDATA\NubeBIM\TestServer" 'D:\Copias-FAMBIT\antes-firebase'
node firebase/migrate.mjs --from 'D:\Copias-FAMBIT\antes-firebase' --owner local-test
```

El segundo comando solo revisa y muestra cantidades. Comprueba el propietario de tu servidor: el valor predeterminado del ensayo anterior es `local-test`. Si usaste otro, configúralo también mediante `firebase/configure.mjs --owner TU_PROPIETARIO` antes de publicar.

La importación y la limpieza técnica usan credenciales locales de Google Cloud, independientes de `firebase login`. Instala Google Cloud CLI y autentícate en tu PC con `gcloud auth application-default login`; concede a tu cuenta acceso a Firestore y al bucket. No descargues ni compartas una clave privada de cuenta de servicio para hacer esto. [Credenciales locales oficiales](https://cloud.google.com/docs/authentication/set-up-adc-local-dev-environment).

```powershell
node firebase/migrate.mjs --from 'D:\Copias-FAMBIT\antes-firebase' --owner local-test --project ID --bucket BUCKET --apply
```

Se verifican el manifiesto y los SHA-256, se conserva identidad, revisión, vencimiento, hashes de licencia y equipos. La API queda en mantenimiento durante la importación. Si se interrumpe, repite con **la misma copia** para reanudar. Rechaza mezclar una biblioteca existente o volver a importar después de terminar. Conserva el original hasta probar los datos importados.

Al cambiar de servidor, vuelve a introducir correo y licencia en el add-in: las credenciales locales están asociadas a la URL de la API. La migración no recupera el texto de una clave que ya se guardó como hash; si no la conservas, rótala desde el panel.

## 6. Compila, prueba y publica el EXE

1. Cierra Revit y ejecuta **`Preparar-Instalador-Comercial.cmd`**. Usa `https://ID.web.app`, sin `/api`, y elige 2025 para tu primera prueba.
2. El resultado se guarda en `artifacts\installer`: EXE, SHA-256 y `.exe.release.json`. El manifiesto permite comprobar que el instalador apunta a este servidor y no a `127.0.0.1`.
3. Instálalo en otra computadora con la versión de Revit correspondiente. Crea una licencia en el panel y comprueba activación, imagen, carga/colocación de una familia real, límite de equipos, suspensión y reactivación. Repite por cada versión que anuncies como compatible. No se han probado aquí las nuevas DLL de 0.5.0.
4. Firma el EXE final con tu certificado de editor usando `installer/firmar.ps1`. El script verifica la firma y actualiza el hash y el manifiesto. La firma se gestiona por separado de Firebase; no hay un certificado incluido.
5. Haz doble clic en **`Publicar-Instalador-Firebase.cmd`** y selecciona el EXE final. El script verifica el contenedor PE, el servidor y SHA-256 contra el manifiesto; publica el archivo en Hosting y comprueba el hash de la descarga real. No ejecuta el EXE. Un EXE sin firma puede usarse en un piloto identificado, pero Windows puede mostrar editor desconocido.
6. La portada activa el botón de descarga con la versión y años incluidos. En el panel **Versiones**, registra la URL HTTPS y SHA-256 que imprime el asistente para anunciar la actualización. Conserva el EXE local seleccionado: se reutiliza al volver a publicar la web.

Los clientes reciben solo el instalador y su licencia. No necesitan Node, Firebase CLI, el SDK .NET ni tu servidor local. Sí necesitan Revit compatible e internet. La licencia controla nuevas descargas y acceso; no retira familias que ya están colocadas en sus proyectos.

## 7. Operación y recuperación

- Crea, renueva o suspende licencias en el panel; libera un equipo al cambiar de computadora. La clave nueva se muestra una vez: consérvala solo para entregarla al cliente por el canal que elijas.
- Sube familias y miniaturas desde Biblioteca. El cliente ve cambios al actualizar el catálogo. La paginación conserva las familias después de las primeras 100.
- En el panel, **Consumo** muestra bytes de la API y la biblioteca activa. No es una factura. Para cambiar los topes edita `FAMBIT_DAILY_DOWNLOAD_MIB` y `FAMBIT_STORAGE_LIMIT_MIB` en `firebase/functions/.env.ID` y vuelve a publicar.
- Respalda Firestore y los objetos de Storage juntos, además de la recuperación del autenticador. Configura una política de copias según lo que puedas perder y ensaya la restauración en otro proyecto. Las copias administradas pueden tener coste; esta entrega no activa tareas de respaldo de pago. [Copias de Firestore](https://firebase.google.com/docs/firestore/backups).
- Si falla el borrado de un archivo sustituido, queda en la colección `objectCleanup`. Revisa hasta 100 trabajos con `node firebase/cleanup.mjs --project ID --bucket BUCKET`; añade `--apply` para borrar solo objetos que ya no están referenciados por una familia. La retención de Storage puede conservar bytes facturables aunque el borrado lógico termine.
- Si pierdes la clave TOTP publicada, restaura la copia privada. Para rotarla, cambia el secreto en Secret Manager, configura tu autenticador con la nueva clave y vuelve a desplegar la función; la configuración local debe corresponder a ese mismo secreto. No borres la verificación del panel como método de recuperación.

No detengas el servidor anterior hasta validar la nueva instalación y conservar una copia recuperable. Esta versión prepara venta con entrega y activación manuales. Cobros automáticos, correo comercial, precios, soporte y condiciones de venta aún deben definirse.

## Pruebas para desarrollo

```powershell
npm run build:firebase
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run test:firebase
```

`Probar-Firebase.cmd` ejecuta los emuladores con Node 22 y Java 21. Usa un proyecto `demo-`, cuentas y contenedores RFA sintéticos, sin tu proyecto real. En contenedores que impiden sockets Unix puede usarse `node scripts/test-firebase.mjs --http`: ejecuta el mismo manejador HTTP con Auth/Firestore/Storage emulados, pero no sustituye la prueba de la reescritura Hosting → Functions. GitHub Actions incluye la prueba completa; consulta el resultado del commit, no solo la existencia del workflow.

La dependencia transitiva de `gaxios@6.7.1` se fija a `uuid@11.1.1` por [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). Gaxios usa la interfaz CommonJS `v4`; la subida y descarga con el SDK se comprueban con emuladores. Revisa este override al actualizar Storage/Gaxios.
