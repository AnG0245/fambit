import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configure} from '../firebase/configure.mjs';
import {inspectInstaller} from '../firebase/release.mjs';
import {hash} from '../firebase/functions/core.mjs';

test('configuration preserves the published authenticator and refuses a different project', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fambit-config-'));
  try {
    const options = {directory, privateDirectory: join(directory, 'private'), projectId: 'fambit-fixture', uid: 'admin-fixture'};
    await configure(options);
    const localPath = join(directory, 'firebase/.local-config.json'), local = JSON.parse(await readFile(localPath, 'utf8'));
    const key = await readFile(local.secretFile, 'utf8');
    await configure(options); assert.equal(await readFile(local.secretFile, 'utf8'), key);
    assert.ok(!String(await readFile(join(directory, 'firebase/functions/.env.fambit-fixture'))).includes(key.trim()));
    await assert.rejects(() => configure({...options, projectId: 'another-project'}), /otro proyecto/);
    await writeFile(localPath, JSON.stringify({...local, secretPublished: true}));
    await unlink(local.secretFile);
    await assert.rejects(() => configure(options), /Restaura/);
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test('installer publication rejects a wrong server, tampered bytes, local-test package and invalid PE', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fambit-release-'));
  try {
    const path = join(directory, 'FAMBIT.exe'), origin = 'https://fambit-fixture.web.app';
    // Header-only fixture: never executed and never published. This does not validate an Inno build.
    const bytes = Buffer.alloc(512); bytes.write('MZ'); bytes.writeUInt32LE(128, 60); bytes.write('PE\0\0', 128);
    const manifest = {service: 'FAMBIT', version: '0.5.0', years: [2025], localTest: false, apiBaseUrl: origin + '/api/', sha256: hash(bytes)};
    const save = value => writeFile(path + '.release.json', '\ufeff' + JSON.stringify(value));
    await writeFile(path, bytes); await save(manifest);
    assert.equal((await inspectInstaller(path, origin)).sha256, manifest.sha256);
    await assert.rejects(() => inspectInstaller(path, 'https://other-fixture.web.app'), /no coinciden/);
    await save({...manifest, localTest: true}); await assert.rejects(() => inspectInstaller(path, origin), /no coinciden/);
    await save(manifest); bytes[511] = 1; await writeFile(path, bytes); await assert.rejects(() => inspectInstaller(path, origin), /no coinciden/);
    bytes.writeUInt32LE(1000, 60); await writeFile(path, bytes); await assert.rejects(() => inspectInstaller(path, origin), /ejecutable/);
  } finally { await rm(directory, {recursive: true, force: true}); }
});
