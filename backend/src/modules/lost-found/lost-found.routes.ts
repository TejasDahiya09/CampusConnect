import { Router, type RequestHandler } from 'express';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { lostFoundController } from './lost-found.controller.js';

interface LostFoundRouterDependencies {
  readonly controller: typeof lostFoundController;
  readonly optionalAuth: RequestHandler;
  readonly requireAuth: RequestHandler;
}

export const createLostFoundRouter = ({
  controller,
  optionalAuth,
  requireAuth,
}: LostFoundRouterDependencies) => {
  const router = Router();
  router.get('/bookmarks', requireAuth, controller.listBookmarks);
  router.get('/my-reports', requireAuth, controller.listMyReports);
  router.get('/reports', optionalAuth, controller.listReports);
  router.post('/reports', requireAuth, controller.createReport);
  router.post('/reports/:id/media/upload-url', requireAuth, controller.authorizeMediaUpload);
  router.post('/reports/:id/media/:mediaId/complete', requireAuth, controller.completeMediaUpload);
  router.patch('/reports/:id/media/order', requireAuth, controller.reorderMedia);
  router.delete('/reports/:id/media/:mediaId', requireAuth, controller.deleteMedia);
  router.get('/reports/:id/matches', requireAuth, controller.getMatches);
  router.get('/reports/:id', optionalAuth, controller.getReport);
  router.patch('/reports/:id', requireAuth, controller.updateReport);
  router.patch('/reports/:id/status', requireAuth, controller.transitionReport);
  router.get('/reports/:id/bookmark', requireAuth, controller.getBookmarkState);
  router.post('/reports/:id/bookmark', requireAuth, controller.addBookmark);
  router.delete('/reports/:id/bookmark', requireAuth, controller.removeBookmark);
  router.get('/reports/:id/claims', requireAuth, controller.listClaims);
  router.post('/reports/:id/claims', requireAuth, controller.submitClaim);
  router.patch('/reports/:id/claims/:claimId/review', requireAuth, controller.reviewClaim);
  router.patch('/reports/:id/claims/:claimId/cancel', requireAuth, controller.cancelClaim);
  return router;
};

export const lostFoundRouter = createLostFoundRouter({
  controller: lostFoundController,
  optionalAuth: authenticationMiddleware.optionalAuth,
  requireAuth: authenticationMiddleware.requireAuth,
});
