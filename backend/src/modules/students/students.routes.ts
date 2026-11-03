import { Router, type Request } from 'express';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../utils/api-response.js';
import { studentsService } from './students.service.js';

export const studentsRouter = Router();
const authenticatedUserId = (request: Request): string => {
  if (request.auth === undefined) {
    throw new Error('Authentication middleware did not attach an application user.');
  }
  return request.auth.user.id;
};
studentsRouter.use(authenticationMiddleware.requireAuth);
studentsRouter.get('/discover', async (request, response) => {
  const result = await studentsService.discover(authenticatedUserId(request), request.query);
  return sendSuccess(
    response,
    { students: result.students },
    {
      meta: {
        limit: result.pagination.limit,
        page: result.pagination.page,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages,
      },
    },
  );
});
studentsRouter.get('/recommendations', async (request, response) =>
  sendSuccess(response, {
    projects: await studentsService.recommendedProjects(authenticatedUserId(request)),
  }),
);
