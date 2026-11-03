import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { notificationsService } from './notifications.service.js';
import { notificationId, notificationQuery } from './notifications.validation.js';
const user = (r: Parameters<RequestHandler>[0]) => {
  if (!r.auth) throw new Error('Authentication unavailable.');
  return r.auth.user.id;
};
export const notificationsController = {
  list: (async (r, s) => {
    const q = notificationQuery(r.query);
    sendSuccess(s, await notificationsService.list(user(r), q.page, q.limit, q.unread));
  }) satisfies RequestHandler,
  count: (async (r, s) =>
    sendSuccess(s, await notificationsService.unreadCount(user(r)))) satisfies RequestHandler,
  read: (async (r, s) =>
    sendSuccess(
      s,
      await notificationsService.markRead(user(r), notificationId(r.params.id)),
    )) satisfies RequestHandler,
  readAll: (async (r, s) =>
    sendSuccess(s, await notificationsService.markAllRead(user(r)))) satisfies RequestHandler,
  dismiss: (async (r, s) =>
    sendSuccess(
      s,
      await notificationsService.dismiss(user(r), notificationId(r.params.id)),
    )) satisfies RequestHandler,
  clearRead: (async (r, s) =>
    sendSuccess(s, await notificationsService.clearRead(user(r)))) satisfies RequestHandler,
  clearAll: (async (r, s) =>
    sendSuccess(s, await notificationsService.clearAll(user(r)))) satisfies RequestHandler,
};
