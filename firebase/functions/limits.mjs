import {ApiError, hash} from './core.mjs';

export function createLimits(db, config, clock = Date.now) {
  return {
    async attempt(kind, ip, perIp, total) {
      const ref = db.collection('rateLimits').doc(kind), window = Math.floor(clock() / 60000);
      const key = hash(ip);
      await db.runTransaction(async tx => {
        const old = (await tx.get(ref)).data();
        const state = old?.window === window ? old : {window, count: 0, addresses: {}};
        if (state.count >= total || (state.addresses[key] || 0) >= perIp) throw new ApiError(429, 'Demasiados intentos. Espera un minuto y vuelve a probar.');
        state.count++; state.addresses[key] = (state.addresses[key] || 0) + 1;
        // Fixed document per endpoint and bounded map; hostile IPs cannot create unlimited documents.
        tx.set(ref, state);
      });
    },
    async reserveDownload(size) {
      const ref = db.collection('usage').doc('downloads'), day = new Date(clock()).toISOString().slice(0, 10);
      await db.runTransaction(async tx => {
        const old = (await tx.get(ref)).data();
        const bytes = old?.day === day ? old.bytes : 0;
        if (!Number.isSafeInteger(size) || size < 0 || bytes + size > config.dailyBytes) throw new ApiError(429, 'La biblioteca alcanzó su límite diario de descarga. Intenta mañana o contacta al administrador.', 'DOWNLOAD_LIMIT');
        tx.set(ref, {day, bytes: bytes + size});
      });
    },
    async usage() {
      const [download, storage] = await db.getAll(db.collection('usage').doc('downloads'), db.collection('usage').doc('storage'));
      const today = new Date(clock()).toISOString().slice(0, 10);
      return {downloadBytes: download.data()?.day === today ? download.data().bytes : 0, dailyLimitBytes: config.dailyBytes,
        storedBytes: storage.data()?.bytes || 0, storageLimitBytes: config.storageBytes, day: today};
    },
  };
}
