import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from '../src/errors/app-error.js';
import { createMessageEncryption } from '../src/modules/messaging/message-encryption.js';

const key = Buffer.alloc(32, 7);

void test('AES-256-GCM round trips without deterministic ciphertext', () => {
  const encryption = createMessageEncryption(key);
  const first = encryption.encrypt('private campus message');
  const second = encryption.encrypt('private campus message');
  assert.equal(encryption.decrypt(first), 'private campus message');
  assert.equal(encryption.decrypt(second), 'private campus message');
  assert.notDeepEqual(first.encryptionIv, second.encryptionIv);
  assert.notDeepEqual(first.encryptedContent, second.encryptedContent);
});

void test('AES-256-GCM rejects ciphertext and tag tampering', () => {
  const encryption = createMessageEncryption(key);
  const encrypted = encryption.encrypt('do not expose me');
  const ciphertext = encrypted.encryptedContent.slice();
  ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
  assert.throws(
    () => encryption.decrypt({ ...encrypted, encryptedContent: ciphertext }),
    (error: unknown) => error instanceof AppError && error.code === 'MESSAGE_DECRYPTION_FAILED',
  );
  const tag = encrypted.encryptionTag.slice();
  tag[0] = (tag[0] ?? 0) ^ 1;
  assert.throws(() => encryption.decrypt({ ...encrypted, encryptionTag: tag }));
  assert.throws(() => encryption.decrypt({ ...encrypted, encryptionTag: new Uint8Array(0) }));
  assert.throws(() => encryption.decrypt({ ...encrypted, encryptionIv: new Uint8Array(0) }));
  assert.throws(() => encryption.decrypt({ ...encrypted, encryptedContent: new Uint8Array(0) }));
});

void test('wrong keys, unsupported versions, and missing configuration fail closed', () => {
  const encrypted = createMessageEncryption(key).encrypt('confidential');
  assert.throws(() => createMessageEncryption(Buffer.alloc(32, 8)).decrypt(encrypted));
  assert.throws(() => createMessageEncryption(key).decrypt({ ...encrypted, encryptionVersion: 2 }));
  assert.throws(
    () => createMessageEncryption(Buffer.alloc(0)).encrypt('unavailable'),
    (error: unknown) =>
      error instanceof AppError && error.code === 'MESSAGE_ENCRYPTION_UNAVAILABLE',
  );
});
