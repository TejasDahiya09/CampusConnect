import { subscribeMessagingRealtime } from '../messaging/messaging-realtime';
import { apiRequest } from '../../services/api-client';
import type { NotificationPageResult, NotificationView } from './notifications.types';
export const mergeNotifications = (
  current: readonly NotificationView[],
  incoming: NotificationView,
) => (current.some(({ id }) => id === incoming.id) ? current : [incoming, ...current]);
export const notificationsChangedEvent = 'campusconnect:notifications-changed';
export const announceNotificationsChanged = () =>
  window.dispatchEvent(new Event(notificationsChangedEvent));
export const notificationActionState = (total: number, unread: number) => ({
  clearAll: total > 0,
  clearRead: total > unread,
  markAllRead: unread > 0,
});
export const notificationsService = {
  list: (page = 1, limit = 20, unread = false) =>
    apiRequest<NotificationPageResult>(
      `/api/notifications?page=${page}&limit=${limit}&unread=${unread}`,
    ),
  count: async () => (await apiRequest<{ count: number }>('/api/notifications/unread-count')).count,
  read: (id: string) =>
    apiRequest<{ updated: number }>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  readAll: () =>
    apiRequest<{ updated: number }>('/api/notifications/read-all', { method: 'PATCH' }),
  dismiss: (id: string) =>
    apiRequest<{ removed: number }>(`/api/notifications/${id}`, { method: 'DELETE' }),
  clearRead: () => apiRequest<{ removed: number }>('/api/notifications/read', { method: 'DELETE' }),
  clearAll: () => apiRequest<{ removed: number }>('/api/notifications', { method: 'DELETE' }),
};
export const connectNotificationSocket = (
  onNotification: (value: NotificationView) => void,
  onReconnect: () => void,
  userId?: string,
) =>
  Promise.resolve().then(() =>
    subscribeMessagingRealtime({ userId, notification: onNotification, restored: onReconnect }),
  );
