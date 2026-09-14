import {FieldPath} from 'firebase-admin/firestore';
import {categories} from './catalog.mjs';
import {ApiError, MIB, json, jsonBody, text, hash, randomUUID} from './core.mjs';
import {createLicenses} from './licenses.mjs';
import {createFamilies} from './families.mjs';
import {createLimits} from './limits.mjs';
import {createAdminAuth} from './admin-auth.mjs';

export function createApi({db, bucket, auth, config, secret, clock = Date.now}) {
  const limits = createLimits(db, config, clock), licenses = createLicenses(db, config, clock);
  const families = createFamilies(db, bucket, config, limits, clock), admin = createAdminAuth({db, auth, config, secret, clock});
  const origin = request => { if (request.headers.get('origin') !== config.origin) throw new ApiError(403, 'Origen de la solicitud no permitido.'); };
  return async (request, {ip = 'unknown'} = {}) => {
    try {
      const url = new URL(request.url), path = url.pathname, method = request.method;
      const state = (await db.collection('system').doc('state').get()).data();
      if (state?.status === 'migrating') throw new ApiError(503, 'La biblioteca está en mantenimiento durante la migración.');
      if (path === '/healthz' && method === 'GET') {
        // Readiness checks Firestore; Hosting can still display the static page during API incidents.
        return json({service: 'FAMBIT', status: 'ok', apiVersion: 1, backend: 'firebase', version: '0.5.0', production: !config.emulator});
      }
      if (!path.startsWith('/api/')) throw new ApiError(404, 'Recurso no encontrado.');
      if (path === '/api/admin/session' && method === 'POST') {
        origin(request); await limits.attempt('admin-login', ip, 6, 30);
        const result = await admin.login(await jsonBody(request));
        return json({ok: true, ...result.user}, 200, {'Set-Cookie': result.cookie});
      }
      if (path === '/api/admin/logout' && method === 'POST') {
        origin(request); const cookie = await admin.logout(request);
        return new Response(null, {status: 303, headers: {'Set-Cookie': cookie, Location: '/admin/login', 'Cache-Control': 'private, no-store'}});
      }
      if (path === '/api/client/activate' && method === 'POST') {
        await limits.attempt('client-activate', ip, 20, 300);
        return json(await licenses.activate(await jsonBody(request)));
      }
      const isClient = path.startsWith('/api/client/'), client = isClient ? await licenses.identity(request) : null;
      const administrator = isClient ? null : await admin.identity(request);
      if (!isClient && !['GET', 'HEAD'].includes(method)) origin(request);
      if (path === '/api/admin/session' && method === 'GET') return json(administrator);
      if (path === '/api/admin/usage' && method === 'GET') return json(await limits.usage());
      if (path === '/api/client/session' && method === 'GET') return json({active: true, expires: client.expires});
      if (path === '/api/client/session' && method === 'DELETE') return json(await licenses.deactivate(client));
      const route = path.replace(/^\/api(?:\/client)?/, '');
      if (route === '/categories' && method === 'GET') return json({categories});
      if (route === '/families' && method === 'GET') return json(await families.list(url, client));
      const file = route.match(/^\/families\/([\w-]+)\/(file|thumbnail)$/);
      if (file && method === 'GET') return await families.download(file[1], file[2], url, client, () => licenses.identity(request));
      if (route === '/releases' && method === 'GET') {
        const result = await db.collection('releases').where('owner', '==', config.owner).orderBy('created', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(20).get();
        return json({releases: result.docs.map(doc => { const {owner, ...value} = doc.data(); return {id: doc.id, ...value}; })});
      }
      // A valid customer token can never reach administration mutations, even with a forged Origin.
      if (isClient) throw new ApiError(404, 'Recurso no encontrado.');
      if (route === '/families' && method === 'POST') {
        if (Number(request.headers.get('content-length')) > 29 * MIB) throw new ApiError(413, 'Usa archivos RFA de hasta 25 MB.');
        if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new ApiError(415, 'Adjunta un formulario con el archivo.');
        let form; try { form = await request.formData(); } catch { throw new ApiError(400, 'No se pudo leer el archivo adjunto.'); }
        return json(await families.save(form), 201);
      }
      const family = route.match(/^\/families\/([\w-]+)$/);
      if (family && method === 'PATCH') return json(await families.publish(family[1], (await jsonBody(request)).published));
      if (route === '/licenses' && method === 'GET') return json(await licenses.list(url));
      if (route === '/licenses' && method === 'POST') return json(await licenses.create(await jsonBody(request)), 201);
      const license = route.match(/^\/licenses\/([\w-]+)$/);
      if (license && method === 'PATCH') return json(await licenses.update(license[1], await jsonBody(request)));
      const device = route.match(/^\/devices\/([\w-]+)$/);
      if (device && method === 'DELETE') return json(await licenses.releaseDevice(device[1], url.searchParams.get('licenseId')));
      if (route === '/releases' && method === 'POST') {
        const b = await jsonBody(request), version = text(b.version, 30), address = text(b.url, 2000), sha256 = text(b.sha256, 64).toLowerCase(), notes = text(b.notes, 2000);
        let link; try { link = new URL(address); } catch { throw new ApiError(400, 'El enlace no es válido.'); }
        if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{64}$/.test(sha256) || link.protocol !== 'https:' || link.username || link.password || link.hash || !link.pathname.toLowerCase().endsWith('.exe')) throw new ApiError(400, 'Usa una versión 1.0.0, un enlace HTTPS a un EXE y su SHA-256.');
        await db.collection('releases').doc(randomUUID()).create({owner: config.owner, version, url: address, sha256, notes, created: Math.floor(clock() / 1000)});
        return json({ok: true}, 201);
      }
      throw new ApiError(404, 'Recurso no encontrado.');
    } catch (error) {
      if (error instanceof ApiError) return json({error: error.message, ...(error.code ? {code: error.code} : {})}, error.status, error.status === 429 ? {'Retry-After': '60'} : {});
      console.error('FAMBIT request failed', {type: error?.name || 'unknown', incident: hash(randomUUID()).slice(0, 12)});
      return json({error: 'No se pudo completar la operación. Intenta de nuevo.'}, 503);
    }
  };
}
