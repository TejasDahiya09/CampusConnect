/** AWS SDK transport is mocked; presigning is local cryptography only. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getClient } from '../src/services/storage/s3-storage.service.js';
import { profilePhotoStorage } from '../src/modules/profile/profile-photo-storage.js';
void test('presigned photo credentials are short lived, size bound and signed with profile metadata only', async () => {
  const grant = await profilePhotoStorage.authorize(
    'profile-photos-pending/synthetic/session.png',
    100,
    'synthetic-owner',
    'synthetic-session',
  );
  const u = new URL(grant.uploadUrl);
  assert.equal(u.searchParams.get('X-Amz-Expires'), '300');
  assert.equal(u.searchParams.get('x-amz-meta-photo-owner'), 'synthetic-owner');
  assert.equal(u.searchParams.get('x-amz-meta-photo-session'), 'synthetic-session');
  assert.equal(u.searchParams.get('x-amz-meta-photo-size'), '100');
  assert.ok(!grant.uploadUrl.includes('listing-id'));
  assert.equal(grant.headers['x-amz-server-side-encryption'], 'AES256');
});
void test('photo read checks S3 metadata and immutable ETag before reading bounded actual bytes', async (t) => {
  const calls: unknown[] = [];
  t.mock.method(getClient(), 'send', async (command: unknown) => {
    await Promise.resolve();
    calls.push(command);
    if (command instanceof HeadObjectCommand)
      return {
        ContentLength: 3,
        ContentType: 'image/png',
        ETag: 'synthetic-etag',
        ServerSideEncryption: 'AES256',
        Metadata: { 'photo-owner': 'owner', 'photo-session': 'session', 'photo-size': '3' },
      };
    if (command instanceof GetObjectCommand) {
      assert.equal(command.input.IfMatch, 'synthetic-etag');
      return { Body: Readable.from([Buffer.from([1, 2, 3])]) };
    }
    throw new Error('Unexpected SDK operation');
  });
  assert.deepEqual(
    await profilePhotoStorage.read('synthetic-key', 3, 'owner', 'session'),
    Buffer.from([1, 2, 3]),
  );
  assert.equal(calls.length, 2);
});
void test('incorrect ownership/size metadata blocks object reads', async (t) => {
  let reads = 0;
  t.mock.method(getClient(), 'send', async (command: unknown) => {
    await Promise.resolve();
    if (command instanceof GetObjectCommand) reads++;
    return {
      ContentLength: 3,
      ContentType: 'image/png',
      ETag: 'synthetic',
      ServerSideEncryption: 'AES256',
      Metadata: { 'photo-owner': 'other' },
    };
  });
  await assert.rejects(() => profilePhotoStorage.read('synthetic-key', 3, 'owner', 'session'));
  assert.equal(reads, 0);
});
void test('oversized response body aborts without publishing', async (t) => {
  t.mock.method(getClient(), 'send', (command: unknown) =>
    Promise.resolve(
      command instanceof HeadObjectCommand
        ? {
            ContentLength: 3,
            ContentType: 'image/png',
            ETag: 'synthetic',
            ServerSideEncryption: 'AES256',
            Metadata: { 'photo-owner': 'owner', 'photo-session': 'session', 'photo-size': '3' },
          }
        : { Body: Readable.from([Buffer.alloc(10)]) },
    ),
  );
  await assert.rejects(() => profilePhotoStorage.read('synthetic-key', 3, 'owner', 'session'));
});
void test('only canonical server bytes are published with SSE and no-store; deletion is explicitly scoped', async (t) => {
  const commands: unknown[] = [];
  t.mock.method(getClient(), 'send', (command: unknown) => {
    commands.push(command);
    return Promise.resolve({});
  });
  await profilePhotoStorage.put('profile-photos/synthetic.png', Buffer.from([1, 2, 3]), 'owner');
  await profilePhotoStorage.remove('profile-photos/synthetic.png');
  assert.ok(commands[0] instanceof PutObjectCommand);
  assert.equal(commands[0].input.CacheControl, 'no-store');
  assert.equal(commands[0].input.ServerSideEncryption, 'AES256');
  assert.ok(commands[1] instanceof DeleteObjectCommand);
  assert.equal(commands[1].input.Key, 'profile-photos/synthetic.png');
});

void test('published-object removal verifies origin ownership before issuing DELETE', async (t) => {
  let deletions = 0;
  t.mock.method(getClient(), 'send', (command: unknown) => {
    if (command instanceof DeleteObjectCommand) deletions++;
    return Promise.resolve({ Metadata: { 'photo-owner': 'another-owner' } });
  });
  await assert.rejects(() => profilePhotoStorage.remove('profile-photos/synthetic.png', 'owner'));
  assert.equal(deletions, 0);
});
