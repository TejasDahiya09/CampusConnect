import { Router, type Request } from 'express';
import { UserRole } from '../../generated/prisma/client.js';
import { authenticationMiddleware, requireRole } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../utils/api-response.js';
import { notificationId } from '../notifications/notifications.validation.js';
import { moderationService } from './moderation.service.js';
import {
  parseModerationDecision,
  parseModerationQuery,
  parseReportSubmission,
} from './moderation.validation.js';

const auth = (request: Request) => {
  if (!request.auth) throw new Error('Authentication middleware did not attach a user.');
  return request.auth.user;
};
export const moderationRouter = Router();
moderationRouter.use(authenticationMiddleware.requireAuth);
moderationRouter.post('/reports', async (request, response) =>
  sendSuccess(
    response,
    await moderationService.submit(auth(request).id, parseReportSubmission(request.body)),
    { statusCode: 201 },
  ),
);
moderationRouter.use(requireRole(UserRole.MODERATOR, UserRole.ADMIN));
moderationRouter.get('/overview', async (_request, response) =>
  sendSuccess(response, await moderationService.overview()),
);
moderationRouter.get('/reports', async (request, response) =>
  sendSuccess(response, await moderationService.list(parseModerationQuery(request.query))),
);
moderationRouter.get('/reports/:id', async (request, response) =>
  sendSuccess(response, await moderationService.detail(notificationId(request.params.id))),
);
moderationRouter.patch('/reports/:id', async (request, response) =>
  sendSuccess(
    response,
    await moderationService.decide(
      auth(request),
      notificationId(request.params.id),
      parseModerationDecision(request.body),
    ),
  ),
);
