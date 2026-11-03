/** Non-destructive HTTP contract: controlled signed issuer + real auth middleware; in-memory storage. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';
import { professionalVersion } from '../src/modules/profile/professional-profile.js';
import { createProfessionalHttpFixture } from './helpers/professional-http-app.js';
import { professionalHttpCases } from './helpers/professional-http-contract.js';
import { withTestServer } from './helpers/test-server.js';
const owner = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222';
const statuses = new Map<string, AccountStatus>([
  [owner, AccountStatus.ACTIVE],
  [other, AccountStatus.ACTIVE],
]);
const documents = new Map<string, unknown>();
const users = {
  findById: (id: string) =>
    Promise.resolve(
      statuses.has(id)
        ? {
            id,
            email: 'synthetic@example.test',
            emailVerifiedAt: new Date(),
            role: UserRole.STUDENT,
            status: statuses.get(id)!,
            profile: { id, displayName: 'Synthetic student' },
          }
        : null,
    ),
};
const profiles = {
  findByUserId: (id: string) =>
    Promise.resolve(
      statuses.has(id)
        ? {
            userId: id,
            email: 'synthetic@example.test',
            emailVerifiedAt: new Date(),
            academicYear: null,
            achievements: [],
            avatar: null,
            bio: null,
            department: null,
            fullName: 'Synthetic student',
            interests: [],
            location: null,
            portfolio: [],
            profileCompletion: 0,
            skillProficiencies: {},
            skills: [],
          }
        : null,
    ),
};
const store = {
  read: (id: string) => Promise.resolve(documents.get(id) ?? null),
  write: (id: string, input: unknown, version: string) => {
    if (professionalVersion(documents.get(id) ?? null) !== version)
      return Promise.resolve('conflict' as const);
    documents.set(id, input);
    return Promise.resolve(true);
  },
};
for (const scenario of professionalHttpCases)
  void test('controlled-auth HTTP: ' + scenario.name, async () => {
    const fixture = createProfessionalHttpFixture({ users, profiles, store });
    await withTestServer(fixture.app, (base) =>
      scenario.run({
        base,
        owner,
        other,
        token: fixture.token,
        setStatus: (id, status) => {
          statuses.set(id, status);
          return Promise.resolve();
        },
        stored: (id) => Promise.resolve(documents.get(id) ?? null),
      }),
    );
  });
void test('controlled-auth HTTP: disabled storage uses no professional repository operation', async () => {
  let calls = 0;
  const fail = {
    read: () => {
      calls++;
      return Promise.reject(new Error('Must not read'));
    },
    write: () => {
      calls++;
      return Promise.reject(new Error('Must not write'));
    },
  };
  const fixture = createProfessionalHttpFixture({ users, profiles, store: fail, ready: false });
  await withTestServer(fixture.app, async (base) => {
    const headers = {
      authorization: `Bearer ${await fixture.token(owner)}`,
      'content-type': 'application/json',
    };
    const get = await fetch(base + '/api/profile/me/professional', { headers });
    assert.equal(get.status, 200);
    assert.deepEqual(
      ((await get.json()) as { data: { professional: unknown } }).data.professional,
      { available: false, details: null, version: null },
    );
    assert.equal(
      (await fetch(base + '/api/profile/me/professional', { method: 'PUT', headers, body: '{}' }))
        .status,
      503,
    );
    assert.equal(calls, 0);
  });
});
void test('controlled-auth HTTP: storage failures remain generic and never claim a saved record', async () => {
  const privateText = 'SYNTHETIC_PRIVATE_HTTP_FAILURE';
  const fixture = createProfessionalHttpFixture({
    users,
    profiles,
    store: {
      read: () => Promise.reject(new Error(privateText)),
      write: () => Promise.reject(new Error(privateText)),
    },
  });
  await withTestServer(fixture.app, async (base) => {
    const headers = {
      authorization: `Bearer ${await fixture.token(owner)}`,
      'content-type': 'application/json',
      'if-match': `"${professionalVersion(null)}"`,
    };
    for (const method of ['GET', 'PUT']) {
      const response = await fetch(base + '/api/profile/me/professional', {
        method,
        headers,
        ...(method === 'PUT'
          ? { body: JSON.stringify({ headline: null, education: [], experience: [] }) }
          : {}),
      });
      assert.equal(response.status, 503);
      const text = await response.text();
      assert.ok(!text.includes(privateText));
      assert.ok(!text.includes('version'));
    }
  });
});
