# Contrato del servidor

Todas las respuestas de datos usan JSON y `Cache-Control: no-store`. Los errores tienen `{ "error": "mensaje" }`. Las rutas indicadas cuelgan de `/api`.

| Método y ruta | Acceso | Función |
|---|---|---|
| POST `/client/activate` | Correo + clave | Activa un equipo y entrega token. |
| GET `/client/session` | Bearer | Comprueba estado y vencimiento. |
| DELETE `/client/session` | Bearer activo | Cierra sesión y libera el equipo. |
| GET `/client/categories` | Bearer | Disciplinas, colores y subcategorías. |
| GET `/categories` | Administrador | La misma jerarquía. |
| GET `/client/families?revit=2024` | Bearer | Catálogo publicado compatible según versión declarada. |
| GET `/client/families/{id}/file?revit=2024` | Bearer | Descarga RFA autorizado; cabecera `X-Content-SHA256`. |
| GET `/client/families/{id}/thumbnail?revit=2024` | Bearer | Miniatura autorizada, si existe. |
| GET `/client/releases` | Bearer | Versiones registradas del instalador. |
| GET `/families` | Administrador | Listado, incluidas familias ocultas. |
| POST `/families` | Administrador | Publica o edita familia por su ID, con reemplazo de archivo opcional. |
| PATCH `/families/{id}` | Administrador | Cambia `published`. |
| GET `/families/{id}/file` | Administrador | Descarga administrativa. |
| GET `/licenses` | Administrador | Cuentas y equipos; nunca clave completa ni hash. |
| POST `/licenses` | Administrador | Crea cuenta; devuelve clave una sola vez. |
| PATCH `/licenses/{id}` | Administrador | Estado, vencimiento, límite, rotación. |
| DELETE `/devices/{id}` | Administrador | Revoca el equipo y libera capacidad. |
| GET/POST `/releases` | Administrador | Consulta o registra instaladores. |

Activación:

```json
{"email":"usuario@ejemplo.com","key":"CLAVE_ENTREGADA_POR_ADMIN","deviceId":"identificador-estable-de-instalacion","deviceName":"PC-ESTUDIO"}
```

Creación de cuenta: `{name, email, expires, maxDevices}`. `expires` es una fecha UTC en segundos Unix, no milisegundos. Una cuenta corresponde a una licencia por correo y propietario. La clave tiene 160 bits aleatorios, prefijo `FAMBIT-` (las claves `NUBE-` anteriores siguen siendo válidas), y el token de sesión tiene 256 bits. Se comparan hashes SHA-256 en el servidor.

Subir familia: `multipart/form-data` con `name`, `category`, `subcategory`, `revit`, `description`, `file` y `thumbnail` opcional. Para editar se añade `id`; el RFA es obligatorio al crear y opcional al editar. Sin RFA nuevo se conserva el objeto, tamaño, hash y revisión. Solo el reemplazo del archivo incrementa `revision`. `subcategory` debe pertenecer a `category`; al omitirla se usa `otros`, salvo las categorías antiguas que se normalizan. Los listados devuelven `hasThumbnail` como booleano JSON. Límite RFA: 25 MiB; miniatura: 2 MiB. No se deben subir familias sin derechos de distribución.

La asignación de plazas usa un `INSERT ... SELECT` condicional y una restricción única por licencia/dispositivo. La caducidad, suspensión y existencia de la sesión se revisan de nuevo en cada petición. Una respuesta ya iniciada no puede cancelarse retroactivamente mediante suspensión.

Panel portable 0.4.0: sesión mediante cookie HttpOnly/SameSite=Strict, con Secure y segundo factor TOTP en producción; login en `/admin/login` y cierre en `/admin/logout`. Se verifica `Origin` en login, logout y cambios administrativos. HTTP Basic ya no se acepta. Los endpoints `/client/` validan el token del cliente, sin aceptar identidades de administrador enviadas por el usuario. Panel privado: identidad suministrada por su plataforma, aislamiento por propietario.
