// TCP test harness for containers that cannot open the Unix socket used by the Functions emulator.
// It calls the real exported Functions handler with real Firebase service emulators.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-fambit');
for (const k of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) assert.match(process.env[k] || '', /^127\.0\.0\.1:\d+$/);
Object.assign(process.env, {FUNCTIONS_EMULATOR: 'true', FAMBIT_ADMIN_UID: 'fambit-test-admin', FAMBIT_PUBLIC_ORIGIN: 'http://127.0.0.1:5002', FAMBIT_OWNER_ID: 'local-test', FAMBIT_STORAGE_BUCKET: 'demo-fambit.firebasestorage.app', FAMBIT_ADMIN_TOTP_SECRET: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', FAMBIT_TEST_API_ORIGIN: 'http://127.0.0.1:5002'});
const require = createRequire(new URL('../firebase/functions/package.json', import.meta.url)), express = require('express');
const {fambitApi} = await import('../firebase/functions/index.mjs');
const app = express();
app.use(express.raw({type: () => true, limit: '30mb'}));
app.use((req, res) => { req.rawBody = req.body; return fambitApi(req, res); });
const server = await new Promise(resolve => { const s = app.listen(5002, '127.0.0.1', () => resolve(s)); });
try {
  const code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['--test', '--test-timeout=120000', 'tests/firebase.test.mjs'], {stdio: 'inherit', env: process.env}); child.on('error', reject); child.on('exit', resolve); });
  process.exitCode = code || 0;
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
