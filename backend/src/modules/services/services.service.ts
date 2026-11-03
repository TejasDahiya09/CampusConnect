import { AppError } from '../../errors/app-error.js';
import type { ServiceStatus } from '../../generated/prisma/client.js';
import { servicesRepository, type ServicesRepository } from './services.repository.js';
import type { ServiceCreateInput, ServiceQuery, ServiceUpdateInput } from './services.types.js';
import { notificationsService } from '../notifications/notifications.service.js';
const err = (code: string, message: string, statusCode: number) =>
  new AppError({ code, message, statusCode });
export const createServicesService = (
  repo: ServicesRepository = servicesRepository,
  notificationService: Pick<typeof notificationsService, 'createSafely'> = repo ===
  servicesRepository
    ? notificationsService
    : { createSafely: () => Promise.resolve(null) },
) => ({
  create: (id: string, input: ServiceCreateInput) => repo.create(id, input),
  get: async (id: string, viewer?: string) =>
    (await repo.find(id, viewer)) ??
    Promise.reject(err('SERVICE_NOT_FOUND', 'The service was not found.', 404)),
  list: async (query: ServiceQuery, viewer?: string) => {
    const { items, total } = await repo.list(query, viewer);
    return {
      items,
      limit: query.limit,
      page: query.page,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  },
  update: async (provider: string, id: string, input: ServiceUpdateInput) => {
    const result = await repo.update(provider, id, input);
    if (result === 'not-found') throw err('SERVICE_NOT_FOUND', 'The service was not found.', 404);
    if (result === 'forbidden')
      throw err('SERVICE_FORBIDDEN', 'Only the provider can edit this service.', 403);
    if (result === 'conflict')
      throw err('SERVICE_ARCHIVED', 'Archived services cannot be edited.', 409);
    return result;
  },
  request: async (requester: string, id: string, message: string | null) => {
    const result = await repo.request(requester, id, message);
    if (result === 'not-found')
      throw err('SERVICE_UNAVAILABLE', 'This service is not accepting requests.', 409);
    if (result === 'forbidden')
      throw err('SERVICE_REQUEST_FORBIDDEN', 'Providers cannot request their own service.', 403);
    if (result === 'conflict')
      throw err('SERVICE_REQUEST_EXISTS', 'You already have an active request.', 409);
    // Internal transaction metadata never enters the public request DTO.
    const { notificationTarget, ...request } = result;
    await notificationService.createSafely({
      description: `A student requested ${notificationTarget.title}`,
      entityId: id,
      entityType: 'SERVICE',
      eventId: result.id,
      kind: 'SERVICE_REQUEST',
      recipientId: notificationTarget.providerId,
      title: 'New service request',
    });
    return request;
  },
  mutate: async (
    provider: string,
    serviceId: string,
    requestId: string,
    status: 'ACCEPTED' | 'REJECTED' | 'COMPLETED',
  ) => {
    const result = await repo.mutateRequest(provider, serviceId, requestId, status);
    if (result.kind === 'not-found')
      throw err('SERVICE_REQUEST_NOT_FOUND', 'The service request was not found.', 404);
    if (result.kind === 'forbidden')
      throw err('SERVICE_REQUEST_FORBIDDEN', 'Only the provider can manage this request.', 403);
    if (result.kind === 'conflict')
      throw err(
        'INVALID_SERVICE_REQUEST_TRANSITION',
        'This request cannot make that transition.',
        409,
      );
    if (result.kind === 'request')
      await notificationService.createSafely({
        description: `${result.service.title} request was ${status.toLowerCase()}`,
        entityId: serviceId,
        entityType: 'SERVICE',
        eventId: `${requestId}:${status}`,
        kind:
          status === 'ACCEPTED'
            ? 'SERVICE_REQUEST_ACCEPTED'
            : status === 'REJECTED'
              ? 'SERVICE_REQUEST_REJECTED'
              : 'SERVICE_REQUEST_COMPLETED',
        recipientId: result.request.requesterId,
        title:
          status === 'COMPLETED'
            ? 'Service request completed'
            : `Service request ${status.toLowerCase()}`,
      });
    return result;
  },
  transition: async (provider: string, id: string, status: ServiceStatus) => {
    const result = await repo.transition(provider, id, status);
    if (result === 'not-found') throw err('SERVICE_NOT_FOUND', 'The service was not found.', 404);
    if (result === 'forbidden')
      throw err('SERVICE_FORBIDDEN', 'Only the provider can change availability.', 403);
    if (result === 'conflict')
      throw err(
        'INVALID_SERVICE_STATUS_TRANSITION',
        'This service cannot make that transition.',
        409,
      );
    return result;
  },
  workspace: (id: string) => repo.workspace(id),
});
export const servicesService = createServicesService();
export type ServicesService = typeof servicesService;
