import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {getStorage} from 'firebase-admin/storage';
import {onRequest} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {configuration, MIB} from './core.mjs';
import {createApi} from './api.mjs';

const adminTotp = defineSecret('FAMBIT_ADMIN_TOTP_SECRET');
let handler;
export const fambitApi = onRequest({region: 'us-central1', memory: '512MiB', cpu: 'gcf_gen1', concurrency: 1,
  minInstances: 0, maxInstances: 2, timeoutSeconds: 60, invoker: 'public', cors: false, secrets: [adminTotp]}, async (req, res) => {
  res.set({'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer'});
  try {
    const config = configuration();
    if (!handler) {
      const app = getApps()[0] || initializeApp({projectId: config.projectId, storageBucket: config.bucket});
      handler = createApi({db: getFirestore(app), bucket: getStorage(app).bucket(config.bucket), auth: getAuth(app), config, secret: () => adminTotp.value()});
    }
    const raw = req.rawBody || Buffer.alloc(0), pathname = new URL(req.originalUrl || req.url, config.origin).pathname;
    const maximum = req.method === 'POST' && pathname === '/api/families' ? 29 * MIB : 16384;
    if (raw.length > maximum) { res.status(413).json({error: 'La solicitud supera el tamaño permitido.'}); return; }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    // The origin is deployment configuration, never an untrusted Host/X-Forwarded-Host header.
    const request = new Request(new URL(req.originalUrl || req.url, config.origin), {method: req.method, headers,
      ...(!['GET', 'HEAD'].includes(req.method) && raw.length ? {body: raw} : {})});
    // Google adds its client address to the right of any caller-supplied X-Forwarded-For entries.
    // The global limiter remains effective even if an upstream changes address formatting.
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
    const result = await handler(request, {ip: forwarded.at(-1) || req.socket?.remoteAddress || 'unknown'});
    for (const [key, value] of result.headers) res.setHeader(key, value);
    res.status(result.status).send(Buffer.from(await result.arrayBuffer()));
  } catch {
    console.error('FAMBIT Firebase initialization or transport failed');
    res.status(503).json({error: 'El servidor no está listo. Revisa la configuración de Firebase.'});
  }
});
