import {FieldPath} from 'firebase-admin/firestore';
import {ApiError, hash, token, licenseKey, randomUUID, text, email, integer, identifier, cursorDecode, cursorEncode} from './core.mjs';

export function createLicenses(db, config, clock = Date.now) {
  const now = () => Math.floor(clock() / 1000);
  const licenses = db.collection('licenses'), keys = db.collection('licenseKeys'), accounts = db.collection('licenseAccounts'), tokens = db.collection('clientTokens');
  const accountId = address => hash(config.owner + ':' + address);
  const invalid = () => new ApiError(403, 'Correo o licencia no válidos, suspendidos o vencidos.');
  const requireLicense = snapshot => {
    const l = snapshot.data();
    if (!l || l.owner !== config.owner) throw new ApiError(404, 'Cuenta no encontrada.');
    return l;
  };
  const verifyDevice = (index, l, tokenHash) => {
    const d = l?.devices?.[index?.deviceKey];
    if (!index || !l || l.owner !== config.owner || !d || d.tokenHash !== tokenHash || d.tokenExpires <= now()) throw new ApiError(401, 'La sesión expiró. Activa tu licencia de nuevo.');
    if (l.status !== 'active' || l.expires <= now()) throw new ApiError(403, 'Tu licencia está suspendida o vencida.');
    return d;
  };
  return {
    async activate(b) {
      const address = email(b.email), keyHash = hash(text(b.key, 100).toUpperCase()), deviceId = text(b.deviceId, 100), deviceName = text(b.deviceName, 100);
      const deviceKey = hash(deviceId), newToken = token(), newHash = hash(newToken);
      return db.runTransaction(async tx => {
        const index = (await tx.get(keys.doc(keyHash))).data();
        if (!index) throw invalid();
        const ref = licenses.doc(index.licenseId), l = (await tx.get(ref)).data();
        if (!l || l.owner !== config.owner || l.key_hash !== keyHash || l.email !== address || l.status !== 'active' || l.expires <= now()) throw invalid();
        const devices = l.devices || {}, old = devices[deviceKey];
        if (!old && Object.keys(devices).length >= l.max_devices) throw new ApiError(409, 'Esta licencia alcanzó su límite de equipos. Solicita liberar uno.');
        const expires = Math.min(l.expires, now() + 30 * 86400);
        devices[deviceKey] = {id: old?.id || randomUUID(), deviceId, name: deviceName, tokenHash: newHash, tokenExpires: expires, lastSeen: now()};
        if (old?.tokenHash) tx.delete(tokens.doc(old.tokenHash));
        tx.set(tokens.doc(newHash), {licenseId: ref.id, deviceKey, expires});
        // Allocation, token replacement and seat count share one Firestore transaction.
        tx.update(ref, {devices});
        return {token: newToken, expires, licenseExpires: l.expires, name: l.name};
      });
    },
    async identity(request) {
      const bearer = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      if (!bearer) throw new ApiError(401, 'Activa tu licencia para continuar.');
      const tokenHash = hash(bearer), index = (await tokens.doc(tokenHash).get()).data();
      if (!index) throw new ApiError(401, 'La sesión expiró. Activa tu licencia de nuevo.');
      const ref = licenses.doc(index.licenseId), l = (await ref.get()).data();
      const device = verifyDevice(index, l, tokenHash);
      if (device.lastSeen + 900 <= now()) await db.runTransaction(async tx => {
        const latest = (await tx.get(ref)).data();
        verifyDevice(index, latest, tokenHash);
        tx.update(ref, {[`devices.${index.deviceKey}.lastSeen`]: now()});
      });
      return {owner: l.owner, licenseId: ref.id, deviceKey: index.deviceKey, tokenHash, expires: l.expires};
    },
    async deactivate(client) {
      const ref = licenses.doc(client.licenseId);
      await db.runTransaction(async tx => {
        const l = (await tx.get(ref)).data(), d = l?.devices?.[client.deviceKey];
        if (!d || d.tokenHash !== client.tokenHash) throw new ApiError(401, 'La sesión ya no está activa.');
        delete l.devices[client.deviceKey];
        tx.update(ref, {devices: l.devices}); tx.delete(tokens.doc(client.tokenHash));
      });
      return {ok: true};
    },
    async list(url) {
      const count = integer(url.searchParams.get('limit') || 100, 1, 200), cursor = cursorDecode(url.searchParams.get('cursor'));
      let query = licenses.where('owner', '==', config.owner).orderBy('created', 'desc').orderBy(FieldPath.documentId(), 'desc');
      if (cursor) query = query.startAfter(...cursor);
      const result = await query.limit(count + 1).get(), docs = result.docs.slice(0, count);
      return {licenses: docs.map(doc => {
        const l = doc.data();
        return {id: doc.id, name: l.name, email: l.email, key_suffix: l.key_suffix, status: l.status, expires: l.expires, max_devices: l.max_devices, created: l.created, device_count: Object.keys(l.devices || {}).length};
      }), devices: docs.flatMap(doc => Object.values(doc.data().devices || {}).map(d => ({id: d.id, license_id: doc.id, name: d.name, last_seen: d.lastSeen}))),
      nextCursor: result.size > count ? cursorEncode(docs.at(-1), 'created') : null};
    },
    async create(b) {
      const name = text(b.name), address = email(b.email), expires = integer(b.expires, now() + 60, 4102444800), max = integer(b.maxDevices, 1, 100);
      const key = licenseKey(), keyHash = hash(key), ref = licenses.doc(randomUUID()), account = accounts.doc(accountId(address));
      await db.runTransaction(async tx => {
        if ((await tx.get(account)).exists) throw new ApiError(409, 'Esta cuenta ya existe. Puedes renovar su licencia.');
        tx.create(ref, {owner: config.owner, name, email: address, key_hash: keyHash, key_suffix: key.slice(-6), status: 'active', expires, max_devices: max, created: now(), devices: {}});
        tx.create(keys.doc(keyHash), {licenseId: ref.id}); tx.create(account, {licenseId: ref.id});
      });
      return {id: ref.id, key};
    },
    async update(id, b) {
      const ref = licenses.doc(identifier(id)), key = b.rotateKey === true ? licenseKey() : null;
      await db.runTransaction(async tx => {
        const l = requireLicense(await tx.get(ref));
        const status = b.status === undefined ? l.status : text(b.status);
        if (!['active', 'suspended'].includes(status)) throw new ApiError(400, 'Estado inválido.');
        const expires = b.expires === undefined ? l.expires : integer(b.expires, now() + 60, 4102444800);
        const max = b.maxDevices === undefined ? l.max_devices : integer(b.maxDevices, 1, 100);
        if (max < Object.keys(l.devices || {}).length) throw new ApiError(409, 'Libera equipos antes de reducir el límite.');
        const change = {status, expires, max_devices: max};
        if (key) {
          const keyHash = hash(key);
          tx.delete(keys.doc(l.key_hash)); tx.create(keys.doc(keyHash), {licenseId: id});
          for (const d of Object.values(l.devices || {})) if (d.tokenHash) tx.delete(tokens.doc(d.tokenHash));
          Object.assign(change, {key_hash: keyHash, key_suffix: key.slice(-6), devices: {}});
        }
        tx.update(ref, change);
      });
      return {ok: true, ...(key ? {key} : {})};
    },
    async releaseDevice(id, licenseId) {
      identifier(id);
      // Explicit license lookup avoids scanning the customer database for each released seat.
      const ref = licenses.doc(identifier(licenseId));
      await db.runTransaction(async tx => {
        const l = requireLicense(await tx.get(ref));
        const pair = Object.entries(l.devices || {}).find(([, d]) => d.id === id);
        if (!pair) throw new ApiError(404, 'Equipo no encontrado.');
        const [key, d] = pair; delete l.devices[key];
        if (d.tokenHash) tx.delete(tokens.doc(d.tokenHash));
        tx.update(ref, {devices: l.devices});
      });
      return {ok: true};
    },
  };
}
