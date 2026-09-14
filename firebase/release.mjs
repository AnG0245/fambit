import {readFile, writeFile, stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {basename, resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {hash, MIB} from './functions/core.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const parse = bytes => JSON.parse(String(bytes).replace(/^\uFEFF/, ''));
export async function inspectInstaller(file, origin) {
  const path = resolve(file), info = await stat(path);
  if (!path.toLowerCase().endsWith('.exe') || !info.isFile() || info.size < 256 || info.size > 128 * MIB) throw new Error('Selecciona un instalador EXE de FAMBIT de hasta 128 MiB.');
  const bytes = await readFile(path), offset = bytes.readUInt32LE(60);
  if (bytes.toString('ascii', 0, 2) !== 'MZ' || offset < 64 || offset > bytes.length - 4 || bytes.toString('hex', offset, offset + 4) !== '50450000') throw new Error('El archivo no es un ejecutable de Windows válido.');
  const manifest = parse(await readFile(path + '.release.json'));
  const sha256 = hash(bytes);
  if (manifest.service !== 'FAMBIT' || manifest.localTest !== false || manifest.apiBaseUrl !== origin + '/api/' || manifest.sha256 !== sha256) throw new Error('El instalador, su hash o su servidor no coinciden. Vuelve a compilarlo para este proyecto Firebase.');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version) || !Array.isArray(manifest.years) || !manifest.years.length || manifest.years.some(y => ![2024, 2025, 2026, 2027].includes(y))) throw new Error('El manifiesto del instalador no es válido.');
  const years = [...new Set(manifest.years)].sort();
  return {path, version: manifest.version, years, sha256, size: bytes.length, name: `FAMBIT-${manifest.version}-Revit${years.join('-')}-${sha256.slice(0, 12)}.exe`};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const run = args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {cwd: root, stdio: 'inherit'});
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('La publicación del instalador no terminó.')));
  });
  try {
    const file = process.argv[2]; if (!file) throw new Error('Indica la ruta del EXE final después de firebase/release.mjs.');
    const configPath = join(root, 'firebase/.local-config.json'), config = parse(await readFile(configPath));
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId) || config.projectId.startsWith('demo-') || !/^https:\/\//.test(config.origin)) throw new Error('Ejecuta primero Configurar-Firebase.cmd con tu proyecto real.');
    const health = await fetch(config.origin + '/healthz', {signal: AbortSignal.timeout(60000)});
    const ready = await health.json();
    if (!health.ok || ready.backend !== 'firebase' || ready.service !== 'FAMBIT' || ready.production !== true) throw new Error('Publica y comprueba primero el servidor Firebase.');
    const release = await inspectInstaller(file, config.origin);
    console.log(`Instalador: ${basename(release.path)} · Revit ${release.years.join(', ')} · versión ${release.version}`);
    console.log('Se publicará en la web. Las descargas públicas consumen la cuota de Firebase Hosting.');
    config.release = release; await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', {mode: 0o600});
    await run(['scripts/build-firebase.mjs']);
    const cli = 'firebase/tooling/node_modules/firebase-tools/lib/bin/firebase.js';
    await run([cli, 'login']);
    await run([cli, 'deploy', '--project', config.projectId, '--only', 'hosting']);
    const address = config.origin + '/downloads/' + release.name;
    const response = await fetch(address, {signal: AbortSignal.timeout(60000)});
    if (!response.ok || hash(Buffer.from(await response.arrayBuffer())) !== release.sha256) throw new Error('No se pudo confirmar el SHA-256 del EXE publicado. No lo distribuyas todavía.');
    console.log('Descarga publicada y SHA-256 comprobado: ' + address);
    console.log('SHA-256: ' + release.sha256);
    console.log('En el panel > Versiones, registra esta URL, versión y hash para anunciar la actualización a los clientes.');
  } catch (e) { console.error(e.code === 'ENOENT' ? 'Falta la configuración o el manifiesto .exe.release.json. Configura Firebase y compila el instalador de esta versión.' : e.message); process.exitCode = 1; }
}
