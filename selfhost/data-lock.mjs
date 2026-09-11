import {open, readFile, unlink, mkdir} from 'node:fs/promises';
import {hostname} from 'node:os';
import {join} from 'node:path';

// One portable server or one offline backup may use a data directory at a time.
export async function lockData(directory) {
  await mkdir(directory, {recursive: true, mode:0o700});
  const path = join(directory, '.fambit-lock.json');
  const handle = await open(path, 'wx', 0o600).catch(async error => {
    if (error.code !== 'EEXIST') throw error;
    const old = JSON.parse(await readFile(path, 'utf8'));
    if (old.host !== hostname() || !Number.isInteger(old.pid) || old.pid < 1) throw new Error('El directorio está bloqueado por otro servidor. Revisa la guía de recuperación.');
    try { process.kill(old.pid, 0); } catch (e) {
      if (e.code === 'ESRCH') { await unlink(path); return open(path, 'wx', 0o600); }
    }
    throw new Error('Detén el servidor antes de usar la copia de seguridad o abrir otra instancia.');
  });
  await handle.writeFile(JSON.stringify({pid: process.pid, host: hostname()}));
  await handle.close();
  let released = false;
  return async () => { if (!released) { released = true; await unlink(path); } };
}
