import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  photoLocalActivation,
  isPhotoLoopback,
} from '../src/modules/profile/profile-photo-readiness.js';
const config = {
  nodeEnv: 'development',
  flag: 'true',
  secret: 'synthetic-random-secret-at-least-32-chars',
  ownerId: '11111111-1111-4111-8111-111111111111',
  region: 'ap-south-2',
  bucket: 'synthetic-photo-bucket',
  deliveryUrl: 'https://cdn.example.test',
  frontendUrl: 'http://localhost:5173',
};
void test('only explicit complete local photo configuration permits a controlled verification', () => {
  assert.equal(photoLocalActivation(config).enabled, true);
  assert.equal(
    photoLocalActivation({ ...config, ownerId: config.ownerId.toUpperCase() }).ownerId,
    config.ownerId,
  );
  assert.ok(!JSON.stringify(photoLocalActivation(config)).includes(config.secret));
});
void test('production/test modes, absent flags/secrets/owners and remote frontend fail closed', () => {
  for (const patch of [
    { nodeEnv: 'production' },
    { nodeEnv: 'test' },
    { flag: undefined },
    { flag: 'TRUE' },
    { secret: undefined },
    { secret: 'short' },
    { ownerId: undefined },
    { ownerId: 'not-a-student' },
    { frontendUrl: 'https://campus.example.test' },
    { frontendUrl: 'http://localhost.evil.test' },
    { frontendUrl: 'http://user:password@localhost:5173' },
    { bucket: undefined },
    { deliveryUrl: undefined },
    { deliveryUrl: 'http://cdn.example.test' },
    { deliveryUrl: 'https://user:password@cdn.example.test' },
    { deliveryUrl: 'https://cdn.example.test/private?token=x' },
  ])
    assert.equal(
      photoLocalActivation({ ...config, ...patch }).enabled,
      false,
      JSON.stringify(Object.keys(patch)),
    );
  assert.equal(
    photoLocalActivation({ ...config, ownerId: 'password-like-invalid-input' }).ownerId,
    null,
  );
});
void test('local photo transport uses actual peer addresses, not forwarded headers or partial matches', () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1'])
    assert.equal(isPhotoLoopback(address), true);
  for (const address of [
    undefined,
    '198.51.100.2',
    '::ffff:198.51.100.2',
    '127.0.0.1.example',
    'localhost',
  ])
    assert.equal(isPhotoLoopback(address), false);
});
