import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ApiError, configuration, totp, hash, MIB, cursorDecode, cursorEncode} from '../firebase/functions/core.mjs';
import {createApi} from '../firebase/functions/api.mjs';
import {createLimits} from '../firebase/functions/limits.mjs';
import {prepareMigration, applyMigration} from '../firebase/migrate.mjs';
import {openBindings} from '../selfhost/adapters.mjs';
import {createBackup} from '../selfhost/backup.mjs';

const require = createRequire(new URL('../firebase/functions/package.json', import.meta.url));
const {initializeApp, deleteApp} = require('firebase-admin/app'), {getFirestore} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth'), {getStorage} = require('firebase-admin/storage');
const projectId = 'demo-fambit', origin = process.env.FAMBIT_TEST_API_ORIGIN || 'http://127.0.0.1:5000';
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', password = 'Fambit-fixture-password-only-2026';
const testEnv = {...process.env, GCLOUD_PROJECT: projectId, FUNCTIONS_EMULATOR: 'true', FAMBIT_ADMIN_UID: 'fambit-test-admin', FAMBIT_PUBLIC_ORIGIN: origin, FAMBIT_OWNER_ID: 'local-test', FAMBIT_STORAGE_BUCKET: projectId + '.firebasestorage.app'};
const config = configuration(testEnv);
for (const variable of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) assert.match(process.env[variable] || '', /^127\.0\.0\.1:\d+$/, 'Never run these tests against a live project.');
const app = initializeApp({projectId, storageBucket: config.bucket}), db = getFirestore(app), auth = getAuth(app), bucket = getStorage(app).bucket();
const expires = Math.floor(Date.now() / 1000) + 86400;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=', 'base64');
const rfa = Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.from('Synthetic test container, not a real Revit family.')]);
let cookie = '', idToken = '';
async function request(path, {method = 'GET', data, form, bearer, admin = false, requestOrigin = origin, extra = {}} = {}) {
  const headers = {...extra};
  if (admin && cookie) headers.Cookie = cookie;
  if (bearer) headers.Authorization = 'Bearer ' + bearer;
  if (method !== 'GET') headers.Origin = requestOrigin;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(origin + path, {method, headers, body: form || (data === undefined ? undefined : JSON.stringify(data)), redirect: 'manual'});
}
const body = async response => { const data = await response.json(); assert.ok(response.ok, JSON.stringify({status: response.status, data})); return data; };
function familyForm(name = 'Mesa de prueba', revit = '2025', id = '') {
  const form = new FormData();
  for (const [k, v] of Object.entries({name, revit, category: 'arquitectura', subcategory: 'mesas', description: 'Prueba de migración Firebase'})) form.set(k, v);
  if (id) form.set('id', id);
  form.set('file', new File([rfa], 'mesa.rfa')); form.set('thumbnail', new File([png], 'mesa.png'));
  return form;
}

test('RFC TOTP vectors, strict production configuration and opaque cursor validation', () => {
  for (const [time, expected] of [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]) assert.equal(totp(secret, time * 1000, 8), expected);
  assert.throws(() => configuration({...testEnv, FUNCTIONS_EMULATOR: 'false'}));
  assert.throws(() => configuration({...testEnv, GCLOUD_PROJECT: 'real-project'}));
  assert.throws(() => configuration({...testEnv, FAMBIT_PUBLIC_ORIGIN: origin + '/api'}));
  assert.throws(() => cursorDecode('invalid=='));
  assert.deepEqual(cursorDecode(cursorEncode({id: 'abc', data: () => ({updated: 42})}, 'updated')), [42, 'abc']);
});

