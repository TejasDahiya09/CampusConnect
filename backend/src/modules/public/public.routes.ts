import { Router, type RequestHandler } from 'express';
import { landingHighlightsController } from './landing-highlights.controller.js';
import { createPublicHighlightsRateLimit } from './public-rate-limit.js';

interface PublicRouterDependencies {
  readonly landingHighlights?: RequestHandler;
  readonly rateLimit?: RequestHandler;
}

export const createPublicRouter = ({
  landingHighlights = landingHighlightsController,
  rateLimit = createPublicHighlightsRateLimit(),
}: PublicRouterDependencies = {}) => {
  const router = Router();
  router.get('/landing-highlights', rateLimit, landingHighlights);
  return router;
};

export const publicRouter = createPublicRouter();
