import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '../src/generated/prisma/client.js';
import type { SearchRepository } from '../src/modules/search/search.repository.js';
import { createSearchService } from '../src/modules/search/search.service.js';
import { parseSearchQuery } from '../src/modules/search/search.validation.js';

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const createdAt = new Date('2026-01-01T00:00:00.000Z');

const repository: SearchRepository = {
  students: () =>
    Promise.resolve([
      {
        avatar: { id: 'campus-indigo' },
        bio: 'Builds accessible tools',
        department: 'Computer Science',
        fullName: 'Python Student',
        interests: ['Machine Learning'],
        skills: ['Python'],
        userId: firstId,
      },
    ]),
  marketplace: () =>
    Promise.resolve([
      {
        category: 'Books & Study Material',
        createdAt,
        currency: 'INR',
        description: 'Introductory programming guide',
        id: secondId,
        images: [],
        location: 'Library',
        price: new Prisma.Decimal('450'),
        title: 'Python Programming Book',
      },
    ]),
  lostFound: () => Promise.resolve([]),
  teamUp: () => Promise.resolve([]),
  services: () => Promise.resolve([]),
};

void test('search query validation normalizes and bounds authenticated API input', () => {
  assert.deepEqual(parseSearchQuery({ q: '  python   book ', type: 'student' }), {
    limit: 12,
    page: 1,
    query: 'python book',
    type: 'STUDENT',
  });
  assert.throws(() => parseSearchQuery({ q: ' ' }), /Invalid search request/);
  assert.throws(() => parseSearchQuery({ q: 'ok', limit: '500' }), /Invalid search request/);
  assert.throws(() => parseSearchQuery({ q: 'ok', private: 'true' }), /Invalid search request/);
});

void test('global search returns ranked controlled projections without private fields', async () => {
  const response = await createSearchService(repository).search({
    limit: 5,
    page: 1,
    query: 'python',
    type: 'ALL',
  });
  assert.deepEqual(
    response.items.map((item) => item.type),
    ['STUDENT', 'MARKETPLACE'],
  );
  assert.equal(response.items[0]?.navigationTarget, `/profile/${firstId}`);
  assert.equal(response.items[1]?.navigationTarget, `/marketplace/${secondId}`);
  assert.equal(response.items[1]?.subtitle, 'INR 450');
  const serialized = JSON.stringify(response);
  for (const forbidden of ['email', 'claims', 'applications', 'bookings', 'message', 'objectKey']) {
    assert.equal(serialized.includes(`"${forbidden}"`), false);
  }
});

void test('type filtering and pagination remain bounded', async () => {
  const response = await createSearchService(repository).search({
    limit: 1,
    page: 1,
    query: 'python',
    type: 'MARKETPLACE',
  });
  assert.equal(response.items.length, 1);
  assert.equal(response.items[0]?.type, 'MARKETPLACE');
  assert.equal(response.totals.STUDENT, 0);
});
