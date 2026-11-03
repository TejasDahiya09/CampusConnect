import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AccountStatus,
  ListingCondition,
  ListingStatus,
  ModerationVisibility,
} from '../src/generated/prisma/client.js';
import {
  buildListingWhere,
  getListingOrderBy,
} from '../src/modules/marketplace/marketplace.repository.js';
import type { ListingQuery } from '../src/modules/marketplace/marketplace.types.js';
import { parseListingQuery } from '../src/modules/marketplace/marketplace.validation.js';

const categoryId = 'books-study-material';
const query = (overrides: Partial<ListingQuery> = {}): ListingQuery => ({
  limit: 12,
  page: 1,
  sort: 'newest',
  ...overrides,
});

void describe('Marketplace discovery', () => {
  void it('builds case-insensitive title and description search without hiding sold listings', () => {
    assert.deepEqual(buildListingWhere(query({ search: 'Graph Theory' })), {
      OR: [
        { title: { contains: 'Graph Theory', mode: 'insensitive' } },
        { description: { contains: 'Graph Theory', mode: 'insensitive' } },
      ],
      moderationVisibility: ModerationVisibility.VISIBLE,
      seller: { status: AccountStatus.ACTIVE },
      status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLD] },
    });
  });

  void it('combines category, condition, and exact decimal price bounds', () => {
    assert.deepEqual(
      buildListingWhere(
        query({
          categoryId,
          condition: ListingCondition.LIKE_NEW,
          maxPrice: '999.99',
          minPrice: '100.00',
        }),
      ),
      {
        category: 'Books & Study Material',
        condition: ListingCondition.LIKE_NEW,
        moderationVisibility: ModerationVisibility.VISIBLE,
        price: { gte: '100.00', lte: '999.99' },
        seller: { status: AccountStatus.ACTIVE },
        status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLD] },
      },
    );
  });

  void it('excludes a bounded set from both rows and counts without changing other filters', () => {
    const excluded = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ];
    assert.deepEqual(
      buildListingWhere(query({ excludeIds: excluded, status: ListingStatus.ACTIVE })),
      {
        id: { notIn: excluded },
        moderationVisibility: ModerationVisibility.VISIBLE,
        seller: { status: AccountStatus.ACTIVE },
        status: ListingStatus.ACTIVE,
      },
    );
    assert.deepEqual(parseListingQuery({ excludeIds: excluded.join(',') }).excludeIds, excluded);
  });

  void it('uses allowlisted deterministic ordering for every supported sort', () => {
    assert.deepEqual(getListingOrderBy('newest'), [{ createdAt: 'desc' }, { id: 'desc' }]);
    assert.deepEqual(getListingOrderBy('price_asc'), [{ price: 'asc' }, { id: 'desc' }]);
    assert.deepEqual(getListingOrderBy('price_desc'), [{ price: 'desc' }, { id: 'desc' }]);
  });

  void it('normalizes whitespace search and decimal bounds without floating-point comparison', () => {
    assert.deepEqual(parseListingQuery({ search: '   ' }), {
      limit: 12,
      page: 1,
      sort: 'newest',
    });
    assert.deepEqual(parseListingQuery({ maxPrice: '900.1', minPrice: '000100' }), {
      limit: 12,
      maxPrice: '900.10',
      minPrice: '100.00',
      page: 1,
      sort: 'newest',
    });
  });

  void it('rejects negative or inverted price ranges and archived status discovery', () => {
    for (const invalid of [
      { minPrice: '-0.01' },
      { maxPrice: '1.00', minPrice: '2.00' },
      { status: 'ARCHIVED' },
    ]) {
      assert.throws(() => parseListingQuery(invalid), { name: 'ValidationError' });
    }
  });

  void it('rejects malformed, repeated, duplicate, or excessive exclusion IDs', () => {
    const valid = '11111111-1111-4111-8111-111111111111';
    for (const invalid of [
      { excludeIds: 'not-a-uuid' },
      { excludeIds: `${valid},${valid}` },
      { excludeIds: [valid, valid] },
      {
        excludeIds: [1, 2, 3, 4, 5]
          .map((value) => `${value}1111111-1111-4111-8111-111111111111`)
          .join(','),
      },
    ])
      assert.throws(() => parseListingQuery(invalid), { name: 'ValidationError' });
  });
});
