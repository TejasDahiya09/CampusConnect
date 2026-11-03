import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express, { type RequestHandler } from 'express';
import {
  AccountStatus,
  ListingCondition,
  ListingStatus,
  UserRole,
} from '../src/generated/prisma/client.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createMarketplaceController } from '../src/modules/marketplace/marketplace.controller.js';
import { createMarketplaceRouter } from '../src/modules/marketplace/marketplace.routes.js';
import type { MarketplaceService } from '../src/modules/marketplace/marketplace.service.js';
import type {
  ListingQuery,
  MarketplaceListingView,
} from '../src/modules/marketplace/marketplace.types.js';
import type { MarketplaceViewService } from '../src/modules/marketplace/marketplace-view.service.js';
import { withTestServer } from './helpers/test-server.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const listingId = '33333333-3333-4333-8333-333333333333';
const categoryId = 'books-study-material';
const listing: MarketplaceListingView = {
  category: { id: categoryId, name: 'Books', parentId: null, slug: 'books' },
  condition: ListingCondition.GOOD,
  createdAt: '2026-09-01T00:00:00.000Z',
  currency: 'INR',
  description: 'A detailed listing description.',
  id: listingId,
  isBookmarked: false,
  location: null,
  media: [],
  price: '500.00',
  seller: { avatar: null, department: null, displayName: 'Student', id: ownerId },
  sellerId: ownerId,
  soldAt: null,
  status: ListingStatus.ACTIVE,
  title: 'Engineering textbook',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const createService = (overrides: Partial<MarketplaceService> = {}): MarketplaceService => ({
  createListing: () => Promise.resolve(listing),
  deleteListing: () => Promise.resolve(),
  getListing: () => Promise.resolve(listing),
  listCategories: () => Promise.resolve([listing.category]),
  listListings: () =>
    Promise.resolve({ items: [listing], limit: 12, page: 1, total: 1, totalPages: 1 }),
  updateListing: () => Promise.resolve(listing),
  ...overrides,
});

const createApp = (
  authenticated: boolean,
  service: MarketplaceService,
  viewService: MarketplaceViewService = { record: () => Promise.resolve(true) },
) => {
  const app = express();
  app.use(express.json());
  const optionalAuth: RequestHandler = (_request, _response, next) => next();
  const requireAuth: RequestHandler = (request, response, next) => {
    if (!authenticated) {
      response.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED' }, success: false });
      return;
    }
    request.auth = {
      identity: { email: 'student@university.edu', emailVerified: true, id: ownerId, metadata: {} },
      user: {
        email: 'student@university.edu',
        emailVerifiedAt: new Date(),
        id: ownerId,
        profile: { displayName: 'Student', id: '55555555-5555-4555-8555-555555555555' },
        role: UserRole.STUDENT,
        status: AccountStatus.ACTIVE,
      },
    };
    next();
  };
  app.use(
    '/api/marketplace',
    createMarketplaceRouter({
      controller: createMarketplaceController(service, undefined, undefined, viewService),
      optionalAuth,
      requireAuth,
    }),
  );
  app.use(errorHandler);
  return app;
};

const validInput = {
  categoryId,
  condition: 'GOOD',
  currency: 'inr',
  description: 'A detailed listing description.',
  price: '500.00',
  title: 'Engineering textbook',
};
const readJson = <T>(response: Response): Promise<T> => response.json() as Promise<T>;

void describe('marketplace routes', () => {
  void it('records views only through authenticated identity and tolerates persistence failure', async () => {
    let actor: string | undefined;
    let viewedListing: string | undefined;
    const viewService: MarketplaceViewService = {
      record: (userId, id) => {
        actor = userId;
        viewedListing = id;
        return Promise.reject(new Error('simulated activity failure'));
      },
    };
    await withTestServer(createApp(true, createService(), viewService), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/marketplace/listings/${listingId}/view`, {
        method: 'POST',
      });
      assert.equal(response.status, 200);
      assert.equal(actor, ownerId);
      assert.equal(viewedListing, listingId);
    });
  });

  void it('rejects anonymous personalized view recording', async () => {
    let calls = 0;
    await withTestServer(
      createApp(false, createService(), {
        record: () => {
          calls += 1;
          return Promise.resolve(true);
        },
      }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/marketplace/listings/${listingId}/view`, {
          method: 'POST',
        });
        assert.equal(response.status, 401);
        assert.equal(calls, 0);
      },
    );
  });

  void it('rejects unauthenticated listing creation', async () => {
    await withTestServer(createApp(false, createService()), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/marketplace/listings`, {
        body: JSON.stringify(validInput),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(response.status, 401);
    });
  });

  void it('creates a listing with the authenticated seller identity', async () => {
    let sellerId: string | undefined;
    await withTestServer(
      createApp(
        true,
        createService({
          createListing: (id) => {
            sellerId = id;
            return Promise.resolve(listing);
          },
        }),
      ),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/marketplace/listings`, {
          body: JSON.stringify(validInput),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        });
        assert.equal(response.status, 201);
        assert.equal(sellerId, ownerId);
      },
    );
  });

  for (const [name, patch] of [
    ['title', { title: '' }],
    ['price', { price: '-1' }],
    ['condition', { condition: 'BROKEN' }],
    ['status', { status: 'REMOVED' }],
  ] as const) {
    void it(`rejects invalid ${name}`, async () => {
      await withTestServer(createApp(true, createService()), async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/marketplace/listings`, {
          body: JSON.stringify({ ...validInput, ...patch }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        });
        assert.equal(response.status, 400);
      });
    });
  }

  void it('rejects client ownership fields and non-active creation states', async () => {
    await withTestServer(createApp(true, createService()), async (baseUrl) => {
      for (const input of [
        { ...validInput, sellerId: ownerId },
        { ...validInput, status: 'SOLD' },
      ]) {
        const response = await fetch(`${baseUrl}/api/marketplace/listings`, {
          body: JSON.stringify(input),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        });
        assert.equal(response.status, 400);
      }
    });
  });

  void it('retrieves a listing without private seller fields', async () => {
    await withTestServer(createApp(false, createService()), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/marketplace/listings/${listingId}`);
      const body = await readJson<{ data: { listing: MarketplaceListingView } }>(response);
      assert.equal(response.status, 200);
      assert.equal(body.data.listing.id, listingId);
      assert.equal('email' in body.data.listing.seller, false);
      assert.equal('role' in body.data.listing.seller, false);
    });
  });

  void it('returns active categories', async () => {
    await withTestServer(createApp(false, createService()), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/marketplace/categories`);
      const body = await readJson<{ data: { categories: readonly { id: string }[] } }>(response);
      assert.equal(response.status, 200);
      assert.equal(body.data.categories[0]?.id, categoryId);
    });
  });

  void it('parses search, category, condition, price, status, sorting, and pagination filters', async () => {
    let received: ListingQuery | undefined;
    const service = createService({
      listListings: (query) => {
        received = query;
        return Promise.resolve({
          items: [],
          limit: query.limit,
          page: query.page,
          total: 0,
          totalPages: 0,
        });
      },
    });
    await withTestServer(createApp(false, service), async (baseUrl) => {
      const query = new URLSearchParams({
        categoryId,
        condition: 'GOOD',
        search: 'book',
        limit: '50',
        maxPrice: '900',
        minPrice: '100',
        page: '2',
        sort: 'price_desc',
        status: 'ACTIVE',
      });
      const response = await fetch(`${baseUrl}/api/marketplace/listings?${query}`);
      assert.equal(response.status, 200);
      assert.deepEqual(received, {
        categoryId,
        condition: ListingCondition.GOOD,
        search: 'book',
        limit: 50,
        maxPrice: '900.00',
        minPrice: '100.00',
        page: 2,
        sort: 'price_desc',
        status: ListingStatus.ACTIVE,
      });
    });
  });

  void it('normalizes empty search and supports legacy discovery parameter names', async () => {
    const received: ListingQuery[] = [];
    const service = createService({
      listListings: (query) => {
        received.push(query);
        return Promise.resolve({
          items: [],
          limit: query.limit,
          page: query.page,
          total: 0,
          totalPages: 0,
        });
      },
    });
    await withTestServer(createApp(false, service), async (baseUrl) => {
      const emptyResponse = await fetch(`${baseUrl}/api/marketplace/listings?search=%20%20%20`);
      const legacyResponse = await fetch(
        `${baseUrl}/api/marketplace/listings?keyword=book&minimumPrice=10&maximumPrice=20`,
      );
      assert.equal(emptyResponse.status, 200);
      assert.equal(legacyResponse.status, 200);
      assert.deepEqual(received[0], { limit: 12, page: 1, sort: 'newest' });
      assert.deepEqual(received[1], {
        limit: 12,
        maxPrice: '20.00',
        minPrice: '10.00',
        page: 1,
        search: 'book',
        sort: 'newest',
      });
    });
  });

  void it('rejects malformed, repeated, oversized, and unsupported discovery parameters', async () => {
    await withTestServer(createApp(false, createService()), async (baseUrl) => {
      const cases = [
        'categoryId=not-a-category',
        'condition=BROKEN',
        'minPrice=-1',
        'minPrice=20&maxPrice=10',
        `search=${'x'.repeat(101)}`,
        'sort=title_desc',
        'sort=price_desc&sort=newest',
        'orderBy=price',
        'page=0',
      ];
      for (const query of cases) {
        const response = await fetch(`${baseUrl}/api/marketplace/listings?${query}`);
        assert.equal(response.status, 400, query);
      }
    });
  });

  void it('enforces the maximum page size', async () => {
    await withTestServer(createApp(false, createService()), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/marketplace/listings?limit=51`);
      assert.equal(response.status, 400);
    });
  });
});
