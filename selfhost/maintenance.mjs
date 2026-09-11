// Temporary Render start command for an offline, consistent data backup.
// The normal server must finish shutting down before this process starts.
import {createServer} from 'node:http';
import {mkdir} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createBackup} from './backup.mjs';

export async function startMaintenance(env = process.env) {
  const source = env.NUBE_DATA_DIR;
  const destinationRoot = env.FAMBIT_BACKUP_DIR;
  if (!source || !destinationRoot) throw new Error('Define NUBE_DATA_DIR y FAMBIT_BACKUP_DIR.');
  await mkdir(destinationRoot, {recursive:true,mode:0o700});
  const destination = join(destinationRoot, 'fambit-' + new Date().toISOString().replace(/[:.]/g,'-'));
  const result = await createBackup(source, destination);
  const server = createServer((req,res) => {
    res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Type','application/json');
    const health = req.url === '/healthz' && req.method === 'GET';
    res.writeHead(health ? 200 : 503, {'Retry-After':'60'});
    res.end(JSON.stringify(health ? {status:'maintenance'} : {error:'FAMBIT está en mantenimiento. Intenta de nuevo en unos minutos.'}));
  });
  return {server, backup:result};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const {server, backup} = await startMaintenance();
    console.log('Copia completa: ' + backup.directory);
    console.log('Guarda una copia externa y restaura el comando normal antes de volver a abrir FAMBIT.');
    server.listen(Number(process.env.PORT || 10000), process.env.NUBE_LISTEN_HOST || '127.0.0.1');
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
