import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { settingsService } from './settings.service.js';

const userId = (request: Parameters<RequestHandler>[0]) => {
  if (!request.auth) throw new Error('Authentication unavailable.');
  return request.auth.user.id;
};

export const settingsController = {
  account: (async (request, response) =>
    sendSuccess(response, await settingsService.account(userId(request)))) satisfies RequestHandler,
  deactivate: (async (request, response) =>
    sendSuccess(
      response,
      await settingsService.deactivate(userId(request)),
    )) satisfies RequestHandler,
};
