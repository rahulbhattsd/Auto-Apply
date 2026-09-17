import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sealSession, openSession, redactForLog } from '../src/session.js';

const MASTER = randomBytes(32).toString('base64');
const OTHER = randomBytes(32).toString('base64');

const storageState = {
  cookies: [{ name: 'nauk_at', value: 'super-secret-token', domain: '.naukri.com' }],
  origins: [],
};

describe('session sealing', () => {
  test('round-trips storage state', () => {
    const sealed = sealSession(storageState, MASTER);
    assert.deepEqual(openSession(sealed, MASTER), storageState);
  });

  test('ciphertext does not contain the plaintext token', () => {
    const sealed = sealSession(storageState, MASTER);
    assert.ok(!sealed.ciphertext.toString('utf8').includes('super-secret-token'));
    assert.ok(!sealed.ciphertext.toString('base64').includes('super-secret-token'));
  });

  test('uses a fresh IV per seal', () => {
    const a = sealSession(storageState, MASTER);
    const b = sealSession(storageState, MASTER);
    assert.notEqual(a.iv.toString('hex'), b.iv.toString('hex'));
    assert.notEqual(a.ciphertext.toString('hex'), b.ciphertext.toString('hex'));
  });

  test('rejects the wrong master key', () => {
    const sealed = sealSession(storageState, MASTER);
    assert.throws(() => openSession(sealed, OTHER));
  });

  test('detects tampered ciphertext via the auth tag', () => {
    const sealed = sealSession(storageState, MASTER);
    sealed.ciphertext[0] ^= 0xff;
    assert.throws(() => openSession(sealed, MASTER));
  });

  test('detects a tampered auth tag', () => {
    const sealed = sealSession(storageState, MASTER);
    sealed.tag[0] ^= 0xff;
    assert.throws(() => openSession(sealed, MASTER));
  });

  test('records a key version for rotation', () => {
    assert.equal(sealSession(storageState, MASTER, 2).keyVersion, 2);
  });

  test('rejects a master key that is not 32 bytes', () => {
    assert.throws(() => sealSession(storageState, Buffer.from('short').toString('base64')));
  });
});

describe('redactForLog', () => {
  test('removes cookies, storage state and auth headers', () => {
    const out = redactForLog({
      userId: 'u1',
      storageState,
      cookies: storageState.cookies,
      headers: { cookie: 'nauk_at=secret', authorization: 'Bearer abc' },
      note: 'keep me',
    });
    const serialized = JSON.stringify(out);
    assert.ok(!serialized.includes('super-secret-token'));
    assert.ok(!serialized.includes('Bearer abc'));
    assert.ok(serialized.includes('keep me'), 'non-sensitive fields survive');
  });

  test('is deep — nested secrets are caught', () => {
    const out = redactForLog({ a: { b: { cookies: [{ value: 'super-secret-token' }] } } });
    assert.ok(!JSON.stringify(out).includes('super-secret-token'));
  });

  test('does not mutate the input object', () => {
    const input = { cookies: [{ value: 'super-secret-token' }] };
    redactForLog(input);
    assert.equal(input.cookies[0]?.value, 'super-secret-token');
  });
});
