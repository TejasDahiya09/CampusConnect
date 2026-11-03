import { Router, type RequestHandler } from 'express';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import {
  marketplaceController,
  myListingsController,
  marketplaceRecommendationsController,
} from './marketplace.controller.js';

interface MarketplaceRouterDependencies {
  readonly controller: typeof marketplaceController;
  readonly optionalAuth: RequestHandler;
  readonly requireAuth: RequestHandler;
}

export const createMarketplaceRouter = ({
  controller,
  optionalAuth,
  requireAuth,
}: MarketplaceRouterDependencies) => {
  const router = Router();
  router.get('/categories', controller.listCategories);
  router.get('/bookmarks', requireAuth, controller.listBookmarks);
  router.get('/my-listings', requireAuth, myListingsController);
  router.get('/recommendations', requireAuth, marketplaceRecommendationsController);
  router.get('/listings', optionalAuth, controller.listListings);
  router.get('/listings/:id', optionalAuth, controller.getListing);
  router.post('/listings/:id/view', requireAuth, controller.recordListingView);
  router.get('/listings/:id/bookmark', requireAuth, controller.getBookmarkState);
  router.post('/listings', requireAuth, controller.createListing);
  router.post('/listings/:id/bookmark', requireAuth, controller.addBookmark);
  router.post('/listings/:id/media/upload-url', requireAuth, controller.authorizeMediaUpload);
  router.post('/listings/:id/media/:mediaId/complete', requireAuth, controller.completeMediaUpload);
  router.patch('/listings/:id/media/order', requireAuth, controller.reorderMedia);
  router.delete('/listings/:id/media/:mediaId', requireAuth, controller.deleteMedia);
  router.delete('/listings/:id/bookmark', requireAuth, controller.removeBookmark);
  router.patch('/listings/:id', requireAuth, controller.updateListing);
  router.delete('/listings/:id', requireAuth, controller.deleteListing);
  return router;
};

export const marketplaceRouter = createMarketplaceRouter({
  controller: marketplaceController,
  optionalAuth: authenticationMiddleware.optionalAuth,
  requireAuth: authenticationMiddleware.requireAuth,
});
