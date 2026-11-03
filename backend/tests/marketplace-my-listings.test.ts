import assert from 'node:assert/strict';
import { it } from 'node:test';
import express from 'express';
import { createApp } from '../src/app.js';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createMyListingsController } from '../src/modules/marketplace/marketplace.controller.js';
import { buildListingWhere } from '../src/modules/marketplace/marketplace.repository.js';
import { withTestServer } from './helpers/test-server.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
void it('My listings applies authenticated ownership without weakening public eligibility', () => {
  const query = { page: 1, limit: 12, sort: 'newest' as const };
  const publicWhere = buildListingWhere(query);
  const ownWhere = buildListingWhere(query, ownerId);
  assert.deepEqual(ownWhere, { sellerId: ownerId, ...publicWhere });
  assert.equal(publicWhere.sellerId, undefined);
});
void it('My listings rejects unauthenticated access', async () => {
  await withTestServer(createApp(), async (url) => {
    assert.equal((await fetch(url + '/api/marketplace/my-listings')).status, 401);
  });
});
void it('My listings derives both owner and viewer from auth and validates pagination and forged identity', async () => {
  const app = express();
  let calls = 0;
  app.use((request, _response, next) => {
    request.auth = {
      identity: {
        id: ownerId,
        email: 'fixture@example.invalid',
        emailVerified: true,
        metadata: {},
      },
      user: {
        id: ownerId,
        email: 'fixture@example.invalid',
        emailVerifiedAt: new Date(),
        role: UserRole.STUDENT,
        status: AccountStatus.ACTIVE,
        profile: { id: ownerId, displayName: 'Fixture owner' },
      },
    };
    next();
  });
  app.get(
    '/mine',
    createMyListingsController({
      list: (query, viewer, owner) => {
        calls++;
        assert.equal(viewer, ownerId);
        assert.equal(owner, ownerId);
        assert.equal(query.page, 2);
        assert.equal(query.limit, 12);
        return Promise.resolve({ items: [], total: 13 });
      },
    }),
  );
  app.use(errorHandler);
  await withTestServer(app, async (url) => {
    const response = await fetch(url + '/mine?page=2&limit=12');
    assert.equal(response.status, 200);
    const body = (await response.json()) as { meta: { totalPages: number; total: number } };
    assert.equal(body.meta.total, 13);
    assert.equal(body.meta.totalPages, 2);
    assert.equal((await fetch(url + '/mine?sellerId=another-user')).status, 400);
    assert.equal((await fetch(url + '/mine?page=0')).status, 400);
    assert.equal(calls, 1);
  });
});
