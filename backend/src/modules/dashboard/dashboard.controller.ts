import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { dashboardService } from './dashboard.service.js';

export const dashboardController = {
  get: (async (request, response) => {
    if (!request.auth) throw new Error('Authentication unavailable.');
    sendSuccess(response, await dashboardService.get(request.auth.user.id));
  }) satisfies RequestHandler,
};
