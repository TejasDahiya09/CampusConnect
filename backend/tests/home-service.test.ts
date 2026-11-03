import assert from 'node:assert/strict';
import test from 'node:test';
import type { HomeRepository } from '../src/modules/home/home.repository.js';
import { createHomeService } from '../src/modules/home/home.service.js';
const date = new Date('2026-10-07T12:00:00Z');
const repository: HomeRepository = {
  read: () =>
    Promise.resolve({
      displayName: 'Campus Student',
      profileCompletion: 70,
      unreadMessages: 2,
      marketplace: [{ id: 'own-market', status: 'ACTIVE', title: 'Mine', updatedAt: date }],
      lostFound: [
        {
          claims: [{ status: 'PENDING', message: 'private' }],
          id: 'own-report',
          status: 'CLAIM_PENDING',
          title: 'Report',
          updatedAt: date,
        },
      ],
      teamUp: [
        {
          applications: [{ status: 'PENDING' }],
          id: 'own-team',
          maxMembers: 5,
          members: [],
          status: 'OPEN',
          title: 'Project',
          updatedAt: date,
        },
      ],
      services: [
        {
          bookings: [{ status: 'PENDING' }],
          id: 'own-service',
          status: 'ACTIVE',
          title: 'Tutoring',
          updatedAt: date,
        },
      ],
      discover: [
        {
          id: 'other-market',
          kind: 'MARKETPLACE',
          status: 'ACTIVE',
          title: 'Discover me',
          updatedAt: date,
        },
      ],
    }),
};
void test('Home separates act, explore, and resume while deduplicating entities', async () => {
  const result = await createHomeService(repository).get('user');
  assert.equal(result.attentionItems.length, 4);
  assert.equal(result.discoverItems.length, 1);
  assert.equal(
    result.continueItems.some(({ path }) => path === '/lost-found/own-report'),
    false,
  );
  assert.equal(
    result.continueItems.some(({ path }) => path === '/teamup/own-team'),
    false,
  );
  assert.equal(
    result.continueItems.some(({ path }) => path === '/services/own-service'),
    false,
  );
  assert.equal(result.continueItems[0]?.path, '/marketplace/own-market');
});
void test('Home caps sections and excludes private incoming content', async () => {
  const result = await createHomeService(repository).get('user');
  assert.ok(result.attentionItems.length <= 4);
  assert.ok(result.discoverItems.length <= 4);
  assert.ok(result.continueItems.length <= 3);
  assert.equal(JSON.stringify(result).includes('private'), false);
});
