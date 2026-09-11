import {randomBytes} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {base32} from './auth.mjs';

export async function provision(destination) {
  const directory = resolve(destination);
  // Fail if the chosen directory exists; never silently rotate live credentials.
  await mkdir(directory, {mode:0o700});
  const password = randomBytes(24).toString('base64url'), secret = base32(randomBytes(20));
  await writeFile(join(directory, 'servidor.env'), 'NUBE_ADMIN_USER=admin\nNUBE_ADMIN_PASSWORD=' + password + '\nFAMBIT_ADMIN_TOTP_SECRET=' + secret + '\n', {mode:0o600, flag:'wx'});
  const page = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Configurar acceso FAMBIT</title><style>body{font:16px/1.7 'Segoe UI',sans-serif;color:#263345;max-width:700px;margin:50px auto;padding:24px}h1{color:#14191f}code{display:block;overflow-wrap:anywhere;padding:16px;border:1px solid #dae0e8;border-radius:8px;background:#f5f7fa}p{margin:22px 0}strong{font-weight:600}</style><h1>Tu acceso administrativo a FAMBIT</h1><p>Este archivo contiene tus credenciales. Guárdalo en un lugar privado. No lo subas a GitHub, no lo adjuntes al chat y no lo entregues a clientes.</p><p><strong>1. Usuario:</strong> admin</p><p><strong>2. Contraseña del panel:</strong></p><code>${password}</code><p><strong>3. Configura tu autenticador.</strong> Añade una cuenta con clave manual: nombre FAMBIT, tipo basado en tiempo (TOTP), seis dígitos y período de 30 segundos.</p><code>${secret}</code><p>En Render, copia la contraseña al campo <b>NUBE_ADMIN_PASSWORD</b> y la clave del autenticador al campo <b>FAMBIT_ADMIN_TOTP_SECRET</b>. No copies el código temporal de seis dígitos en ese campo.</p><p>Al abrir el panel, escribe usuario, contraseña y el código actual de tu aplicación. Si un código ya se utilizó, espera al siguiente.</p><p>Conserva una copia privada de esta configuración para recuperar el acceso si cambias de teléfono. Estas credenciales no son licencias de clientes.</p></html>`;
  await writeFile(join(directory, 'ABRIR-CONFIGURACION.html'), page, {mode:0o600, flag:'wx'});
  return directory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Indica una carpeta nueva, fuera del proyecto, para guardar la configuración privada.');
    console.log('Configuración privada creada en: ' + await provision(process.argv[2]));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
