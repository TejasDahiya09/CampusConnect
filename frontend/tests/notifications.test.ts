import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  mergeNotifications,
  notificationActionState,
} from '../src/features/notifications/notifications-service.js';
import type { NotificationView } from '../src/features/notifications/notifications.types.js';
const item: NotificationView = {
  createdAt: '2026-10-07T00:00:00.000Z',
  description: null,
  id: 'notification',
  kind: 'MESSAGE_RECEIVED',
  path: '/messages/conversation',
  read: false,
  readAt: null,
  title: 'New message',
};
void test('realtime and API notification results deduplicate by durable ID', () => {
  assert.deepEqual(mergeNotifications([], item), [item]);
  assert.deepEqual(mergeNotifications([item], { ...item, title: 'duplicate' }), [item]);
});
void test('notification projections use safe internal navigation', () => {
  assert.match(item.path, /^\/(messages|lost-found|teamup|services)(\/|$)/);
  assert.equal('text' in item, false);
});

void test('bulk actions follow empty, unread, read, and mixed authoritative counts', () => {
  assert.deepEqual(notificationActionState(0, 0), {
    clearAll: false,
    clearRead: false,
    markAllRead: false,
  });
  assert.deepEqual(notificationActionState(2, 2), {
    clearAll: true,
    clearRead: false,
    markAllRead: true,
  });
  assert.deepEqual(notificationActionState(2, 0), {
    clearAll: true,
    clearRead: true,
    markAllRead: false,
  });
  assert.deepEqual(notificationActionState(4, 2), {
    clearAll: true,
    clearRead: true,
    markAllRead: true,
  });
});

void test('notification interfaces expose persistent recipient-scoped cleanup controls', async () => {
  const [service, page, bell] = await Promise.all([
    readFile(
      new URL('../src/features/notifications/notifications-service.ts', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/features/notifications/NotificationsPage.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/features/notifications/NotificationBell.tsx', import.meta.url),
      'utf8',
    ),
  ]);
  assert.match(service, /method: 'DELETE'/u);
  assert.match(service, /\/api\/notifications\/read/u);
  assert.match(page, /Clear read/u);
  assert.match(page, /Clear all notifications\?/u);
  assert.match(page, /Dismiss \$\{item\.title\}/u);
  assert.match(bell, /Dismiss \$\{item\.title\}/u);
  assert.match(page, /announceNotificationsChanged/u);
  assert.match(bell, /notificationsChangedEvent/u);
});
