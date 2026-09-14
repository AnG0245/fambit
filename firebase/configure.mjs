import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {stdin, stdout} from 'node:process';
import {base32, configuration, totp} from './functions/core.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const escape = s => String(s).replace(/[&<>"']/g, x => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[x]));
async function optional(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
export async function configure({projectId, uid, bucket = projectId + '.firebasestorage.app', owner = 'local-test', origin = `https://${projectId}.web.app`, directory = root, privateDirectory}) {
  if (projectId.startsWith('demo-')) throw new Error('Para publicar usa el ID de tu proyecto real, sin el prefijo demo-.');
  if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(uid || '')) throw new Error('Copia el UID del administrador desde Firebase Authentication.');
  const config = configuration({GCLOUD_PROJECT: projectId, FAMBIT_ADMIN_UID: uid, FAMBIT_PUBLIC_ORIGIN: origin, FAMBIT_OWNER_ID: owner, FAMBIT_STORAGE_BUCKET: bucket});
  const localPath = join(directory, 'firebase/.local-config.json'), previous = await optional(localPath), rc = await optional(join(directory, '.firebaserc'));
  if ((previous && previous.projectId !== projectId) || (rc?.projects?.default && rc.projects.default !== projectId)) throw new Error('Esta carpeta ya está configurada para otro proyecto. Usa una copia nueva para evitar publicar en el destino incorrecto.');
  const personal = privateDirectory || join(process.env.LOCALAPPDATA || join(homedir(), '.config'), 'FAMBIT', 'Firebase', projectId);
  await mkdir(personal, {recursive: true, mode: 0o700});
  const secretFile = join(personal, 'autenticador.key'), authenticatorPage = join(personal, 'ABRIR-AUTENTICADOR.html');
  let secret;
  try { secret = (await readFile(secretFile, 'utf8')).trim(); totp(secret); }
  catch (e) {
    if (e.code !== 'ENOENT') throw e;
    if (previous?.secretPublished) throw new Error('Falta la clave del autenticador ya publicado. Restaura tu copia privada antes de configurar de nuevo.');
    secret = base32(randomBytes(20)); await writeFile(secretFile, secret + '\n', {flag: 'wx', mode: 0o600});
  }
  await writeFile(authenticatorPage, `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autenticador de FAMBIT</title><style>body{font:17px system-ui;background:#f5f6f8;color:#202631;max-width:700px;margin:60px auto;padding:28px}main{background:white;padding:36px;border-radius:18px}code{display:block;overflow-wrap:anywhere;background:#f0f2f5;padding:16px;font-size:19px}li{margin:16px 0}</style><main><h1>Protege tu administración</h1><p>Proyecto: <strong>${escape(projectId)}</strong></p><ol><li>Abre tu aplicación de autenticación y selecciona <strong>Introducir clave de configuración</strong>.</li><li>Nombre: FAMBIT. Tipo: <strong>Basada en tiempo</strong>.</li><li>Copia esta clave privada:<code>${escape(secret)}</code></li><li>Usa su código de seis dígitos al entrar al panel.</li></ol><p>Conserva este archivo como recuperación. No lo subas a GitHub ni lo compartas con clientes.</p></main></html>`, {mode: 0o600});
  await mkdir(join(directory, 'firebase/functions'), {recursive: true});
  await writeFile(join(directory, 'firebase/functions/.env.' + projectId), `FAMBIT_ADMIN_UID=${uid}\nFAMBIT_PUBLIC_ORIGIN=${config.origin}\nFAMBIT_OWNER_ID=${config.owner}\nFAMBIT_STORAGE_BUCKET=${config.bucket}\nFAMBIT_DAILY_DOWNLOAD_MIB=256\nFAMBIT_STORAGE_LIMIT_MIB=1024\n`, {mode: 0o600});
  await writeFile(join(directory, '.firebaserc'), JSON.stringify({...rc, projects: {...rc?.projects, default: projectId}}, null, 2) + '\n');
  const local = {...previous, projectId, uid, owner: config.owner, origin: config.origin, bucket: config.bucket, secretFile, authenticatorPage};
  await writeFile(localPath, JSON.stringify(local, null, 2) + '\n', {mode: 0o600});
  return {projectId, authenticatorPage};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const rl = createInterface({input: stdin, output: stdout});
  try {
    const args = process.argv.slice(2), option = flag => { const i = args.indexOf(flag); return i < 0 ? '' : args[i + 1]; };
    const projectId = option('--project') || (await rl.question('ID exacto del proyecto Firebase: ')).trim();
    const uid = option('--uid') || (await rl.question('UID del administrador (Authentication > Users): ')).trim();
    const bucket = option('--bucket') || (await rl.question(`Bucket de Storage (Enter = ${projectId}.firebasestorage.app): `)).trim() || projectId + '.firebasestorage.app';
    const result = await configure({projectId, uid, bucket, owner: option('--owner') || 'local-test', ...(option('--origin') ? {origin: option('--origin')} : {})});
    console.log('Configuración local lista. Abre el archivo del autenticador:'); console.log(result.authenticatorPage);
    console.log('No se creó ningún servicio ni se activó facturación.');
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { rl.close(); }
}
