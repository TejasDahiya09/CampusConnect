import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express, { type RequestHandler } from 'express';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createMarketplaceController } from '../src/modules/marketplace/marketplace.controller.js';
import { createMarketplaceRouter } from '../src/modules/marketplace/marketplace.routes.js';
import type { MarketplaceMediaService } from '../src/modules/marketplace/marketplace-media.service.js';
import type { MarketplaceService } from '../src/modules/marketplace/marketplace.service.js';
import { withTestServer } from './helpers/test-server.js';

const listingId = '33333333-3333-4333-8333-333333333333';
const service = {
  createListing: () => Promise.reject(new Error()),
  deleteListing: () => Promise.resolve(),
  getListing: () => Promise.reject(new Error()),
  listCategories: () => Promise.resolve([]),
  listListings: () => Promise.resolve({ items: [], limit: 12, page: 1, total: 0, totalPages: 0 }),
  updateListing: () => Promise.reject(new Error()),
} satisfies MarketplaceService;
const mediaService = {
  authorizeUpload: () =>
    Promise.resolve({
      expiresAt: new Date().toISOString(),
      mediaId: listingId,
      objectKey: 'safe-key',
      requiredHeaders: {},
      uploadUrl: 'https://s3.example/signed',
    }),
  completeUpload: () => Promise.reject(new Error()),
  deleteMedia: () => Promise.resolve(),
  reorderMedia: () => Promise.resolve([]),
} satisfies MarketplaceMediaService;

const app = express();
app.use(express.json());
const requireAuth: RequestHandler = (_request, response) => {
  response.status(401).json({ success: false, error: { code: 'AUTHENTICATION_REQUIRED' } });
};
app.use(
  '/api/marketplace',
  createMarketplaceRouter({
    controller: createMarketplaceController(service, mediaService),
    optionalAuth: (_request, _response, next) => next(),
    requireAuth,
  }),
);
app.use(errorHandler);

void describe('Marketplace media routes', () => {
  void it('rejects an unauthenticated upload URL request', async () => {
    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/marketplace/listings/${listingId}/media/upload-url`,
        {
          body: JSON.stringify({ contentType: 'image/jpeg', fileName: 'photo.jpg', size: 1024 }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      assert.equal(response.status, 401);
    });
  });
});
