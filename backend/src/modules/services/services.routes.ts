import { Router } from 'express';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { servicesController } from './services.controller.js';
export const createServicesRouter = ({
  authentication = authenticationMiddleware,
  controller = servicesController,
} = {}) => {
  const servicesRouter = Router();
  servicesRouter.get('/', authentication.optionalAuth, controller.list);
  servicesRouter.post('/', authentication.requireAuth, controller.create);
  servicesRouter.get('/workspace', authentication.requireAuth, controller.workspace);
  servicesRouter.get('/:id', authentication.optionalAuth, controller.get);
  servicesRouter.patch('/:id', authentication.requireAuth, controller.update);
  servicesRouter.patch('/:id/status', authentication.requireAuth, controller.transition);
  servicesRouter.post('/:id/requests', authentication.requireAuth, controller.request);
  servicesRouter.patch(
    '/:id/requests/:requestId/review',
    authentication.requireAuth,
    controller.review,
  );
  servicesRouter.patch(
    '/:id/requests/:requestId/complete',
    authentication.requireAuth,
    controller.complete,
  );

  return servicesRouter;
};
export const servicesRouter = createServicesRouter();
