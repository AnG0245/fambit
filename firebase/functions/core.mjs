import {createHash, createHmac, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';

export const MIB = 1024 * 1024;
export const seconds = () => Math.floor(Date.now() / 1000);
export const hash = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export const licenseKey = () => 'FAMBIT-' + randomBytes(20).toString('hex').toUpperCase();
export {randomUUID};
export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export function text(value, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ApiError(400, 'Revisa los campos obligatorios.');
  return value.trim();
}
export function integer(value, min, max) {
  if (value === null || value === '' || typeof value === 'boolean') throw new ApiError(400, 'Valor numérico inválido.');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new ApiError(400, 'Valor numérico fuera del rango permitido.');
  return n;
}
export function email(value) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new ApiError(400, 'Introduce un correo válido.');
  return result;
}
export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new ApiError(400, 'Identificador inválido.');
  return value;
}
export async function jsonBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'Usa una solicitud JSON.');
  try {
    const value = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ApiError(400, 'Solicitud inválida.'); }
}
export const json = (value, status = 200, headers = {}) => Response.json(value, {status, headers: {'Cache-Control': 'private, no-store', ...headers}});
export function cursorEncode(doc, field) { return Buffer.from(JSON.stringify([doc.data()[field], doc.id])).toString('base64url'); }
export function cursorDecode(value) {
  if (!value) return null;
  try {
    if (value.length > 240 || !/^[\w-]+$/.test(value)) throw new Error();
    const [time, id] = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Number.isSafeInteger(time) || time < 0) throw new Error();
    return [time, identifier(id)];
  } catch { throw new ApiError(400, 'La página solicitada no es válida.'); }
}
export const base32 = bytes => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let value = 0, bits = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; out += alphabet[(value >>> bits) & 31]; }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
};
export function totp(secret, time = Date.now(), digits = 6) {
  if (!/^[A-Z2-7]{32,104}$/.test(secret)) throw new Error('Configura una clave TOTP Base32 válida.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', bytes = [];
  let value = 0, bits = 0;
  for (const c of secret) {
    value = (value << 5) | alphabet.indexOf(c); bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest(), offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
export const same = (a, b) => timingSafeEqual(Buffer.from(hash(String(a)), 'hex'), Buffer.from(hash(String(b)), 'hex'));

export function configuration(env = process.env) {
  const projectId = env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT;
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId || '')) throw new Error('Falta el ID del proyecto Firebase.');
  const emulator = env.FUNCTIONS_EMULATOR === 'true';
  // A demo project cannot access live Firebase services, even if an emulator is missing.
  if (emulator && (!projectId.startsWith('demo-') || !env.FIRESTORE_EMULATOR_HOST || !env.FIREBASE_AUTH_EMULATOR_HOST || !env.FIREBASE_STORAGE_EMULATOR_HOST)) throw new Error('Las pruebas requieren un proyecto demo y los tres emuladores.');
  if (!emulator && [env.FIRESTORE_EMULATOR_HOST, env.FIREBASE_AUTH_EMULATOR_HOST, env.FIREBASE_STORAGE_EMULATOR_HOST].some(Boolean)) throw new Error('No se admiten emuladores en producción.');
  const origin = new URL(env.FAMBIT_PUBLIC_ORIGIN || `https://${projectId}.web.app`);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || (emulator ? !loopback || origin.protocol !== 'http:' : loopback || origin.protocol !== 'https:')) throw new Error('Origen de FAMBIT inválido.');
  const uid = env.FAMBIT_ADMIN_UID;
  if (!uid || uid.length > 128 || /[\s/]/.test(uid)) throw new Error('Falta el UID del administrador de Firebase Authentication.');
  const bucket = env.FAMBIT_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
  if (!/^[a-z0-9][a-z0-9._-]{2,221}$/.test(bucket)) throw new Error('Nombre del bucket inválido.');
  return Object.freeze({projectId, emulator, origin: origin.origin, uid, bucket,
    owner: identifier(env.FAMBIT_OWNER_ID || 'local-test'),
    dailyBytes: integer(env.FAMBIT_DAILY_DOWNLOAD_MIB || 256, 1, 1048576) * MIB,
    storageBytes: integer(env.FAMBIT_STORAGE_LIMIT_MIB || 1024, 25, 1048576) * MIB,
  });
}
