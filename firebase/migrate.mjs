import {DatabaseSync} from 'node:sqlite';
import {readFile, lstat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {hash, identifier, integer, MIB} from './functions/core.mjs';

const canonical = value => JSON.stringify(value && typeof value === 'object' ? Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))])) : value);
const allowed = name => name === 'nube.sqlite' || name === 'admin-totp.json' || /^objects\/[a-f0-9]{64}(?:\.json)?$/.test(name);
async function readRegular(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('La copia contiene un archivo no permitido.');
  return readFile(path);
}
export async function prepareMigration(source, owner) {
  source = resolve(source); identifier(owner);
  const manifestBytes = await readRegular(join(source, 'backup.json')), manifest = JSON.parse(manifestBytes.toString());
  if (manifest.format !== 'FAMBIT-backup-1' || !Array.isArray(manifest.files)) throw new Error('Usa una copia creada con selfhost/backup.mjs.');
  const files = new Map();
  for (const entry of manifest.files) {
    if (!allowed(entry.name) || files.has(entry.name) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Manifiesto de copia inválido.');
    const data = await readRegular(join(source, entry.name));
    if (hash(data) !== entry.sha256) throw new Error('La copia cambió o está incompleta: ' + entry.name);
    files.set(entry.name, entry.sha256);
  }
  if (!files.has('nube.sqlite')) throw new Error('La copia no incluye la base de datos.');
  const sql = new DatabaseSync(join(source, 'nube.sqlite'), {readOnly: true}), records = [], objects = [];
  let bytes = 0, families = 0, licenses = 0, devices = 0;
  try {
    if (sql.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('La base no pasó la comprobación de integridad.');
    for (const row of sql.prepare('SELECT * FROM licenses WHERE owner=?').all(owner)) {
      identifier(row.id); const linked = {};
      for (const d of sql.prepare('SELECT * FROM devices WHERE license_id=?').all(row.id)) {
        identifier(d.id); const deviceKey = hash(d.device_id);
        if (d.token_hash && !/^[a-f0-9]{64}$/.test(d.token_hash)) throw new Error('Hash de sesión inválido.');
        linked[deviceKey] = {id: d.id, deviceId: d.device_id, name: d.name, tokenHash: d.token_hash || '', tokenExpires: d.token_expires, lastSeen: d.last_seen};
        if (d.token_hash) records.push({path: 'clientTokens/' + d.token_hash, value: {licenseId: row.id, deviceKey, expires: d.token_expires}});
        devices++;
      }
      if (Object.keys(linked).length > row.max_devices || row.max_devices > 100 || !/^[a-f0-9]{64}$/.test(row.key_hash)) throw new Error('La licencia tiene equipos o límites inconsistentes.');
      const {id, ...value} = row;
      records.push({path: 'licenses/' + id, value: {...value, devices: linked}});
      records.push({path: 'licenseKeys/' + row.key_hash, value: {licenseId: id}});
      records.push({path: 'licenseAccounts/' + hash(owner + ':' + row.email), value: {licenseId: id}});
      licenses++;
    }
    for (const row of sql.prepare('SELECT * FROM families WHERE owner=?').all(owner)) {
      identifier(row.id); const {id, ...value} = row; let thumbnailSize = 0;
      for (const [column, kind] of [['object_key', 'file'], ['thumbnail_key', 'thumbnail']]) {
        const key = row[column]; if (!key) continue;
        if (!key.startsWith(owner + '/') || key.includes('..') || !/^[\w/.-]+$/.test(key)) throw new Error('Ruta de familia inválida.');
        const filename = 'objects/' + hash(key);
        if (!files.has(filename) || !files.has(filename + '.json')) throw new Error('Falta un archivo referenciado por la biblioteca.');
        const data = await readRegular(join(source, filename));
        const metadata = JSON.parse((await readRegular(join(source, filename + '.json'))).toString());
        if (kind === 'file' && (data.length !== row.size || hash(data) !== row.sha256 || data.length > 25 * MIB || data.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1')) throw new Error('La familia no pasó la comprobación de integridad.');
        if (kind === 'thumbnail' && (data.length > 2 * MIB || !['image/png', 'image/jpeg'].includes(metadata.httpMetadata?.contentType))) throw new Error('Miniatura inválida.');
        const targetKey = 'families/' + key;
        objects.push({path: join(source, filename), key: targetKey, sha256: hash(data), size: data.length, contentType: kind === 'file' ? 'application/octet-stream' : metadata.httpMetadata.contentType});
        value[column] = targetKey; bytes += data.length; if (kind === 'thumbnail') thumbnailSize = data.length;
      }
      records.push({path: 'families/' + id, value: {...value, thumbnail_size: thumbnailSize, etag: hash(canonical(row))}}); families++;
    }
    for (const row of sql.prepare('SELECT * FROM releases WHERE owner=?').all(owner)) {
      identifier(row.id); const {id, ...value} = row; records.push({path: 'releases/' + id, value});
    }
  } finally { sql.close(); }
  const paths = new Set();
  for (const record of records) { if (paths.has(record.path)) throw new Error('La copia contiene cuentas o registros duplicados.'); paths.add(record.path); }
  return {owner, fingerprint: hash(Buffer.concat([manifestBytes, Buffer.from(owner)])), records, objects, summary: {families, licenses, devices, bytes}};
}

export async function applyMigration(plan, {db, bucket, storageLimitBytes}) {
  if (plan.summary.bytes > storageLimitBytes) throw new Error('La copia supera el límite de almacenamiento configurado.');
  const stateRef = db.collection('system').doc('state');
  await db.runTransaction(async tx => {
    const state = (await tx.get(stateRef)).data();
    if (state) {
      if (state.fingerprint !== plan.fingerprint || state.owner !== plan.owner) throw new Error('El destino ya contiene otra biblioteca. No se sobrescribió.');
      if (state.status === 'ready') throw new Error('Esta copia ya se migró. No se repite una importación sobre datos activos.');
      if (state.status !== 'migrating') throw new Error('Estado de migración no reconocido.');
      return;
    }
    for (const name of ['licenses', 'licenseKeys', 'licenseAccounts', 'clientTokens', 'families', 'releases']) if (!(await tx.get(db.collection(name).limit(1))).empty) throw new Error('La migración requiere una base vacía.');
    tx.create(stateRef, {status: 'migrating', fingerprint: plan.fingerprint, owner: plan.owner});
  });
  // The API stays unavailable until all objects and records have been verified. Failed runs resume.
  for (const object of plan.objects) {
    const file = bucket.file(object.key), [exists] = await file.exists();
    if (exists) {
      const [data] = await file.download(); if (hash(data) !== object.sha256) throw new Error('El destino contiene un archivo distinto. No se sobrescribió.');
    } else {
      const data = await readRegular(object.path); if (hash(data) !== object.sha256) throw new Error('La copia cambió durante la migración.');
      await file.save(data, {resumable: false, validation: 'crc32c', preconditionOpts: {ifGenerationMatch: 0}, metadata: {contentType: object.contentType, cacheControl: 'private, no-store'}});
    }
  }
  for (let offset = 0; offset < plan.records.length; offset += 150) {
    const chunk = plan.records.slice(offset, offset + 150);
    await db.runTransaction(async tx => {
      const snapshots = await tx.getAll(...chunk.map(row => db.doc(row.path)));
      snapshots.forEach((doc, index) => {
        if (doc.exists && canonical(doc.data()) !== canonical(chunk[index].value)) throw new Error('Un registro del destino cambió. No se sobrescribió.');
        if (!doc.exists) tx.create(doc.ref, chunk[index].value);
      });
    });
  }
  await db.runTransaction(async tx => {
    const state = (await tx.get(stateRef)).data();
    if (state?.fingerprint !== plan.fingerprint || state.status !== 'migrating') throw new Error('Cambió el estado de la migración.');
    tx.set(db.collection('usage').doc('storage'), {bytes: plan.summary.bytes, updated: Math.floor(Date.now() / 1000)});
    tx.update(stateRef, {status: 'ready', completed: Math.floor(Date.now() / 1000)});
  });
  return plan.summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), value = flag => { const i = args.indexOf(flag); return i < 0 ? '' : args[i + 1] || ''; };
    const source = value('--from'), owner = value('--owner') || 'local-test';
    if (!source) throw new Error('Uso: node firebase/migrate.mjs --from CARPETA_COPIA --owner local-test [--project ID --bucket BUCKET --apply]');
    const plan = await prepareMigration(source, owner);
    console.log(JSON.stringify({mode: args.includes('--apply') ? 'import' : 'preview', ...plan.summary}));
    if (args.includes('--apply')) {
      const projectId = value('--project');
      if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new Error('Indica el ID exacto del proyecto con --project.');
      const require = createRequire(new URL('./functions/package.json', import.meta.url));
      const {initializeApp, deleteApp} = require('firebase-admin/app'), {getFirestore} = require('firebase-admin/firestore'), {getStorage} = require('firebase-admin/storage');
      const bucket = value('--bucket') || projectId + '.firebasestorage.app';
      const app = initializeApp({projectId, storageBucket: bucket});
      try { await applyMigration(plan, {db: getFirestore(app), bucket: getStorage(app).bucket(), storageLimitBytes: integer(value('--storage-limit-mib') || 1024, 25, 1048576) * MIB}); }
      finally { await deleteApp(app); }
      console.log('Migración completada. El servidor original conserva sus datos.');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
