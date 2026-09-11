import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {readFileSync, writeFileSync, renameSync} from 'node:fs';
import {join} from 'node:path';

const hash = value => createHash('sha256').update(value).digest();
const same = (a, b) => timingSafeEqual(hash(String(a)), hash(String(b)));
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(bytes) {
  let value = 0, bits = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; output += alphabet[(value >>> bits) & 31]; }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(secret) {
  if (!/^[A-Z2-7]{32,104}$/.test(secret)) throw new Error('La clave TOTP debe tener entre 32 y 104 caracteres Base32.');
  let value = 0, bits = 0; const bytes = [];
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char); bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  return Buffer.from(bytes);
}

// RFC 6238: SHA-1, six digits, a 30-second time step (authenticator defaults).
export function totp(secret, time = Date.now(), digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, '0');
}

export function createAdminAuth({user, password, secret, secure, directory, clock = Date.now}) {
  if (!user || user.length > 100 || /[\r\n:]/.test(user)) throw new Error('Usuario administrativo no válido.');
  if (typeof password !== 'string' || password.length < 20 || password.length > 1024) throw new Error('Define NUBE_ADMIN_PASSWORD con al menos 20 caracteres.');
  if (secure && !secret) throw new Error('Configura FAMBIT_ADMIN_TOTP_SECRET para publicar el servidor.');
  if (secret) decodeBase32(secret);
  const name = secure ? '__Host-fambit_admin' : 'fambit_admin_local';
  const statePath = join(directory, 'admin-totp.json');
  const stateKey = hash(user + ':' + (secret ?? '')).toString('hex');
  let lastCounter = -1;
  if (secret) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      if (state.key === stateKey) {
        if (!Number.isSafeInteger(state.counter) || state.counter < 0) throw new Error('Estado TOTP inválido.');
        lastCounter = state.counter;
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // Tokens never appear in URLs or browser storage. Restarting invalidates sessions.
  const sessions = new Map();
  const absoluteTtl = 8 * 60 * 60 * 1000, idleTtl = 30 * 60 * 1000;
  const cookie = (token, maxAge) => `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  function cleanup() {
    const now = clock();
    for (const [key, session] of sessions) if (session.expires <= now || session.lastSeen + idleTtl <= now) sessions.delete(key);
  }
  function tokenFrom(req) {
    const matches = String(req.headers.cookie ?? '').split(';').map(x => x.trim()).filter(x => x.startsWith(name + '='));
    if (matches.length !== 1) return null;
    const value = matches[0].slice(name.length + 1);
    return /^[a-f0-9]{64}$/.test(value) ? hash(value).toString('hex') : null;
  }
  return {
    hasTotp: Boolean(secret),
    login(input) {
      if (!input || typeof input.user !== 'string' || typeof input.password !== 'string') return null;
      const validUser = same(input.user, user), validPassword = same(input.password, password);
      if (!validUser || !validPassword) return null;
      if (secret) {
        if (typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) return null;
        const current = Math.floor(clock() / 30000);
        const matched = [current, current - 1, current + 1].find(counter => counter >= 0 && counter > lastCounter && same(totp(secret, counter * 30000), input.code));
        if (matched === undefined) return null;
        // Persist before issuing a session; a restart must not permit OTP replay.
        writeFileSync(statePath + '.tmp', JSON.stringify({key: stateKey, counter: matched}), {mode: 0o600});
        renameSync(statePath + '.tmp', statePath); lastCounter = matched;
      }
      cleanup();
      if (sessions.size >= 30) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(32).toString('hex'), now = clock();
      sessions.set(hash(token).toString('hex'), {expires: now + absoluteTtl, lastSeen: now});
      return cookie(token, absoluteTtl / 1000);
    },
    authenticated(req) {
      cleanup(); const session = sessions.get(tokenFrom(req));
      if (!session) return false;
      session.lastSeen = clock(); return true;
    },
    logout(req) { sessions.delete(tokenFrom(req)); return cookie('', 0); },
  };
}

export function createRateLimiter({clock = Date.now, capacity = 10000} = {}) {
  const buckets = new Map();
  return (key, limit, windowMs = 60000) => {
    const now = clock();
    for (const [id, item] of buckets) if (item.until <= now) buckets.delete(id);
    let item = buckets.get(key);
    if (!item) {
      if (buckets.size >= capacity) return true;
      item = {count: 0, until: now + windowMs}; buckets.set(key, item);
    }
    return ++item.count > limit;
  };
}
