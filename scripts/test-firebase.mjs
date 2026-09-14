import {readFile, writeFile, unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, {cwd: root, env, stdio: 'inherit'});
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('Las pruebas Firebase fallaron.')));
});
const changes = new Map();
async function temporary(name, content) {
  const path = join(root, name);
  try { changes.set(path, await readFile(path)); } catch (e) { if (e.code !== 'ENOENT') throw e; changes.set(path, null); }
  await writeFile(path, content, {mode: 0o600});
}
try {
  await run(['--test', 'tests/firebase-tools.test.mjs']);
  await run(['scripts/build-firebase.mjs', '--emulator']);
  await temporary('firebase/functions/.env.demo-fambit', 'FAMBIT_ADMIN_UID=fambit-test-admin\nFAMBIT_PUBLIC_ORIGIN=http://127.0.0.1:5000\nFAMBIT_OWNER_ID=local-test\nFAMBIT_STORAGE_BUCKET=demo-fambit.firebasestorage.app\n');
  // Published RFC test vector, used only with demo emulators; never a production secret.
  await temporary('firebase/functions/.secret.local', 'FAMBIT_ADMIN_TOTP_SECRET=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ\n');
  const config = JSON.parse(await readFile(join(root, 'firebase.json'), 'utf8'));
  const httpHarness = process.argv.includes('--http');
  if (httpHarness) { delete config.functions; config.hosting.rewrites = config.hosting.rewrites.filter(r => !r.function); }
  config.hosting.headers[0].headers = config.hosting.headers[0].headers.map(h => h.key === 'Content-Security-Policy' ? {...h, value: h.value.replace('connect-src ', 'connect-src http://127.0.0.1:9099 ')} : h);
  await temporary('firebase.emulators.local.json', JSON.stringify(config));
  await run(['firebase/tooling/node_modules/firebase-tools/lib/bin/firebase.js', 'emulators:exec', '--project', 'demo-fambit', '--config', 'firebase.emulators.local.json', '--only', httpHarness ? 'auth,firestore,storage,hosting' : 'auth,firestore,storage,functions,hosting', httpHarness ? 'node tests/firebase-http.mjs' : 'node --test --test-timeout=120000 tests/firebase.test.mjs'], {...process.env, CI: 'true', NO_PROXY: [process.env.NO_PROXY, 'localhost', '127.0.0.1', '::1'].filter(Boolean).join(',')});
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  for (const [path, data] of changes) {
    if (data === null) await unlink(path).catch(() => {}); else await writeFile(path, data);
  }
  // A later deploy never accidentally publishes the emulator's auth address.
  await run(['scripts/build-firebase.mjs']).catch(() => { process.exitCode = 1; });
}
