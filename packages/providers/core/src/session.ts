/**
 * Encrypted provider session storage. Never store a provider password.
 * SESSION_MASTER_KEY is 32 raw bytes, base64-encoded, from env.
 */
import crypto from 'node:crypto';

export interface SealedSession {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyVersion: number;
}

export function sealSession(
  storageState: unknown,
  masterKeyB64: string,
  keyVersion: number = 1,
): SealedSession {
  const masterKey = Buffer.from(masterKeyB64, 'base64');
  if (masterKey.length !== 32) {
    throw new Error('Master key must be 32 bytes');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const plaintext = Buffer.from(JSON.stringify(storageState), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    iv,
    tag,
    keyVersion,
  };
}

export function openSession<T = unknown>(sealed: SealedSession, masterKeyB64: string): T {
  const masterKey = Buffer.from(masterKeyB64, 'base64');
  if (masterKey.length !== 32) {
    throw new Error('Master key must be 32 bytes');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, sealed.iv);
  decipher.setAuthTag(sealed.tag);
  const plaintext = Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

function redactValue(val: unknown): unknown {
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(redactValue);
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    const lowerKey = k.toLowerCase();
    if (
      lowerKey === 'cookies' ||
      lowerKey === 'storagestate' ||
      lowerKey === 'cookie' ||
      lowerKey === 'authorization' ||
      lowerKey === 'auth' ||
      lowerKey === 'password' ||
      lowerKey === 'token'
    ) {
      result[k] = '[REDACTED]';
    } else {
      result[k] = redactValue(v);
    }
  }
  return result;
}

/** Strip cookies/tokens/storage state before anything reaches Pino. */
export function redactForLog<T extends Record<string, unknown>>(obj: T): T {
  return redactValue(obj) as T;
}

