import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ListingCondition, ListingStatus } from '../src/generated/prisma/client.js';
import type { MarketplaceRepository } from '../src/modules/marketplace/marketplace.repository.js';
import { createMarketplaceService } from '../src/modules/marketplace/marketplace.service.js';
import type {
  ListingCreateInput,
  ListingQuery,
  MarketplaceListingView,
} from '../src/modules/marketplace/marketplace.types.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const listingId = '33333333-3333-4333-8333-333333333333';
const categoryId = 'books-study-material';

const listing = (overrides: Partial<MarketplaceListingView> = {}): MarketplaceListingView => ({
  category: { id: categoryId, name: 'Books', parentId: null, slug: 'books' },
  condition: ListingCondition.GOOD,
  createdAt: '2026-09-01T00:00:00.000Z',
  currency: 'INR',
  description: 'A well-kept textbook for the current semester.',
  id: listingId,
  isBookmarked: false,
  location: 'Library gate',
  media: [],
  price: '500.00',
  seller: { avatar: null, department: null, displayName: 'Student Seller', id: ownerId },
  sellerId: ownerId,
  soldAt: null,
  status: ListingStatus.ACTIVE,
  title: 'Engineering textbook',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

const createInput: ListingCreateInput = {
  categoryId,
  condition: ListingCondition.GOOD,
  currency: 'INR',
  description: 'A well-kept textbook for the current semester.',
  location: null,
  price: '500.00',
  status: ListingStatus.ACTIVE,
  title: 'Engineering textbook',
};

const defaultQuery: ListingQuery = { limit: 12, page: 1, sort: 'newest' };

const createRepository = (
  overrides: Partial<MarketplaceRepository> = {},
): MarketplaceRepository => ({
  create: () => Promise.resolve(listing()),
  deleteOwned: () => Promise.resolve(true),
  findById: () => Promise.resolve(listing()),
  isActiveCategory: () => Promise.resolve(true),
  list: () => Promise.resolve({ items: [listing()], total: 1 }),
  listCategories: () =>
    Promise.resolve([{ id: categoryId, name: 'Books', parentId: null, slug: 'books' }]),
  updateOwned: () => Promise.resolve(listing()),
  ...overrides,
});

void describe('marketplace service', () => {
  void it('creates a listing for the authenticated seller', async () => {
    let seller: string | undefined;
    const service = createMarketplaceService(
      createRepository({
        create: (sellerId) => {
          seller = sellerId;
          return Promise.resolve(listing());
        },
      }),
    );
    await service.createListing(ownerId, createInput);
    assert.equal(seller, ownerId);
  });

  void it('rejects an inactive or missing category', async () => {
    const service = createMarketplaceService(
      createRepository({ isActiveCategory: () => Promise.resolve(false) }),
    );
    await assert.rejects(
      service.createListing(ownerId, createInput),
      (error: unknown) =>
        error instanceof Error && 'code' in error && error.code === 'INVALID_MARKETPLACE_CATEGORY',
    );
  });

  void it('retrieves a listing and returns not found for an absent listing', async () => {
    assert.equal(
      (await createMarketplaceService(createRepository()).getListing(listingId)).id,
      listingId,
    );
    await assert.rejects(
      createMarketplaceService(
        createRepository({ findById: () => Promise.resolve(null) }),
      ).getListing(listingId),
      (error: unknown) =>
        error instanceof Error && 'code' in error && error.code === 'LISTING_NOT_FOUND',
    );
  });

  void it('updates a listing owned by the authenticated student', async () => {
    let updated = false;
    const service = createMarketplaceService(
      createRepository({
        updateOwned: (id, sellerId) => {
          updated = id === listingId && sellerId === ownerId;
          return Promise.resolve(listing({ title: 'Updated title' }));
        },
      }),
    );
    assert.equal(
      (await service.updateListing(ownerId, listingId, { title: 'Updated title' })).title,
      'Updated title',
    );
    assert.equal(updated, true);
  });

  void it('forbids update and deletion by another student', async () => {
    const service = createMarketplaceService(createRepository());
    await assert.rejects(
      service.updateListing(otherId, listingId, { title: 'Stolen title' }),
      (error: unknown) =>
        error instanceof Error && 'code' in error && error.code === 'LISTING_FORBIDDEN',
    );
    await assert.rejects(
      service.deleteListing(otherId, listingId),
      (error: unknown) =>
        error instanceof Error && 'code' in error && error.code === 'LISTING_FORBIDDEN',
    );
  });

  void it('deletes a listing owned by the authenticated student', async () => {
    let deleted = false;
    const service = createMarketplaceService(
      createRepository({
        deleteOwned: (id, sellerId) => {
          deleted = id === listingId && sellerId === ownerId;
          return Promise.resolve(deleted);
        },
      }),
    );
    await service.deleteListing(ownerId, listingId);
    assert.equal(deleted, true);
  });

  void it('marks an active listing as sold and records soldAt', async () => {
    let hasSoldAt = false;
    const service = createMarketplaceService(
      createRepository({
        updateOwned: (_id, _sellerId, input) => {
          hasSoldAt = input.status === ListingStatus.SOLD && input.soldAt instanceof Date;
          return Promise.resolve(
            listing({ soldAt: '2026-09-01T01:00:00.000Z', status: ListingStatus.SOLD }),
          );
        },
      }),
    );
    const result = await service.updateListing(ownerId, listingId, { status: ListingStatus.SOLD });
    assert.equal(result.status, ListingStatus.SOLD);
    assert.equal(hasSoldAt, true);
  });

  void it('archives a sold listing and clears soldAt for database consistency', async () => {
    let clearsSoldAt = false;
    const service = createMarketplaceService(
      createRepository({
        findById: () =>
          Promise.resolve(
            listing({ soldAt: '2026-09-01T01:00:00.000Z', status: ListingStatus.SOLD }),
          ),
        updateOwned: (_id, _sellerId, input) => {
          clearsSoldAt = input.status === ListingStatus.ARCHIVED && input.soldAt === null;
          return Promise.resolve(listing({ status: ListingStatus.ARCHIVED }));
        },
      }),
    );

    const result = await service.updateListing(ownerId, listingId, {
      status: ListingStatus.ARCHIVED,
    });
    assert.equal(result.status, ListingStatus.ARCHIVED);
    assert.equal(clearsSoldAt, true);
  });

  void it('prevents invalid lifecycle transitions and edits after sale', async () => {
    const soldService = createMarketplaceService(
      createRepository({
        findById: () => Promise.resolve(listing({ status: ListingStatus.SOLD })),
      }),
    );
    await assert.rejects(
      soldService.updateListing(ownerId, listingId, { status: ListingStatus.ACTIVE }),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'INVALID_LISTING_STATUS_TRANSITION',
    );
    await assert.rejects(
      soldService.updateListing(ownerId, listingId, { title: 'Changed after sale' }),
      (error: unknown) =>
        error instanceof Error && 'code' in error && error.code === 'LISTING_NOT_EDITABLE',
    );
  });

  void it('returns predictable pagination metadata', async () => {
    const service = createMarketplaceService(
      createRepository({ list: () => Promise.resolve({ items: [listing()], total: 26 }) }),
    );
    const result = await service.listListings({ ...defaultQuery, limit: 10, page: 2 });
    assert.deepEqual(
      {
        limit: result.limit,
        page: result.page,
        total: result.total,
        totalPages: result.totalPages,
      },
      { limit: 10, page: 2, total: 26, totalPages: 3 },
    );
  });

  void it('rejects an inactive or missing discovery category before querying listings', async () => {
    let listCalled = false;
    const service = createMarketplaceService(
      createRepository({
        isActiveCategory: () => Promise.resolve(false),
        list: () => {
          listCalled = true;
          return Promise.resolve({ items: [], total: 0 });
        },
      }),
    );
    await assert.rejects(
      service.listListings({ ...defaultQuery, categoryId }),
      (error: unknown) =>
        error instanceof Error && 'code' in error && error.code === 'INVALID_MARKETPLACE_CATEGORY',
    );
    assert.equal(listCalled, false);
  });

  void it('returns only public seller fields', async () => {
    const result = await createMarketplaceService(createRepository()).getListing(listingId);
    assert.equal('email' in result.seller, false);
    assert.equal('role' in result.seller, false);
    assert.equal('status' in result.seller, false);
  });
});
