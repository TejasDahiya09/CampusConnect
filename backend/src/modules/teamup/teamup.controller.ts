import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { teamUpService, type TeamUpService } from './teamup.service.js';
import {
  parseApplicationCreate,
  parseApplicationReview,
  parseProjectTransition,
  parseTeamUpCreate,
  parseTeamUpId,
  parseTeamUpQuery,
  parseTeamUpUpdate,
} from './teamup.validation.js';

const userId = (request: Parameters<RequestHandler>[0]): string => {
  if (!request.auth) throw new Error('Authentication context is unavailable.');
  return request.auth.user.id;
};

export const createTeamUpController = (service: TeamUpService = teamUpService) => ({
  apply: (async (request, response) =>
    sendSuccess(
      response,
      {
        application: await service.apply(
          userId(request),
          parseTeamUpId('id', request.params.id),
          parseApplicationCreate(request.body),
        ),
      },
      { statusCode: 201 },
    )) satisfies RequestHandler,
  createProject: (async (request, response) =>
    sendSuccess(
      response,
      { project: await service.createProject(userId(request), parseTeamUpCreate(request.body)) },
      { statusCode: 201 },
    )) satisfies RequestHandler,
  getProject: (async (request, response) =>
    sendSuccess(response, {
      project: await service.getProject(
        parseTeamUpId('id', request.params.id),
        request.auth?.user.id,
      ),
    })) satisfies RequestHandler,
  listApplications: (async (request, response) =>
    sendSuccess(response, {
      applications: await service.listApplications(
        userId(request),
        parseTeamUpId('id', request.params.id),
      ),
    })) satisfies RequestHandler,
  listProjects: (async (request, response) => {
    const result = await service.listProjects(
      parseTeamUpQuery(request.query),
      request.auth?.user.id,
    );
    return sendSuccess(
      response,
      { projects: result.items },
      {
        meta: {
          limit: result.limit,
          page: result.page,
          total: result.total,
          totalPages: result.totalPages,
        },
      },
    );
  }) satisfies RequestHandler,
  reviewApplication: (async (request, response) =>
    sendSuccess(
      response,
      await service.reviewApplication(
        userId(request),
        parseTeamUpId('id', request.params.id),
        parseTeamUpId('applicationId', request.params.applicationId),
        parseApplicationReview(request.body),
      ),
    )) satisfies RequestHandler,
  transition: (async (request, response) =>
    sendSuccess(response, {
      project: await service.transition(
        userId(request),
        parseTeamUpId('id', request.params.id),
        parseProjectTransition(request.body),
      ),
    })) satisfies RequestHandler,
  updateProject: (async (request, response) =>
    sendSuccess(response, {
      project: await service.updateProject(
        userId(request),
        parseTeamUpId('id', request.params.id),
        parseTeamUpUpdate(request.body),
      ),
    })) satisfies RequestHandler,
  workspace: (async (request, response) =>
    sendSuccess(response, await service.workspace(userId(request)))) satisfies RequestHandler,
});

export const teamUpController = createTeamUpController();
