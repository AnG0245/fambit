import {readFile, writeFile, access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {configuration, totp} from './functions/core.mjs';

const root = fileURLToPath(new URL('..', import.meta.url)), cli = join(root, 'firebase/tooling/node_modules/firebase-tools/lib/bin/firebase.js');
const run = args => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, {cwd: root, stdio: 'inherit'});
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('El comando no terminó. Revisa el mensaje anterior.')));
});
try {
  const localPath = join(root, 'firebase/.local-config.json'), config = JSON.parse(await readFile(localPath, 'utf8'));
  configuration({GCLOUD_PROJECT: config.projectId, FAMBIT_ADMIN_UID: config.uid, FAMBIT_PUBLIC_ORIGIN: config.origin, FAMBIT_OWNER_ID: config.owner, FAMBIT_STORAGE_BUCKET: config.bucket});
  if (config.projectId.startsWith('demo-') || Object.keys(process.env).some(k => k.endsWith('_EMULATOR_HOST') && process.env[k])) throw new Error('No publiques desde un entorno de emulación.');
  await access(cli); const secret = (await readFile(config.secretFile, 'utf8')).trim(); totp(secret);
  console.log(`Destino: ${config.projectId} · ${config.origin}`);
  console.log('Firebase requiere Blaze para Functions y Storage. Este programa no activa facturación ni crea una cuenta de pago.');
  await run(['scripts/build-firebase.mjs']);
  await run([cli, 'login']);
  if (!config.secretPublished) {
    await run([cli, 'functions:secrets:set', 'FAMBIT_ADMIN_TOTP_SECRET', '--project', config.projectId, '--data-file', config.secretFile]);
    config.secretPublished = true; await writeFile(localPath, JSON.stringify(config, null, 2) + '\n', {mode: 0o600});
  }
  await run([cli, 'deploy', '--project', config.projectId, '--only', 'hosting,functions:fambit,firestore:rules,firestore:indexes,storage']);
  const response = await fetch(config.origin + '/healthz', {signal: AbortSignal.timeout(60000)}), health = await response.json();
  if (!response.ok || health.service !== 'FAMBIT' || health.backend !== 'firebase' || health.status !== 'ok' || health.production !== true) throw new Error('El despliegue terminó, pero la comprobación del servidor falló. Revisa los registros de Firebase.');
  console.log('Servidor publicado y comprobación básica correcta.');
  console.log('Panel: ' + config.origin + '/admin'); console.log('API del instalador: ' + config.origin + '/api/');
  console.log('Prueba una licencia y una familia antes de distribuir el instalador.');
} catch (error) { console.error(error.code === 'ENOENT' ? 'Ejecuta primero Configurar-Firebase.cmd.' : error.message); process.exitCode = 1; }