test('Firebase Hosting, Auth, Firestore and Storage integration', async t => {
  await auth.createUser({uid: config.uid, email: 'admin@example.test', password, emailVerified: true});
  const signedIn = await body(await fetch('http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: 'admin@example.test', password, returnSecureToken: true})}));
  idToken = signedIn.idToken;
  const loginData = {idToken, code: totp(secret)};
  await t.test('public portal, readiness and admin access fail closed', async () => {
    assert.match(await (await fetch('http://127.0.0.1:5000/')).text(), /FAMBIT/);
    const health = await body(await request('/healthz')); assert.equal(health.backend, 'firebase'); assert.equal(health.production, false);
    assert.equal((await request('/api/licenses')).status, 401);
    assert.equal((await request('/api/licenses', {extra: {Authorization: 'Basic ZmFrZTpmYWtl'}})).status, 401);
    assert.equal((await request('/api/admin/session', {method: 'POST', data: loginData, requestOrigin: 'https://attacker.invalid'})).status, 403);
    const response = await request('/api/admin/session', {method: 'POST', data: loginData});
    await body(response); const header = response.headers.get('set-cookie');
    assert.match(header, /^__session=/); assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/);
    cookie = header.split(';')[0]; assert.ok((await request('/api/admin/session', {admin: true})).ok);
    assert.equal((await request('/api/admin/session', {method: 'POST', data: loginData})).status, 403);
    const otherInstance = createApi({db, bucket, auth, config, secret: () => secret});
    const replay = await otherInstance(new Request(origin + '/api/admin/session', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json'}, body: JSON.stringify(loginData)}));
    assert.equal(replay.status, 403);
  });

  let license, tokenA, tokenB, family;
  await t.test('email uniqueness and simultaneous device activations are atomic', async () => {
    const input = {name: 'Cliente prueba', email: 'client@example.test', maxDevices: 2, expires};
    const duplicates = await Promise.all([1, 2].map(() => request('/api/licenses', {method: 'POST', admin: true, data: input})));
    assert.deepEqual(duplicates.map(r => r.status).sort(), [201, 409]);
    license = await body(duplicates.find(r => r.status === 201));
    const activations = await Promise.all(['a', 'b', 'c'].map(async deviceId => {
      const r = await request('/api/client/activate', {method: 'POST', data: {email: input.email, key: license.key, deviceId, deviceName: deviceId}});
      return {deviceId, status: r.status, value: await r.json()};
    }));
    assert.deepEqual(activations.map(r => r.status).sort(), [200, 200, 409]);
    [tokenA, tokenB] = activations.filter(r => r.status === 200);
    const renewed = await body(await request('/api/client/activate', {method: 'POST', data: {email: input.email, key: license.key, deviceId: tokenA.deviceId, deviceName: 'Equipo renovado'}}));
    assert.equal((await request('/api/client/session', {bearer: tokenA.value.token})).status, 401);
    tokenA.value = renewed;
    assert.equal((await request('/api/licenses', {bearer: renewed.token})).status, 401);
    assert.equal((await request('/api/client/licenses', {bearer: renewed.token})).status, 404);
    const list = await body(await request('/api/licenses', {admin: true})); assert.equal(list.licenses[0].device_count, 2);
    assert.ok(!JSON.stringify(list).includes('tokenHash')); assert.ok(!JSON.stringify(list).includes(license.key));
  });

  await t.test('private RFA and thumbnail uploads, integrity and version filtering', async () => {
    family = await body(await request('/api/families', {method: 'POST', admin: true, form: familyForm()}));
    const file = await request(`/api/client/families/${family.id}/file?revit=2025`, {bearer: tokenA.value.token});
    assert.equal(file.status, 200); assert.equal(file.headers.get('x-content-sha256'), hash(rfa)); assert.deepEqual(Buffer.from(await file.arrayBuffer()), rfa);
    assert.equal((await request(`/api/client/families/${family.id}/file?revit=2024`, {bearer: tokenA.value.token})).status, 409);
    assert.equal((await request(`/api/families/${family.id}/file`)).status, 401);
    const image = await request(`/api/client/families/${family.id}/thumbnail?revit=2025`, {bearer: tokenA.value.token}); assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal((await body(await request('/api/client/families?revit=2024', {bearer: tokenA.value.token}))).families.length, 0);
    const invalid = familyForm(); invalid.set('file', new File(['not rfa'], 'wrong.rfa'));
    assert.equal((await request('/api/families', {method: 'POST', admin: true, form: invalid})).status, 400);
    const old = (await db.collection('families').doc(family.id).get()).data();
    await body(await request('/api/families', {method: 'POST', admin: true, form: familyForm('Mesa revisada', '2025', family.id)}));
    assert.equal((await bucket.file(old.object_key).exists())[0], false);
    assert.equal((await db.collection('families').doc(family.id).get()).data().revision, 2);
  });

  await t.test('Firebase rules reject direct access even with an authenticated administrator', async () => {
    const target = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/licenses/${license.id}`;
    for (const authorization of ['', 'Bearer ' + idToken]) {
      const headers = authorization ? {Authorization: authorization} : {};
      const denied = await fetch(target, {headers}); assert.equal(denied.status, 403);
      const f = (await db.collection('families').doc(family.id).get()).data();
      const raw = await fetch(`http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${config.bucket}/o/${encodeURIComponent(f.object_key)}?alt=media`, {headers});
      assert.ok([401, 403].includes(raw.status));
    }
  });

  await t.test('pagination retains tied timestamps without leaking a hidden family', async () => {
    for (let i = 0; i < 4; i++) await body(await request('/api/families', {method: 'POST', admin: true, form: familyForm('Mesa ' + i)}));
    const ids = new Set(); let cursor = '';
    do {
      const page = await body(await request('/api/client/families?revit=2025&limit=2' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), {bearer: tokenA.value.token}));
      for (const f of page.families) { assert.ok(!ids.has(f.id)); ids.add(f.id); }
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(ids.size, 5);
    await body(await request('/api/families/' + family.id, {method: 'PATCH', admin: true, data: {published: false}}));
    assert.equal((await request(`/api/client/families/${family.id}/file?revit=2025`, {bearer: tokenA.value.token})).status, 404);
    await body(await request('/api/families/' + family.id, {method: 'PATCH', admin: true, data: {published: true}}));
  });

  await t.test('suspension, renewal, seat release and key rotation revoke access', async () => {
    await body(await request('/api/licenses/' + license.id, {method: 'PATCH', admin: true, data: {status: 'suspended'}}));
    assert.equal((await request('/api/client/session', {bearer: tokenA.value.token})).status, 403);
    await body(await request('/api/licenses/' + license.id, {method: 'PATCH', admin: true, data: {status: 'active'}}));
    const list = await body(await request('/api/licenses', {admin: true})), device = list.devices.find(d => d.name === 'Equipo renovado');
    await body(await request('/api/devices/' + device.id + '?licenseId=' + license.id, {method: 'DELETE', admin: true}));
    assert.equal((await request('/api/client/session', {bearer: tokenA.value.token})).status, 401);
    const rotated = await body(await request('/api/licenses/' + license.id, {method: 'PATCH', admin: true, data: {rotateKey: true}}));
    assert.notEqual(rotated.key, license.key);
    assert.equal((await request('/api/client/session', {bearer: tokenB.value.token})).status, 401);
    assert.equal((await request('/api/client/activate', {method: 'POST', data: {email: 'client@example.test', key: license.key, deviceId: 'new', deviceName: 'new'}})).status, 403);
  });

  await t.test('distributed limits are bounded and persistent between instances', async () => {
    const low = {...config, dailyBytes: 100}, first = createLimits(db, low, () => 1700000000000), second = createLimits(db, low, () => 1700000000000);
    await first.reserveDownload(60); await assert.rejects(() => second.reserveDownload(50), e => e instanceof ApiError && e.status === 429);
    await first.attempt('unit-limit', 'a', 1, 2); await assert.rejects(() => second.attempt('unit-limit', 'a', 1, 2), e => e.status === 429);
    await second.attempt('unit-limit', 'b', 1, 2); await assert.rejects(() => second.attempt('unit-limit', 'c', 1, 2), e => e.status === 429);
    assert.equal(Object.keys((await db.collection('rateLimits').doc('unit-limit').get()).data().addresses).length, 2);
  });

  await t.test('admin idle expiry, logout and spoofed origin cannot preserve a session', async () => {
    const future = createApi({db, bucket, auth, config, secret: () => secret, clock: () => Date.now() + 31 * 60000});
    assert.equal((await future(new Request(origin + '/api/licenses', {headers: {Cookie: cookie}}))).status, 401);
    assert.equal((await request('/api/licenses', {method: 'POST', admin: true, requestOrigin: 'https://attacker.invalid', data: {}})).status, 403);
    const logout = await request('/api/admin/logout', {method: 'POST', admin: true}); assert.equal(logout.status, 303);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/); assert.equal((await request('/api/licenses', {admin: true})).status, 401);
  });
});

test('SQLite backup migration preserves licenses, devices and RFA bytes; tampering is rejected', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'fambit-migration-'));
  const source = join(temp, 'source'), backup = join(temp, 'backup');
  const bindings = await openBindings(source, new URL('../drizzle', import.meta.url).pathname);
  const oldKey = 'FAMBIT-' + 'A'.repeat(40), oldToken = 'a'.repeat(64), objectKey = 'local-test/family-old/model.rfa';
  try {
    await bindings.DB.prepare('INSERT INTO licenses(id,owner,name,email,key_hash,key_suffix,status,expires,max_devices,created) VALUES(?,?,?,?,?,?,?,?,?,?)').bind('license-old', 'local-test', 'Migrado', 'migrated@example.test', hash(oldKey), 'AAAAAA', 'active', expires, 2, 10).run();
    await bindings.DB.prepare('INSERT INTO devices(id,license_id,device_id,name,token_hash,token_expires,last_seen) VALUES(?,?,?,?,?,?,?)').bind('device-old', 'license-old', 'installation-old', 'PC anterior', hash(oldToken), expires, 10).run();
    await bindings.BUCKET.put(objectKey, rfa, {httpMetadata: {contentType: 'application/octet-stream'}});
    await bindings.DB.prepare('INSERT INTO families(id,owner,name,category,subcategory,description,revit,revision,object_key,size,sha256,published,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind('family-old', 'local-test', 'Mesa antigua', 'arquitectura', 'mesas', '', 2024, 3, objectKey, rfa.length, hash(rfa), 1, 10).run();
  } finally { bindings.close(); }
  await createBackup(source, backup);
  const plan = await prepareMigration(backup, 'local-test'); assert.deepEqual(plan.summary, {families: 1, licenses: 1, devices: 1, bytes: rfa.length});
  // Use an isolated named Firestore database in the same demo emulator.
  const migrationDb = getFirestore(app, 'migration-test');
  await applyMigration(plan, {db: migrationDb, bucket, storageLimitBytes: MIB});
  const migrated = createApi({db: migrationDb, bucket, auth, config, secret: () => secret});
  const active = await migrated(new Request(origin + '/api/client/session', {headers: {Authorization: 'Bearer ' + oldToken}})); assert.equal(active.status, 200);
  const file = await migrated(new Request(origin + '/api/client/families/family-old/file?revit=2025', {headers: {Authorization: 'Bearer ' + oldToken}})); assert.deepEqual(Buffer.from(await file.arrayBuffer()), rfa);
  await assert.rejects(() => applyMigration(plan, {db: migrationDb, bucket, storageLimitBytes: MIB}), /ya se migró/);
  await writeFile(join(backup, 'objects', hash(objectKey)), Buffer.from('tampered'));
  await assert.rejects(() => prepareMigration(backup, 'local-test'), /cambió|incompleta/);
  await rm(temp, {recursive: true, force: true});
});

test.after(async () => { await deleteApp(app); });
