import { Router, type Request } from 'express';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { teamUpController } from './teamup.controller.js';
import { parseTeamUpId } from './teamup.validation.js';
import { studentsService } from '../students/students.service.js';
import { sendSuccess } from '../../utils/api-response.js';

export const createTeamUpRouter = ({
  authentication = authenticationMiddleware,
  controller = teamUpController,
  students = studentsService,
} = {}) => {
  const teamUpRouter = Router();
  const authenticatedUserId = (request: Request): string => {
    if (request.auth === undefined) {
      throw new Error('Authentication middleware did not attach an application user.');
    }
    return request.auth.user.id;
  };
  teamUpRouter.get('/projects', authentication.optionalAuth, controller.listProjects);
  teamUpRouter.post('/projects', authentication.requireAuth, controller.createProject);
  teamUpRouter.get('/workspace', authentication.requireAuth, controller.workspace);
  teamUpRouter.get('/recommended-projects', authentication.requireAuth, async (request, response) =>
    sendSuccess(response, {
      projects: await students.recommendedProjects(authenticatedUserId(request)),
    }),
  );
  teamUpRouter.get(
    '/projects/:id/recommended-students',
    authentication.requireAuth,
    async (request, response) =>
      sendSuccess(response, {
        recommendations: await students.recommendedStudents(
          authenticatedUserId(request),
          parseTeamUpId('id', request.params.id),
        ),
      }),
  );
  teamUpRouter.get('/projects/:id', authentication.optionalAuth, controller.getProject);
  teamUpRouter.patch('/projects/:id', authentication.requireAuth, controller.updateProject);
  teamUpRouter.post('/projects/:id/applications', authentication.requireAuth, controller.apply);
  teamUpRouter.get(
    '/projects/:id/applications',
    authentication.requireAuth,
    controller.listApplications,
  );
  teamUpRouter.patch(
    '/projects/:id/applications/:applicationId',
    authentication.requireAuth,
    controller.reviewApplication,
  );
  teamUpRouter.patch('/projects/:id/status', authentication.requireAuth, controller.transition);

  return teamUpRouter;
};
export const teamUpRouter = createTeamUpRouter();
