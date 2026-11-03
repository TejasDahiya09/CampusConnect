import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import {
  landingHighlightsService,
  type LandingHighlightsService,
} from './landing-highlights.service.js';
import { parseLandingHighlightsQuery } from './landing-highlights.validation.js';

export const createLandingHighlightsController = (
  service: LandingHighlightsService = landingHighlightsService,
) =>
  (async (request, response) => {
    response.set('Cache-Control', 'no-store');
    const highlights = await service.list(parseLandingHighlightsQuery(request.query));
    return sendSuccess(response, { highlights });
  }) satisfies RequestHandler;

export const landingHighlightsController = createLandingHighlightsController();
