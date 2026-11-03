import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express, { type RequestHandler } from 'express';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import type { MarketplaceBookmarkService } from '../src/modules/marketplace/marketplace-bookmark.service.js';
import { createMarketplaceController } from '../src/modules/marketplace/marketplace.controller.js';
import { createMarketplaceRouter } from '../src/modules/marketplace/marketplace.routes.js';
import type { MarketplaceService } from '../src/modules/marketplace/marketplace.service.js';
import { withTestServer } from './helpers/test-server.js';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const listingId = '33333333-3333-4333-8333-333333333333';

const marketplaceService = {
  createListing: () => Promise.reject(new Error()),
  deleteListing: () => Promise.resolve(),
  getListing: () => Promise.reject(new Error()),
  listCategories: () => Promise.resolve([]),
  listListings: () => Promise.resolve({ items: [], limit: 12, page: 1, total: 0, totalPages: 0 }),
  updateListing: () => Promise.reject(new Error()),
} satisfies MarketplaceService;

const createBookmarkService = (
  overrides: Partial<MarketplaceBookmarkService> = {},
): MarketplaceBookmarkService => ({
  getState: () => Promise.resolve(true),
  list: () => Promise.resolve({ items: [], limit: 12, page: 1, total: 0, totalPages: 0 }),
  remove: () => Promise.resolve(false),
  save: () => Promise.resolve(),
  ...overrides,
});

const createApp = (authenticated: boolean, bookmarkService: MarketplaceBookmarkService) => {
  const app = express();
  app.use(express.json());
  const optionalAuth: RequestHandler = (_request, _response, next) => next();
  const requireAuth: RequestHandler = (request, response, next) => {
    if (!authenticated) {
      response.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED' }, success: false });
      return;
    }
    request.auth = {
      identity: { email: 'student@university.edu', emailVerified: true, id: userId, metadata: {} },
      user: {
        email: 'student@university.edu',
        emailVerifiedAt: new Date(),
        id: userId,
        profile: null,
        role: UserRole.STUDENT,
        status: AccountStatus.ACTIVE,
      },
    };
    next();
  };
  app.use(
    '/api/marketplace',
    createMarketplaceRouter({
      controller: createMarketplaceController(marketplaceService, undefined, bookmarkService),
      optionalAuth,
      requireAuth,
    }),
  );
  app.use(errorHandler);
  return app;
};

void describe('Marketplace bookmark routes', () => {
  void it('rejects unauthenticated bookmark and saved-list requests', async () => {
    await withTestServer(createApp(false, createBookmarkService()), async (baseUrl) => {
      const save = await fetch(`${baseUrl}/api/marketplace/listings/${listingId}/bookmark`, {
        method: 'POST',
      });
      const list = await fetch(`${baseUrl}/api/marketplace/bookmarks`);
      assert.equal(save.status, 401);
      assert.equal(list.status, 401);
    });
  });

  void it('derives bookmark ownership from authentication and rejects client ownership', async () => {
    let receivedUserId: string | undefined;
    const app = createApp(
      true,
      createBookmarkService({
        save: (ownerId) => {
          receivedUserId = ownerId;
          return Promise.resolve();
        },
      }),
    );
    await withTestServer(app, async (baseUrl) => {
      const rejected = await fetch(`${baseUrl}/api/marketplace/listings/${listingId}/bookmark`, {
        body: JSON.stringify({ userId: otherUserId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(rejected.status, 400);

      const accepted = await fetch(`${baseUrl}/api/marketplace/listings/${listingId}/bookmark`, {
        method: 'POST',
      });
      assert.equal(accepted.status, 200);
      assert.equal(receivedUserId, userId);
    });
  });

  void it('returns state and paginated saved listings', async () => {
    await withTestServer(createApp(true, createBookmarkService()), async (baseUrl) => {
      const state = await fetch(`${baseUrl}/api/marketplace/listings/${listingId}/bookmark`);
      const list = await fetch(`${baseUrl}/api/marketplace/bookmarks?page=1&limit=12`);
      assert.equal(state.status, 200);
      assert.equal(list.status, 200);
      assert.equal(list.headers.get('content-type')?.startsWith('application/json'), true);
    });
  });
});
