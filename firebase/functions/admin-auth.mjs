import {ApiError, hash, same, totp} from './core.mjs';

const absoluteSeconds = 8 * 60 * 60, idleSeconds = 30 * 60;
export function createAdminAuth({db, auth, config, secret, clock = Date.now}) {
  const ref = db.collection('adminSessions').doc(hash(config.uid));
  const cookie = (value, age) => `__session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${config.emulator ? '' : '; Secure'}`;
  const readCookie = request => {
    const values = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith('__session='));
    if (values.length !== 1) return null;
    const value = values[0].slice(10);
    return /^[A-Za-z0-9_.-]{50,8192}$/.test(value) ? value : null;
  };
  const denied = () => new ApiError(401, 'Inicia sesión para acceder al panel.', 'ADMIN_SESSION_REQUIRED');
  return {
    async login(input) {
      if (typeof input.idToken !== 'string' || input.idToken.length > 8192 || !/^\d{6}$/.test(input.code || '')) throw new ApiError(403, 'Revisa el acceso y el código del autenticador.');
      let user;
      try { user = await auth.verifyIdToken(input.idToken, true); } catch { throw new ApiError(403, 'No se pudo verificar tu acceso.'); }
      const now = Math.floor(clock() / 1000);
      if (user.uid !== config.uid || !Number.isFinite(user.auth_time) || now - user.auth_time > 300 || user.auth_time > now + 30) throw new ApiError(403, 'Esta cuenta no tiene acceso administrativo.');
      if (user.email_verified !== true) throw new ApiError(403, 'Verifica tu correo antes de entrar al panel.', 'EMAIL_VERIFICATION_REQUIRED');
      const current = Math.floor(clock() / 30000), key = secret();
      const matched = [current, current - 1, current + 1].find(counter => counter >= 0 && same(totp(key, counter * 30000), input.code));
      if (matched === undefined) throw new ApiError(403, 'Código del autenticador incorrecto o vencido.');
      // Firebase JWT + a persistent session record: logout and OTP replay protection survive cold starts.
      const session = await auth.createSessionCookie(input.idToken, {expiresIn: absoluteSeconds * 1000});
      await db.runTransaction(async tx => {
        const old = (await tx.get(ref)).data() || {};
        const identity = hash(config.uid + ':' + key);
        if (old.identity === identity && matched <= old.counter) throw new ApiError(403, 'Ese código ya se utilizó. Espera al siguiente.');
        tx.set(ref, {identity, counter: matched, sessionHash: hash(session), expires: now + absoluteSeconds, lastSeen: now});
      });
      return {cookie: cookie(session, absoluteSeconds), user: {name: user.name || 'Administrador', email: user.email || ''}};
    },
    async identity(request) {
      const session = readCookie(request); if (!session) throw denied();
      let user;
      try { user = await auth.verifySessionCookie(session, true); } catch { throw denied(); }
      if (user.uid !== config.uid || user.email_verified !== true) throw denied();
      const now = Math.floor(clock() / 1000);
      await db.runTransaction(async tx => {
        const record = (await tx.get(ref)).data();
        if (!record || !same(record.sessionHash || '', hash(session)) || record.expires <= now || record.lastSeen + idleSeconds <= now) throw denied();
        if (record.lastSeen + 300 <= now) tx.update(ref, {lastSeen: now});
      });
      return {owner: config.owner, name: user.name || 'Administrador', email: user.email || ''};
    },
    async logout(request) {
      const session = readCookie(request);
      if (session) await db.runTransaction(async tx => {
        const record = (await tx.get(ref)).data();
        if (record && same(record.sessionHash || '', hash(session))) tx.update(ref, {sessionHash: '', expires: 0, lastSeen: 0});
      });
      return cookie('', 0);
    },
  };
}
