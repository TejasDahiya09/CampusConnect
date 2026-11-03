import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import express from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { createAuthenticationMiddleware } from '../src/modules/auth/auth.middleware.js';
import { AccountStatus, UserRole, type PrismaClient } from '../src/generated/prisma/client.js';
import { AppError } from '../src/errors/app-error.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import {
  createProfilePhotoRouter,
  createPhotoRepository,
  photoVersion,
  readPhotoTicket,
  signPhotoTicket,
} from '../src/modules/profile/profile-photo.js';
import {
  canonicalPhoto,
  pngChunk,
  PHOTO_BYTES,
} from '../src/modules/profile/profile-photo-image.js';
import { storedPhoto, profileAvatarView } from '../src/modules/profile/profile-avatar-value.js';
import { servicePerson } from '../src/modules/services/services-policy.js';
import type { PhotoStorage } from '../src/modules/profile/profile-photo-storage.js';
import { withTestServer } from './helpers/test-server.js';
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function png(side = 512, filter = 0) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((side * 4 + 1) * side);
  for (let y = 0; y < side; y++) raw[y * (side * 4 + 1)] = filter;
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
const image = png(),
  secret = 'synthetic-photo-ticket-key-32-characters';
const owner = randomUUID(),
  other = randomUUID();
function fixture(
  ready = true,
  restrictions: { allowedOwnerId?: string; localOnly?: boolean; peer?: string } = {},
) {
  let avatar: unknown = { type: 'predefined', id: 'campus-indigo' },
    status: AccountStatus = AccountStatus.ACTIVE,
    failure = '';
  let authorizations = 0;
  const objects = new Map<string, Uint8Array>();
  const key = randomBytes(32);
  const storage: PhotoStorage = {
    authorize: (objectKey) => {
      authorizations++;
      if (failure === 'authorize') throw new Error('SYNTHETIC_PRIVATE_S3_ERROR');
      return Promise.resolve({
        uploadUrl: 'https://synthetic.s3.amazonaws.com/' + objectKey,
        headers: { 'content-type': 'image/png' },
      });
    },
    read: (objectKey) => {
      if (failure === 'read') throw new Error('SYNTHETIC_PRIVATE_S3_ERROR');
      const value = objects.get(objectKey);
      if (!value) throw new Error('Not uploaded');
      return Promise.resolve(value);
    },
    put: (objectKey, value) => {
      if (failure === 'put') throw new Error('SYNTHETIC_PRIVATE_S3_ERROR');
      objects.set(objectKey, value);
      return Promise.resolve();
    },
    remove: (objectKey) => {
      objects.delete(objectKey);
      return Promise.resolve();
    },
  };
  const auth = createAuthenticationMiddleware({
    repository: {
      findById: (id) =>
        Promise.resolve({
          id,
          email: 'synthetic@example.test',
          emailVerifiedAt: new Date(),
          role: UserRole.STUDENT,
          status,
          profile: { id, displayName: 'Synthetic student' },
        }),
    },
    verifyAccessToken: async (token) => {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: 'photo-test',
          audience: 'photo-test',
          algorithms: ['HS256'],
        });
        return {
          id: payload.sub!,
          email: 'synthetic@example.test',
          emailVerified: true,
          metadata: {},
        };
      } catch {
        throw new AppError({
          code: 'INVALID_TEST_TOKEN',
          message: 'Invalid authentication.',
          statusCode: 401,
        });
      }
    },
  });
  const app = express();
  app.use(express.json());
  if (restrictions.peer)
    app.use((req, _res, next) => {
      Object.defineProperty(req.socket, 'remoteAddress', {
        value: restrictions.peer,
        configurable: true,
      });
      next();
    });
  app.use(
    '/api/profile/me/photo',
    createProfilePhotoRouter({
      ready,
      allowedOwnerId: restrictions.allowedOwnerId,
      localOnly: restrictions.localOnly,
      secret,
      requireAuth: auth.requireAuth,
      repository: {
        read: () => {
          if (status !== 'ACTIVE')
            throw new AppError({ code: 'INACTIVE', message: 'Inactive account.', statusCode: 403 });
          return Promise.resolve(avatar);
        },
        replace: (_id, version, next) => {
          if (failure === 'database') throw new Error('SYNTHETIC_PRIVATE_DATABASE_ERROR');
          if (failure === 'conflict' || photoVersion(avatar) !== version)
            return Promise.resolve(false);
          avatar = next;
          return Promise.resolve(true);
        },
      },
      storage,
    }),
  );
  app.use(errorHandler);
  const token = (id = owner) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('photo-test')
      .setAudience('photo-test')
      .setSubject(id)
      .setExpirationTime('2m')
      .sign(key);
  return {
    app,
    token,
    objects,
    get: () => avatar,
    set: (value: unknown) => {
      avatar = value;
    },
    status: (value: AccountStatus) => {
      status = value;
    },
    fail: (value: string) => {
      failure = value;
    },
    authorizations: () => authorizations,
  };
}
async function request(base: string, token: string, method = 'GET', path = '', body?: unknown) {
  return fetch(base + '/api/profile/me/photo' + path, {
    method,
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function grant(base: string, f: ReturnType<typeof fixture>, token: string) {
  const response = await request(base, token, 'POST', '/uploads', {
    size: image.length,
    version: photoVersion(f.get()),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { ticket: string } };
  const ticket = body.data.ticket,
    decoded = readPhotoTicket(ticket, owner, secret, Date.now());
  f.objects.set(`profile-photos-pending/${owner}/${decoded.nonce}.png`, image);
  return ticket;
}
void test('PNG validation checks dimensions, full decompression, checksums, filters and trailing data', () => {
  assert.deepEqual(canonicalPhoto(image), image);
  for (const bad of [
    Buffer.from('<svg/>'),
    png(128),
    png(512, 5),
    Buffer.concat([image, Buffer.from('trailing')]),
    Buffer.alloc(PHOTO_BYTES + 1),
  ])
    assert.throws(() => canonicalPhoto(bad));
  const corrupt = Buffer.from(image);
  corrupt[30] = 1;
  assert.throws(() => canonicalPhoto(corrupt));
});
void test('canonical photo strips safe ancillary metadata and rejects active/unknown chunks', () => {
  const offset = 33;
  const withMeta = Buffer.concat([
    image.subarray(0, offset),
    pngChunk('pHYs', Buffer.alloc(9)),
    image.subarray(offset),
  ]);
  assert.deepEqual(canonicalPhoto(withMeta), image);
  const withText = Buffer.concat([
    image.subarray(0, offset),
    pngChunk('tEXt', Buffer.from('private')),
    image.subarray(offset),
  ]);
  assert.throws(() => canonicalPhoto(withText));
});
void test('photo tickets enforce owner, signature, expiry, size and independent secret', () => {
  const value = {
    owner,
    nonce: randomUUID(),
    size: 100,
    version: photoVersion(null),
    expires: Date.now() + 1000,
  };
  const ticket = signPhotoTicket(value, secret);
  assert.equal(readPhotoTicket(ticket, owner, secret, Date.now()).owner, owner);
  for (const run of [
    () => readPhotoTicket(ticket, other, secret, Date.now()),
    () => readPhotoTicket(ticket, owner, secret + 'x', Date.now()),
    () => readPhotoTicket(ticket, owner, secret, Date.now() + 2000),
    () => readPhotoTicket(ticket + 'x', owner, secret, Date.now()),
    () =>
      readPhotoTicket(
        signPhotoTicket({ ...value, size: PHOTO_BYTES + 1 }, secret),
        owner,
        secret,
        Date.now(),
      ),
  ])
    assert.throws(run);
});
void test('disabled photo storage performs no signing or persistence and reports unavailable', async () => {
  const f = fixture(false);
  await withTestServer(f.app, async (base) => {
    const token = await f.token();
    assert.deepEqual(
      ((await (await request(base, token)).json()) as { data: { photo: unknown } }).data.photo,
      { available: false, avatar: null, version: null },
    );
    assert.equal((await request(base, token, 'POST', '/uploads', { size: 20 })).status, 503);
    assert.equal(f.authorizations(), 0);
  });
});
void test('real authentication middleware rejects missing/invalid credentials and inactive actors', async () => {
  const f = fixture();
  await withTestServer(f.app, async (base) => {
    assert.equal((await fetch(base + '/api/profile/me/photo')).status, 401);
    assert.equal((await request(base, 'invalid')).status, 401);
    const token = await f.token();
    for (const status of [AccountStatus.SUSPENDED, AccountStatus.DEACTIVATED]) {
      f.status(status);
      assert.equal((await request(base, token)).status, 403);
      assert.equal((await request(base, token, 'POST', '/uploads', {})).status, 403);
    }
    assert.equal(f.authorizations(), 0);
  });
});
void test('forged ownership, client object keys, unsupported sizes and stale versions fail before signing', async () => {
  const f = fixture();
  await withTestServer(f.app, async (base) => {
    const token = await f.token();
    for (const body of [
      { userId: other, size: 100, version: photoVersion(f.get()) },
      { objectKey: 'someone-else', size: 100, version: photoVersion(f.get()) },
      { size: PHOTO_BYTES + 1, version: photoVersion(f.get()) },
    ])
      assert.equal((await request(base, token, 'POST', '/uploads', body)).status, 400);
    assert.equal(
      (await request(base, token, 'POST', '/uploads', { size: 100, version: photoVersion(null) }))
        .status,
      409,
    );
    assert.equal(f.authorizations(), 0);
  });
});
void test('upload completion, replacement and removal preserve fallback and expose only delivery DTOs', async () => {
  const f = fixture();
  await withTestServer(f.app, async (base) => {
    const token = await f.token(),
      ticket = await grant(base, f, token);
    assert.equal((await request(base, token, 'POST', '/uploads/complete', { ticket })).status, 200);
    const old = storedPhoto(f.get())!;
    assert.ok(old);
    assert.ok(f.objects.has(old.objectKey));
    const next = await grant(base, f, token);
    assert.equal(
      (await request(base, token, 'POST', '/uploads/complete', { ticket: next })).status,
      200,
    );
    assert.ok(!f.objects.has(old.objectKey));
    const response = await request(base, token);
    assert.ok(!(await response.text()).includes('objectKey'));
    assert.equal(
      (await request(base, token, 'DELETE', '', { version: photoVersion(f.get()) })).status,
      200,
    );
    assert.deepEqual(f.get(), { type: 'predefined', id: 'campus-indigo' });
    assert.equal(f.objects.size, 0);
  });
});
void test('other students cannot complete or cancel an owner upload', async () => {
  const f = fixture();
  await withTestServer(f.app, async (base) => {
    const token = await f.token(),
      ticket = await grant(base, f, token),
      otherToken = await f.token(other);
    assert.equal(
      (await request(base, otherToken, 'POST', '/uploads/complete', { ticket })).status,
      400,
    );
    assert.equal((await request(base, otherToken, 'DELETE', '/uploads', { ticket })).status, 400);
    assert.equal(f.objects.size, 1);
    assert.equal((await request(base, token, 'DELETE', '/uploads', { ticket })).status, 200);
    assert.equal(f.objects.size, 0);
  });
});
for (const failure of ['read', 'put', 'database', 'conflict'])
  void test(
    'completion ' + failure + ' failure preserves original avatar and never exposes private errors',
    async () => {
      const f = fixture();
      await withTestServer(f.app, async (base) => {
        const token = await f.token(),
          before = f.get(),
          ticket = await grant(base, f, token);
        f.fail(failure);
        const response = await request(base, token, 'POST', '/uploads/complete', { ticket });
        assert.equal(response.status, failure === 'conflict' ? 409 : 503);
        assert.ok(!(await response.text()).includes('SYNTHETIC_PRIVATE'));
        assert.deepEqual(f.get(), before);
        if (failure !== 'database') assert.equal(f.objects.size, 0);
      });
    },
  );
void test('missing or invalid object cannot be associated with profile', async () => {
  const f = fixture();
  await withTestServer(f.app, async (base) => {
    const token = await f.token(),
      before = f.get(),
      ticket = await grant(base, f, token);
    const key = [...f.objects.keys()][0]!;
    f.objects.set(key, Buffer.from('not PNG'));
    assert.equal((await request(base, token, 'POST', '/uploads/complete', { ticket })).status, 400);
    assert.deepEqual(f.get(), before);
    assert.equal(f.objects.size, 0);
  });
});
void test('competing completions keep only the winning immutable object', async () => {
  const f = fixture();
  await withTestServer(f.app, async (base) => {
    const token = await f.token(),
      ticket = await grant(base, f, token);
    const responses = await Promise.all([
      request(base, token, 'POST', '/uploads/complete', { ticket }),
      request(base, token, 'POST', '/uploads/complete', { ticket }),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    const photo = storedPhoto(f.get())!;
    assert.ok(f.objects.has(photo.objectKey));
    assert.equal(f.objects.size, 1);
  });
});
void test('shared avatar projection strips storage references and respects hidden participant boundaries', () => {
  const id = randomUUID(),
    value = { type: 'photo', id, objectKey: `profile-photos/${id}.png`, fallback: null };
  const view = profileAvatarView(value);
  assert.ok(!JSON.stringify(view).includes('objectKey'));
  assert.equal(profileAvatarView({ ...value, objectKey: 'arbitrary' }), null);
  const hidden = servicePerson({
    id: owner,
    status: AccountStatus.ACTIVE,
    profile: {
      avatar: value,
      department: null,
      fullName: 'Synthetic',
      moderationVisibility: 'HIDDEN',
    },
  });
  assert.equal(hidden.avatar, null);
});

void test('photo repository locks/rechecks ACTIVE account and compare-and-swaps only avatar JSON', async () => {
  let active = true,
    avatar: unknown = null,
    writes = 0;
  const order: string[] = [];
  const tx = {
    $queryRaw: () => {
      order.push('lock');
      return Promise.resolve([]);
    },
    user: {
      findUnique: () => {
        order.push('read');
        return Promise.resolve({ status: active ? 'ACTIVE' : 'DEACTIVATED', profile: { avatar } });
      },
    },
    profile: {
      update: (args: { data: { avatar: unknown } }) => {
        order.push('write');
        writes++;
        avatar = args.data.avatar;
        return Promise.resolve({});
      },
    },
  };
  const db = {
    ...tx,
    $transaction: <T>(work: (client: typeof tx) => Promise<T>) => work(tx),
  } as unknown as PrismaClient;
  const repo = createPhotoRepository(db);
  const next = { type: 'predefined', id: 'campus-cyan' };
  assert.equal(await repo.replace(owner, photoVersion(null), next), true);
  assert.deepEqual(order, ['lock', 'read', 'write']);
  assert.equal(writes, 1);
  assert.equal(await repo.replace(owner, photoVersion(null), next), false);
  assert.equal(writes, 1);
  active = false;
  await assert.rejects(() => repo.replace(owner, photoVersion(avatar), next));
  assert.equal(writes, 1);
});
void test('photo version canonicalizes object ordering without equating no avatar to a preset', () => {
  assert.equal(photoVersion({ a: 1, b: 2 }), photoVersion({ b: 2, a: 1 }));
  assert.notEqual(photoVersion(null), photoVersion({ type: 'predefined', id: 'campus-indigo' }));
});
void test('upload authorizations are bounded per actor and responses are private/no-store', async () => {
  const f = fixture();
  await withTestServer(f.app, async (base) => {
    const token = await f.token();
    assert.match(
      (await request(base, token)).headers.get('cache-control') ?? '',
      /private.*no-store/,
    );
    for (let i = 0; i < 8; i++)
      assert.equal(
        (
          await request(base, token, 'POST', '/uploads', {
            size: image.length,
            version: photoVersion(f.get()),
          })
        ).status,
        200,
      );
    assert.equal(
      (
        await request(base, token, 'POST', '/uploads', {
          size: image.length,
          version: photoVersion(f.get()),
        })
      ).status,
      429,
    );
    assert.equal(f.authorizations(), 8);
  });
});
void test('stale removal cannot delete a newer committed photo', async () => {
  const f = fixture();
  await withTestServer(f.app, async (base) => {
    const token = await f.token(),
      before = photoVersion(f.get()),
      ticket = await grant(base, f, token);
    assert.equal((await request(base, token, 'POST', '/uploads/complete', { ticket })).status, 200);
    const photo = f.get();
    assert.equal((await request(base, token, 'DELETE', '', { version: before })).status, 409);
    assert.deepEqual(f.get(), photo);
    assert.equal(f.objects.size, 1);
  });
});

type PhotoEnvelope = {
  data: { photo: { available: boolean; avatar: { type: string } | null; version: string | null } };
};
const photoEnvelope = (response: Response) => response.json() as Promise<PhotoEnvelope>;
void test('local photo activation exposes readiness only to the approved ACTIVE owner on loopback', async () => {
  const f = fixture(true, { allowedOwnerId: owner, localOnly: true });
  await withTestServer(f.app, async (base) => {
    const approved = await f.token(),
      unapproved = await f.token(other);
    assert.equal((await photoEnvelope(await request(base, approved))).data.photo.available, true);
    assert.equal(
      (await photoEnvelope(await request(base, unapproved))).data.photo.available,
      false,
    );
    assert.equal(
      (
        await request(base, unapproved, 'POST', '/uploads', {
          size: image.length,
          version: photoVersion(f.get()),
        })
      ).status,
      503,
    );
    assert.equal(f.authorizations(), 0);
    assert.deepEqual(f.get(), { type: 'predefined', id: 'campus-indigo' });
    const ticket = await grant(base, f, approved);
    assert.equal(
      (await request(base, approved, 'POST', '/uploads/complete', { ticket })).status,
      200,
    );
    const fresh = await photoEnvelope(await request(base, approved));
    assert.equal(fresh.data.photo.avatar?.type, 'photo');
    assert.equal(fresh.data.photo.version, photoVersion(f.get()));
    assert.ok(!JSON.stringify(fresh).includes('objectKey'));
  });
});
void test('remote photo requests remain disabled even with a valid approved-owner token', async () => {
  const f = fixture(true, { allowedOwnerId: owner, localOnly: true, peer: '198.51.100.2' });
  await withTestServer(f.app, async (base) => {
    const token = await f.token();
    assert.equal((await photoEnvelope(await request(base, token))).data.photo.available, false);
    assert.equal(
      (
        await request(base, token, 'POST', '/uploads', {
          size: image.length,
          version: photoVersion(f.get()),
        })
      ).status,
      503,
    );
    assert.equal(f.authorizations(), 0);
  });
});
