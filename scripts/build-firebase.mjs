import {readFile, writeFile, mkdir, cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import ts from 'typescript';
import {publicPage} from '../selfhost/pages.mjs';
import {inspectInstaller} from '../firebase/release.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const catalog = ts.transpileModule(await readFile(join(root, 'lib/catalog.ts'), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022}}).outputText;
await writeFile(join(root, 'firebase/functions/catalog.mjs'), catalog);
if (!process.argv.includes('--functions-only')) {
  const {build} = await import('vite');
  if (process.argv.includes('--emulator')) process.env.FAMBIT_BUILD_EMULATOR = 'true';
  else delete process.env.FAMBIT_BUILD_EMULATOR;
  await build({configFile: join(root, 'firebase/vite.config.mjs')});
  const dist = join(root, 'firebase/dist');
  await mkdir(dist, {recursive: true});
  // Only explicit public assets are copied. Old source ZIPs, RFA objects and credentials stay out.
  for (const name of ['brand', 'fonts']) await cp(join(root, 'public', name), join(dist, name), {recursive: true});
  await cp(join(root, 'selfhost/web/portal.css'), join(dist, 'portal.css'));
  let page = {};
  if (!process.argv.includes('--emulator')) {
    let local;
    try { local = JSON.parse(await readFile(join(root, 'firebase/.local-config.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (local?.release) {
      const release = await inspectInstaller(local.release.path, local.origin);
      if (release.sha256 !== local.release.sha256) throw new Error('El EXE cambió desde la última publicación. Ejecuta Publicar-Instalador-Firebase.cmd con el archivo final.');
      await mkdir(join(dist, 'downloads'), {recursive: true});
      await cp(release.path, join(dist, 'downloads', release.name));
      await writeFile(join(dist, 'downloads', release.name + '.sha256'), release.sha256 + '  ' + release.name + '\n');
      page = {downloadUrl: '/downloads/' + release.name, downloadVersion: release.version, downloadRevit: release.years.join(', ')};
    }
  }
  await writeFile(join(dist, 'index.html'), publicPage(page));
  await writeFile(join(dist, '404.html'), '<!doctype html><html lang="es"><meta charset="utf-8"><title>Página no disponible · FAMBIT</title><link rel="stylesheet" href="/portal.css"><main class="login-layout"><section class="login-card"><h1>Página no disponible</h1><p>El enlace no existe o ya no está disponible.</p><a class="button" href="/">Volver a FAMBIT</a></section></main></html>');
  console.log('FAMBIT Firebase: portal y funciones preparados. No se ha publicado ningún servicio.');
}
