import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { homeService } from './home.service.js';
export const homeController = {
  get: (async (request, response) => {
    if (!request.auth) throw new Error('Authentication unavailable.');
    sendSuccess(response, await homeService.get(request.auth.user.id));
  }) satisfies RequestHandler,
};
