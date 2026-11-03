import { AppError } from '../../errors/app-error.js';
import { notificationEvents } from './notifications.events.js';
import { notificationsRepository } from './notifications.repository.js';
import type { NotificationCreateInput } from './notifications.types.js';
import type { NotificationView } from './notifications.types.js';

interface NotificationsPersistence {
  create(
    input: NotificationCreateInput,
  ): Promise<{ created: boolean; notification: NotificationView }>;
  list(
    userId: string,
    page: number,
    limit: number,
    unreadOnly: boolean,
  ): Promise<{ items: NotificationView[]; total: number }>;
  markAllRead(userId: string): Promise<{ count: number }>;
  markRead(userId: string, id: string): Promise<{ count: number }>;
  dismiss(userId: string, id: string): Promise<{ count: number }>;
  clearRead(userId: string): Promise<{ count: number }>;
  clearAll(userId: string): Promise<{ count: number }>;
  unreadCount(userId: string): Promise<number>;
}

export const createNotificationsService = (
  repository: NotificationsPersistence = notificationsRepository,
  events: Pick<typeof notificationEvents, 'emit'> = notificationEvents,
) => {
  const service = {
    create: async (input: NotificationCreateInput) => {
      if (
        input.title.length < 1 ||
        input.title.length > 180 ||
        (input.description && input.description.length > 1000)
      )
        throw new Error('Invalid internal notification payload.');
      const result = await repository.create(input);
      if (result.created) events.emit('created', result.notification, input.recipientId);
      return result.notification;
    },
    createSafely: async (input: NotificationCreateInput) => {
      try {
        return await service.create(input);
      } catch {
        console.error('Notification persistence failed.', {
          recipientId: input.recipientId,
          type: input.kind,
          sourceEntityId: input.entityId,
        });
        return null;
      }
    },
    list: async (userId: string, page: number, limit: number, unreadOnly: boolean) => {
      const { items, total } = await repository.list(userId, page, limit, unreadOnly);
      return {
        notifications: items,
        pagination: { limit, page, total, totalPages: Math.ceil(total / limit) },
      };
    },
    unreadCount: async (userId: string) => ({ count: await repository.unreadCount(userId) }),
    markRead: async (userId: string, id: string) => {
      const result = await repository.markRead(userId, id);
      if (!result.count)
        throw new AppError({
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found.',
          statusCode: 404,
        });
      return { updated: result.count };
    },
    markAllRead: async (userId: string) => ({
      updated: (await repository.markAllRead(userId)).count,
    }),
    dismiss: async (userId: string, id: string) => ({
      removed: (await repository.dismiss(userId, id)).count,
    }),
    clearRead: async (userId: string) => ({
      removed: (await repository.clearRead(userId)).count,
    }),
    clearAll: async (userId: string) => ({
      removed: (await repository.clearAll(userId)).count,
    }),
  };
  return service;
};
export const notificationsService = createNotificationsService();
