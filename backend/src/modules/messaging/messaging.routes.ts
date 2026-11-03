import { Router } from 'express';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { messagingController } from './messaging.controller.js';

import { createMessagingRateLimit } from './messaging-rate-limit.js';

export const createMessagingRouter = ({ authentication = authenticationMiddleware } = {}) => {
  const router = Router();
  const limit = createMessagingRateLimit();
  router.use(authentication.requireAuth);
  router.get('/', limit('inbox'), messagingController.list);
  router.post('/conversations', limit('open'), messagingController.open);
  router.get('/:id/updates', limit('recovery'), messagingController.updates);
  router.get('/:id', limit('history'), messagingController.history);
  router.post('/:id', limit('send'), messagingController.send);
  router.patch('/:id/read', limit('read'), messagingController.markRead);
  return router;
};
export const messagingRouter = createMessagingRouter();
