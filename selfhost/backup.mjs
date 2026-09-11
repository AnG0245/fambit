import {DatabaseSync} from 'node:sqlite';
import {mkdir, readFile, writeFile, readdir, lstat, copyFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {resolve, join, relative, isAbsolute, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {lockData} from './data-lock.mjs';

const allowed = name => name === 'nube.sqlite' || name === 'admin-totp.json' || /^objects\/[a-f0-9]{64}(?:\.json)?$/.test(name);
async function checksum(path) { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); }
function separate(source, target) {
  const inside = relative(source, target);
  if (!inside || (!inside.startsWith('..' + sep) && inside !== '..' && !isAbsolute(inside))) throw new Error('La copia debe quedar fuera de la carpeta original.');
}
async function fileCheck(path) { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink()) throw new Error('La copia contiene un archivo no permitido.'); }

export async function createBackup(source, target) {
  source = resolve(source); target = resolve(target); separate(source, target);
  await fileCheck(join(source, 'nube.sqlite'));
  const unlock = await lockData(source); let created = false;
  try {
    await mkdir(target, {mode:0o700}); created = true;
    const database = new DatabaseSync(join(source, 'nube.sqlite'));
    try {
      if (database.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('La base original requiere revisión.');
      database.prepare('VACUUM INTO ?').run(join(target, 'nube.sqlite'));
    } finally { database.close(); }
    await mkdir(join(target, 'objects'));
    const names = ['nube.sqlite'];
    for (const name of await readdir(join(source, 'objects'))) {
      if (name.endsWith('.tmp')) continue;
      if (!allowed('objects/' + name)) throw new Error('Archivo inesperado en el almacenamiento.');
      await fileCheck(join(source, 'objects', name));
      await copyFile(join(source, 'objects', name), join(target, 'objects', name)); names.push('objects/' + name);
    }
    try { await fileCheck(join(source, 'admin-totp.json')); await copyFile(join(source, 'admin-totp.json'), join(target, 'admin-totp.json')); names.push('admin-totp.json'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const files = [];
    for (const name of names.sort()) files.push({name, sha256:await checksum(join(target, name))});
    await writeFile(join(target, 'backup.json'), JSON.stringify({format:'FAMBIT-backup-1', created:new Date().toISOString(), files}, null, 2), {mode:0o600});
    return {directory:target, files:files.length};
  } catch (error) { if (created) await rm(target, {recursive:true, force:true}); throw error; }
  finally { await unlock(); }
}

export async function restoreBackup(source, target) {
  source = resolve(source); target = resolve(target); separate(source, target);
  const manifest = JSON.parse(await readFile(join(source, 'backup.json'), 'utf8'));
  if (manifest.format !== 'FAMBIT-backup-1' || !Array.isArray(manifest.files) || !manifest.files.some(f => f.name === 'nube.sqlite')) throw new Error('Copia no reconocida.');
  const names = new Set();
  for (const file of manifest.files) {
    if (!allowed(file.name) || !/^[a-f0-9]{64}$/.test(file.sha256) || names.has(file.name)) throw new Error('Manifiesto no válido.');
    names.add(file.name); await fileCheck(join(source, file.name));
    if (await checksum(join(source, file.name)) !== file.sha256) throw new Error('La copia está incompleta o ha cambiado: ' + file.name);
  }
  // Never overwrite the active database or an existing destination directory.
  await mkdir(target, {mode:0o700});
  try {
    await mkdir(join(target, 'objects'));
    for (const file of manifest.files) await copyFile(join(source, file.name), join(target, file.name));
    const database = new DatabaseSync(join(target, 'nube.sqlite'), {readOnly:true});
    try {
      if (database.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('La base restaurada no pasó la comprobación.');
      const owners = database.prepare('SELECT DISTINCT owner FROM licenses UNION SELECT DISTINCT owner FROM families').all().map(row => row.owner);
      return {directory:target, files:manifest.files.length, owners};
    } finally { database.close(); }
  } catch (error) { await rm(target, {recursive:true, force:true}); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, source, target] = process.argv.slice(2);
  try {
    if (!source || !target || !['create', 'restore'].includes(action)) throw new Error('Uso: node selfhost/backup.mjs create|restore ORIGEN DESTINO_NUEVO. Detén el servidor antes de crear una copia.');
    console.log(JSON.stringify(await (action === 'create' ? createBackup : restoreBackup)(source, target)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
