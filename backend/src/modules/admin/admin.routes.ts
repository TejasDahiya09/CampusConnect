import { Router, type Request } from 'express';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../utils/api-response.js';
import { notificationId } from '../notifications/notifications.validation.js';
import { requireDesignatedAdmin } from './admin.middleware.js';
import { adminService } from './admin.service.js';
import {
  parseAccountDecision,
  parseAdminAuditQuery,
  parseAdminContentQuery,
  parseAdminUserQuery,
  parseEnforcementDecision,
  parseEnforcementTargetType,
} from './admin.validation.js';

const actor = (request: Request) => {
  if (!request.auth) throw new Error('Admin authentication was not attached.');
  return request.auth.user.id;
};

export const adminRouter = Router();
adminRouter.use(authenticationMiddleware.requireAuth, requireDesignatedAdmin);
adminRouter.get('/access', (_request, response) => sendSuccess(response, adminService.access()));
adminRouter.get('/overview', async (_request, response) =>
  sendSuccess(response, await adminService.overview()),
);
adminRouter.get('/users', async (request, response) =>
  sendSuccess(response, await adminService.users(parseAdminUserQuery(request.query))),
);
adminRouter.get('/users/:id', async (request, response) =>
  sendSuccess(response, await adminService.userDetail(notificationId(request.params.id))),
);
adminRouter.patch('/users/:id/status', async (request, response) =>
  sendSuccess(
    response,
    await adminService.updateAccount(
      actor(request),
      notificationId(request.params.id),
      parseAccountDecision(request.body),
    ),
  ),
);
adminRouter.get('/content', async (request, response) =>
  sendSuccess(response, await adminService.content(parseAdminContentQuery(request.query))),
);
adminRouter.get('/audit', async (request, response) =>
  sendSuccess(response, await adminService.audit(parseAdminAuditQuery(request.query))),
);
adminRouter.get('/system', async (_request, response) =>
  sendSuccess(response, await adminService.system()),
);
adminRouter.post('/content/:type/:id/hide', async (request, response) =>
  sendSuccess(
    response,
    await adminService.enforceContent(
      actor(request),
      parseEnforcementTargetType(request.params.type),
      notificationId(request.params.id),
      parseEnforcementDecision(request.body, 'HIDDEN'),
    ),
  ),
);
adminRouter.post('/content/:type/:id/restore', async (request, response) =>
  sendSuccess(
    response,
    await adminService.enforceContent(
      actor(request),
      parseEnforcementTargetType(request.params.type),
      notificationId(request.params.id),
      parseEnforcementDecision(request.body, 'VISIBLE'),
    ),
  ),
);
adminRouter.get('/content/:type/:id/history', async (request, response) =>
  sendSuccess(
    response,
    await adminService.enforcementHistory(
      parseEnforcementTargetType(request.params.type),
      notificationId(request.params.id),
    ),
  ),
);
