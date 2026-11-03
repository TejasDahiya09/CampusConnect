import { AppError } from '../../errors/app-error.js';
import type { ProjectStatus } from '../../generated/prisma/client.js';
import { teamUpRepository, type TeamUpRepository } from './teamup.repository.js';
import type { TeamUpCreateInput, TeamUpQuery, TeamUpUpdateInput } from './teamup.types.js';
import { notificationsService } from '../notifications/notifications.service.js';

const problem = (code: string, message: string, statusCode: number) =>
  new AppError({ code, message, statusCode });
const notFound = () =>
  problem('TEAMUP_PROJECT_NOT_FOUND', 'The TeamUp project was not found.', 404);

export const createTeamUpService = (
  repository: TeamUpRepository = teamUpRepository,
  notificationService: Pick<typeof notificationsService, 'createSafely'> = repository ===
  teamUpRepository
    ? notificationsService
    : { createSafely: () => Promise.resolve(null) },
) => ({
  createProject: (ownerId: string, input: TeamUpCreateInput) => repository.create(ownerId, input),
  getProject: async (id: string, viewerId?: string) =>
    (await repository.findById(id, viewerId)) ?? Promise.reject(notFound()),
  listProjects: async (query: TeamUpQuery, viewerId?: string) => {
    const { items, total } = await repository.list(query, viewerId);
    return {
      items,
      limit: query.limit,
      page: query.page,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  },
  updateProject: async (ownerId: string, id: string, input: TeamUpUpdateInput) => {
    const result = await repository.updateOwned(ownerId, id, input);
    if (result === 'capacity')
      throw problem(
        'TEAMUP_CAPACITY_INVALID',
        'Capacity cannot be lower than the current team size.',
        409,
      );
    if (result === null)
      throw problem('TEAMUP_PROJECT_FORBIDDEN', 'Only the owner can edit an active project.', 403);
    return result;
  },
  apply: async (applicantId: string, projectId: string, message: string | null) => {
    const project = await repository.findById(projectId, applicantId);
    const result = await repository.apply(applicantId, projectId, message);
    if (result === 'capacity')
      throw problem('TEAMUP_PROJECT_FULL', 'This project has reached capacity.', 409);
    if (result === 'expired')
      throw problem(
        'TEAMUP_APPLICATION_DEADLINE_EXPIRED',
        'The application deadline has passed.',
        409,
      );
    if (result === 'forbidden')
      throw problem(
        'TEAMUP_APPLICATION_FORBIDDEN',
        'Owners and existing members cannot apply to this project.',
        403,
      );
    if (result === 'conflict')
      throw problem('TEAMUP_APPLICATION_EXISTS', 'You have already applied to this project.', 409);
    if (result === 'not-found')
      throw problem(
        'TEAMUP_APPLICATION_CLOSED',
        'This project is not accepting applications.',
        409,
      );
    if (project)
      await notificationService.createSafely({
        description: `A student applied to ${project.title}`,
        entityId: projectId,
        entityType: 'TEAMUP',
        eventId: result.id,
        kind: 'TEAMUP_APPLICATION',
        recipientId: project.ownerId,
        title: 'New TeamUp application',
      });
    return result;
  },
  listApplications: async (ownerId: string, projectId: string) => {
    const result = await repository.listApplications(ownerId, projectId);
    if (result === 'not-found') throw notFound();
    if (result === 'forbidden')
      throw problem(
        'TEAMUP_APPLICATIONS_FORBIDDEN',
        'Only the project owner can view applications.',
        403,
      );
    return result;
  },
  reviewApplication: async (
    ownerId: string,
    projectId: string,
    applicationId: string,
    decision: 'ACCEPTED' | 'REJECTED',
  ) => {
    const result = await repository.review(ownerId, projectId, applicationId, decision);
    if (result.kind === 'not-found') throw notFound();
    if (result.kind === 'forbidden')
      throw problem(
        'TEAMUP_REVIEW_FORBIDDEN',
        'Only the project owner can review applications.',
        403,
      );
    if (result.kind === 'conflict')
      throw problem(
        'TEAMUP_APPLICATION_FINALIZED',
        'This application has already been reviewed.',
        409,
      );
    if (result.kind === 'closed')
      throw problem('TEAMUP_PROJECT_NOT_RECRUITING', 'This project is no longer recruiting.', 409);
    if (result.kind === 'capacity')
      throw problem('TEAMUP_PROJECT_FULL', 'This project has reached capacity.', 409);
    if (result.kind !== 'application') throw notFound();
    await notificationService.createSafely({
      description: `${result.project.title} application was ${decision.toLowerCase()}`,
      entityId: projectId,
      entityType: 'TEAMUP',
      eventId: `${applicationId}:${decision}`,
      kind: decision === 'ACCEPTED' ? 'TEAMUP_APPLICATION_ACCEPTED' : 'TEAMUP_APPLICATION_REJECTED',
      recipientId: result.application.applicantId,
      title: `TeamUp application ${decision.toLowerCase()}`,
    });
    return result;
  },
  transition: async (ownerId: string, projectId: string, status: ProjectStatus) => {
    const result = await repository.transition(ownerId, projectId, status);
    if (result === 'forbidden')
      throw problem(
        'TEAMUP_PROJECT_FORBIDDEN',
        'Only the project owner can change its lifecycle.',
        403,
      );
    if (result === 'not-found')
      throw problem(
        'INVALID_TEAMUP_STATUS_TRANSITION',
        'This project cannot make that status transition.',
        409,
      );
    return result;
  },
  workspace: (userId: string) => repository.workspace(userId),
});

export const teamUpService = createTeamUpService();

export type TeamUpService = typeof teamUpService;
