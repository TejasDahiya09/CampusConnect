import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ListingCondition, ListingStatus } from '../src/generated/prisma/client.js';
import type { MarketplaceBookmarkRepository } from '../src/modules/marketplace/marketplace-bookmark.repository.js';
import { createMarketplaceBookmarkService } from '../src/modules/marketplace/marketplace-bookmark.service.js';
import {
  parseBookmarkBody,
  parseBookmarkQuery,
} from '../src/modules/marketplace/marketplace-bookmark.validation.js';
import type { MarketplaceListingView } from '../src/modules/marketplace/marketplace.types.js';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const listingId = '33333333-3333-4333-8333-333333333333';

const listing: MarketplaceListingView = {
  category: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Books',
    parentId: null,
    slug: 'books',
  },
  condition: ListingCondition.GOOD,
  createdAt: '2026-09-01T00:00:00.000Z',
  currency: 'INR',
  description: 'A safe public listing.',
  id: listingId,
  isBookmarked: true,
  location: null,
  media: [],
  price: '500.00',
  seller: { avatar: null, department: null, displayName: 'Student', id: otherUserId },
  sellerId: otherUserId,
  soldAt: null,
  status: ListingStatus.ACTIVE,
  title: 'Textbook',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const createRepository = (
  overrides: Partial<MarketplaceBookmarkRepository> = {},
): MarketplaceBookmarkRepository => ({
  getState: () => Promise.resolve(false),
  list: () => Promise.resolve({ items: [listing], total: 1 }),
  remove: () => Promise.resolve(false),
  save: () => Promise.resolve(true),
  ...overrides,
});

const expectCode = (code: string) => (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === code;

void describe('Marketplace bookmarks', () => {
  void it('saves an eligible listing for the authenticated user and tolerates duplicates', async () => {
    const bookmarks = new Set<string>();
    const repository = createRepository({
      save: (ownerId, targetId) => {
        bookmarks.add(`${ownerId}:${targetId}`);
        return Promise.resolve(true);
      },
    });
    const service = createMarketplaceBookmarkService(repository);

    await service.save(userId, listingId);
    await service.save(userId, listingId);

    assert.deepEqual([...bookmarks], [`${userId}:${listingId}`]);
  });

  void it('rejects missing or inaccessible listings', async () => {
    const service = createMarketplaceBookmarkService(
      createRepository({
        getState: () => Promise.resolve(null),
        save: () => Promise.resolve(false),
      }),
    );
    await assert.rejects(service.save(userId, listingId), expectCode('LISTING_NOT_FOUND'));
    await assert.rejects(service.getState(userId, listingId), expectCode('LISTING_NOT_FOUND'));
  });

  void it('returns only the authenticated user bookmark state', async () => {
    let receivedUserId: string | undefined;
    const service = createMarketplaceBookmarkService(
      createRepository({
        getState: (ownerId) => {
          receivedUserId = ownerId;
          return Promise.resolve(true);
        },
      }),
    );
    assert.equal(await service.getState(userId, listingId), true);
    assert.equal(receivedUserId, userId);
  });

  void it('removes only the authenticated user bookmark and remains idempotent', async () => {
    const bookmarks = new Set([`${userId}:${listingId}`, `${otherUserId}:${listingId}`]);
    const service = createMarketplaceBookmarkService(
      createRepository({
        remove: (ownerId, targetId) => Promise.resolve(bookmarks.delete(`${ownerId}:${targetId}`)),
      }),
    );

    assert.equal(await service.remove(userId, listingId), true);
    assert.equal(await service.remove(userId, listingId), false);
    assert.equal(bookmarks.has(`${otherUserId}:${listingId}`), true);
  });

  void it('returns safe paginated saved listings for the authenticated user', async () => {
    let receivedUserId: string | undefined;
    const service = createMarketplaceBookmarkService(
      createRepository({
        list: (ownerId) => {
          receivedUserId = ownerId;
          return Promise.resolve({ items: [listing], total: 13 });
        },
      }),
    );

    const result = await service.list(userId, { limit: 12, page: 2 });
    assert.equal(receivedUserId, userId);
    assert.equal(result.totalPages, 2);
    assert.equal(result.items[0]?.seller.id, otherUserId);
    assert.equal('email' in (result.items[0]?.seller ?? {}), false);
  });

  void it('rejects client ownership fields and invalid pagination', () => {
    assert.throws(() => parseBookmarkBody({ userId: otherUserId }), expectCode('VALIDATION_ERROR'));
    assert.throws(
      () => parseBookmarkBody({ ownerId: otherUserId }),
      expectCode('VALIDATION_ERROR'),
    );
    assert.throws(() => parseBookmarkQuery({ limit: '51' }), expectCode('VALIDATION_ERROR'));
    assert.throws(() => parseBookmarkQuery({ page: '0' }), expectCode('VALIDATION_ERROR'));
    assert.deepEqual(parseBookmarkQuery({ limit: '10', page: '2' }), { limit: 10, page: 2 });
  });
});
