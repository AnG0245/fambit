import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, join, extname, relative as pathRelative, isAbsolute, sep} from 'node:path';
import {isIP} from 'node:net';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {openBindings} from './adapters.mjs';
import {serve} from './service.mjs';
import {createAdminAuth, createRateLimiter} from './auth.mjs';
import {lockData} from './data-lock.mjs';
import {loginPage, publicPage} from './pages.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const mime = {'.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.ttf':'font/ttf', '.woff2':'font/woff2'};
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export function serverConfig(env) {
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Puerto no válido.');
  const url = new URL(env.NUBE_PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL || 'http://127.0.0.1:' + port);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('El origen debe incluir solo protocolo y dominio, sin /api/.');
  const local = url.protocol === 'http:' && loopbackHosts.has(url.hostname) && env.NODE_ENV !== 'production';
  if (!local && url.protocol !== 'https:') throw new Error('El servidor público exige HTTPS.');
  const host = env.NUBE_LISTEN_HOST || '127.0.0.1';
  if (local && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('La prueba HTTP solo puede escuchar en loopback.');
  const proxyHops = Number(env.FAMBIT_TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5) throw new Error('Número de proxies no válido.');
  const owner = env.NUBE_ADMIN_OWNER || 'primary';
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(owner)) throw new Error('Propietario del repositorio no válido.');
  const publicSettings = {downloadUrl: env.FAMBIT_DOWNLOAD_URL || '', downloadVersion: env.FAMBIT_DOWNLOAD_VERSION || '', downloadRevit: env.FAMBIT_DOWNLOAD_REVIT || '', contactEmail: env.FAMBIT_CONTACT_EMAIL || ''};
  if (publicSettings.contactEmail && !/^[^\s@<>"&?=#%]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(publicSettings.contactEmail)) throw new Error('Correo de contacto no válido.');
  if (publicSettings.downloadUrl) {
    const download = new URL(publicSettings.downloadUrl);
    if (download.protocol !== 'https:' || loopbackHosts.has(download.hostname) || download.username || download.password || download.hash || !download.pathname.toLowerCase().endsWith('.exe')) throw new Error('Configura la dirección HTTPS del EXE comercial.');
    if (!/^\d+\.\d+\.\d+$/.test(publicSettings.downloadVersion) || !/^202[4-7](?:, ?202[4-7])*$/.test(publicSettings.downloadRevit)) throw new Error('Indica la versión y los años de Revit comprobados para ese EXE.');
  }
  return {port, host, origin:url.origin, local, proxyHops, owner, publicSettings, directory:resolve(env.NUBE_DATA_DIR || join(here, '../server-data'))};
}

export function clientIp(req, hops) {
  // Only enable hops behind proxies that append/replace forwarding headers and
  // are the sole public ingress. Never use the untrusted leftmost XFF value.
  const chain = String(req.headers['x-forwarded-for'] ?? '').split(',').map(x => x.trim()).filter(Boolean);
  if (hops > 0 && chain.length >= hops && chain.length <= 20) {
    const candidate = chain[chain.length - hops];
    if (isIP(candidate)) return candidate;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function body(req, limit) {
  return new Promise((resolveBody, reject) => {
    let size = 0, failed = false; const chunks = [];
    req.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) { failed = true; chunks.length = 0; reject(new HttpError(413, 'Archivo demasiado grande.')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) resolveBody(Buffer.concat(chunks)); });
    req.on('error', reject);
    req.on('aborted', () => reject(new HttpError(400, 'Solicitud interrumpida.')));
  });
}

export async function createFambitServer(env = process.env) {
  const config = serverConfig(env);
  const unlock = await lockData(config.directory);
  let bindings, auth;
  try {
    auth = createAdminAuth({user:env.NUBE_ADMIN_USER || 'admin', password:env.NUBE_ADMIN_PASSWORD, secret:env.FAMBIT_ADMIN_TOTP_SECRET || '', secure:!config.local, directory:config.directory});
    bindings = await openBindings(config.directory, join(here, '../drizzle'));
  } catch (error) { await unlock(); throw error; }
  const limited = createRateLimiter();
  let activeUploads = 0;
  const server = createServer(async (req, res) => {
    const json = (status, value, headers = {}) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', ...headers}); res.end(req.method === 'HEAD' ? undefined : JSON.stringify(value)); };
    const html = (status, value) => { res.writeHead(status, {'Content-Type':'text/html; charset=utf-8'}); res.end(req.method === 'HEAD' ? undefined : value); };
    const redirect = location => { res.writeHead(303, {Location:location}); res.end(); };
    const sameOrigin = () => { if (req.headers.origin !== config.origin) throw new HttpError(403, 'Origen de la solicitud no permitido.'); };
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
      if (!config.local) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      const url = new URL(req.url ?? '/', config.origin);
      if (url.origin !== config.origin) throw new HttpError(400, 'Solicitud no válida.');
      const path = url.pathname, read = req.method === 'GET' || req.method === 'HEAD';
      const ip = clientIp(req, config.proxyHops), isClient = path.startsWith('/api/client/');
      if (path === '/healthz' && read) {
        await bindings.DB.prepare('SELECT 1 AS ready').first();
        json(200, {service:'FAMBIT', status:'ok', apiVersion:1, production:!config.local}); return;
      }
      if (path === '/admin/login') {
        if (read) { if (auth.authenticated(req)) redirect('/admin'); else html(200, loginPage(auth.hasTotp)); return; }
        if (req.method !== 'POST') throw new HttpError(405, 'Método no permitido.');
        sameOrigin();
        if (limited('admin-global', 60) || limited('admin:' + ip, 6)) { json(429, {error:'Demasiados intentos. Espera un minuto.'}, {'Retry-After':'60'}); return; }
        const raw = await body(req, 4096), type = String(req.headers['content-type'] ?? '').split(';')[0];
        let input;
        try { input = type === 'application/json' ? JSON.parse(raw) : type === 'application/x-www-form-urlencoded' ? Object.fromEntries(new URLSearchParams(raw.toString())) : null; }
        catch { throw new HttpError(400, 'Solicitud no válida.'); }
        const cookie = auth.login(input), wantsJson = String(req.headers.accept ?? '').includes('application/json');
        if (!cookie) {
          if (wantsJson) json(401, {error:'No se pudo iniciar sesión. Revisa tus datos o espera al siguiente código.'});
          else html(401, loginPage(auth.hasTotp, true));
          return;
        }
        res.setHeader('Set-Cookie', cookie);
        if (wantsJson) json(200, {ok:true}); else redirect('/admin');
        return;
      }
      if (path === '/admin/logout') {
        if (req.method !== 'POST') throw new HttpError(405, 'Método no permitido.');
        sameOrigin(); res.setHeader('Set-Cookie', auth.logout(req)); redirect('/admin/login'); return;
      }
      if (path === '/' && read) { if (config.local) redirect('/admin'); else html(200, publicPage(config.publicSettings)); return; }
      if (path === '/admin' || path === '/admin/') {
        if (!read) throw new HttpError(405, 'Método no permitido.');
        if (!auth.authenticated(req)) { redirect('/admin/login'); return; }
        html(200, await readFile(join(here, 'dist/index.html'), 'utf8')); return;
      }
      if (path.startsWith('/api/')) {
        if (!isClient && !auth.authenticated(req)) { json(401, {error:'Tu sesión administrativa terminó. Vuelve a entrar al panel.', code:'ADMIN_SESSION_REQUIRED'}); return; }
        if (!isClient && !read) sameOrigin();
        if (path === '/api/client/activate' && (limited('activation-global', 600) || limited('activation:' + ip, 30))) { json(429, {error:'Demasiados intentos. Espera un minuto.'}, {'Retry-After':'60'}); return; }
        const uploading = path === '/api/families' && req.method === 'POST';
        if (uploading && activeUploads >= 4) { json(503, {error:'Hay varias cargas en curso. Intenta de nuevo en unos segundos.'}, {'Retry-After':'10'}); return; }
        if (uploading) activeUploads++;
        try {
          const bytes = read ? undefined : await body(req, uploading ? 29 * 1024 * 1024 : 16384);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
          const response = await serve(new Request(url, {method:req.method, headers, body:bytes}), bindings, isClient ? null : config.owner);
          res.writeHead(response.status, Object.fromEntries(response.headers));
          if (response.body && req.method !== 'HEAD') await pipeline(Readable.fromWeb(response.body), res); else res.end();
        } finally { if (uploading) activeUploads--; }
        return;
      }
      if (!read) throw new HttpError(405, 'Método no permitido.');
      // Only UI assets are public. Source ZIPs and RFA files are not served here.
      const webFiles = {'/portal.css':'portal.css', '/login.js':'login.js'};
      const publicAsset = /^\/assets\/[A-Za-z0-9_.-]+\.(js|css|woff2|ttf)$/.test(path) || ['/brand/fambit-mark.png','/fonts/Inter-Variable.ttf'].includes(path);
      if (!webFiles[path] && !publicAsset) throw new HttpError(404, 'No encontrado.');
      const root = join(here, webFiles[path] ? 'web' : 'dist');
      const file = resolve(root, webFiles[path] || path.slice(1)), relative = pathRelative(root, file);
      if (!relative || relative === '..' || relative.startsWith('..' + sep) || isAbsolute(relative)) throw new HttpError(404, 'No encontrado.');
      const bytes = await readFile(file);
      res.writeHead(200, {'Content-Type':mime[extname(file)] ?? 'application/octet-stream'});
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      const status = error.code === 'ENOENT' ? 404 : error.status ?? 500;
      if (status === 500) console.error('Solicitud fallida:', error.name);
      json(status, {error:status === 500 ? 'No se pudo completar la solicitud.' : status === 404 ? 'No encontrado.' : error.message});
    }
  });
  server.requestTimeout = 60000; server.headersTimeout = 15000; server.keepAliveTimeout = 5000;
  let closing;
  async function close() {
    if (!closing) closing = new Promise((resolveClose, reject) => server.close(error => {
      bindings.close(); unlock().then(() => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolveClose()).catch(reject);
    }));
    return closing;
  }
  return {server, config, close};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const app = await createFambitServer();
    app.server.once('error', async error => { console.error('No se pudo iniciar FAMBIT:', error.code); await app.close(); process.exitCode = 1; });
    app.server.listen(app.config.port, app.config.host, () => console.log('FAMBIT: servidor iniciado en el puerto ' + app.server.address().port));
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => { const timer = setTimeout(() => process.exit(1), 65000); timer.unref(); app.close().then(() => process.exit(0)); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
