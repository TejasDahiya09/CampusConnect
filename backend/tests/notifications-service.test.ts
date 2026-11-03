import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createNotificationsService } from '../src/modules/notifications/notifications.service.js';
import { notificationQuery } from '../src/modules/notifications/notifications.validation.js';
void test('notification pagination rejects non-finite pages and unsafe offset arithmetic', () => {
  assert.throws(() => notificationQuery({ page: '9'.repeat(400) }));
  assert.throws(() => notificationQuery({ page: String(Number.MAX_SAFE_INTEGER), limit: '50' }));
  assert.deepEqual(notificationQuery({ page: '2', limit: '20', unread: 'true' }), {
    page: 2,
    limit: 20,
    unread: true,
  });
});
import type {
  NotificationCreateInput,
  NotificationView,
} from '../src/modules/notifications/notifications.types.js';
const view: NotificationView = {
  createdAt: '2026-10-07T00:00:00.000Z',
  description: 'Safe metadata',
  id: '00000000-0000-5000-8000-000000000001',
  kind: 'MESSAGE_RECEIVED',
  path: '/messages/00000000-0000-4000-8000-000000000001',
  read: false,
  readAt: null,
  title: 'New message',
};
const input: NotificationCreateInput = {
  description: 'Safe metadata',
  entityId: '00000000-0000-4000-8000-000000000001',
  entityType: 'MESSAGING',
  eventId: 'event-1',
  kind: 'MESSAGE_RECEIVED',
  recipientId: '00000000-0000-4000-8000-000000000002',
  title: 'New message',
};
void test('central service emits only after a newly persisted notification', async () => {
  const emitted: unknown[][] = [];
  const repository = {
    clearAll: () => Promise.resolve({ count: 1 }),
    clearRead: () => Promise.resolve({ count: 1 }),
    create: () => Promise.resolve({ created: true, notification: view }),
    dismiss: () => Promise.resolve({ count: 1 }),
    list: () => Promise.resolve({ items: [view], total: 1 }),
    markAllRead: () => Promise.resolve({ count: 1 }),
    markRead: () => Promise.resolve({ count: 1 }),
    unreadCount: () => Promise.resolve(1),
  };
  const service = createNotificationsService(repository, {
    emit: (...args: unknown[]) => {
      emitted.push(args);
      return true;
    },
  });
  assert.deepEqual(await service.create(input), view);
  assert.equal(emitted.length, 1);
  assert.equal((await service.list(input.recipientId, 1, 20, false)).pagination.total, 1);
  assert.equal((await service.unreadCount(input.recipientId)).count, 1);
});
void test('deduplicated persistence does not emit a duplicate realtime event', async () => {
  let emitted = 0;
  const repository = {
    clearAll: () => Promise.resolve({ count: 0 }),
    clearRead: () => Promise.resolve({ count: 0 }),
    create: () => Promise.resolve({ created: false, notification: view }),
    dismiss: () => Promise.resolve({ count: 0 }),
    list: () => Promise.resolve({ items: [], total: 0 }),
    markAllRead: () => Promise.resolve({ count: 0 }),
    markRead: () => Promise.resolve({ count: 0 }),
    unreadCount: () => Promise.resolve(0),
  };
  const service = createNotificationsService(repository, {
    emit: () => {
      emitted += 1;
      return true;
    },
  });
  await service.create(input);
  assert.equal(emitted, 0);
  await assert.rejects(() => service.markRead('another-user', view.id), /Notification not found/);
});

void test('notification cleanup delegates recipient scope and remains idempotent', async () => {
  const calls: unknown[][] = [];
  const repository = {
    clearAll: (userId: string) => {
      calls.push(['clearAll', userId]);
      return Promise.resolve({ count: 3 });
    },
    clearRead: (userId: string) => {
      calls.push(['clearRead', userId]);
      return Promise.resolve({ count: 2 });
    },
    create: () => Promise.resolve({ created: false, notification: view }),
    dismiss: (userId: string, id: string) => {
      calls.push(['dismiss', userId, id]);
      return Promise.resolve({ count: 0 });
    },
    list: () => Promise.resolve({ items: [], total: 0 }),
    markAllRead: () => Promise.resolve({ count: 0 }),
    markRead: () => Promise.resolve({ count: 0 }),
    unreadCount: () => Promise.resolve(0),
  };
  const service = createNotificationsService(repository);
  const userId = '00000000-0000-4000-8000-000000000002';
  assert.deepEqual(await service.dismiss(userId, view.id), { removed: 0 });
  assert.deepEqual(await service.clearRead(userId), { removed: 2 });
  assert.deepEqual(await service.clearAll(userId), { removed: 3 });
  assert.deepEqual(calls, [
    ['dismiss', userId, view.id],
    ['clearRead', userId],
    ['clearAll', userId],
  ]);
});

void test('notification deletion queries are recipient-scoped at the repository boundary', async () => {
  const source = await readFile(
    new URL('../src/modules/notifications/notifications.repository.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /deleteMany\(\{ where: \{ id, userId \} \}\)/u);
  assert.match(source, /deleteMany\(\{ where: \{ userId, readAt: \{ not: null \} \} \}\)/u);
  assert.match(source, /deleteMany\(\{ where: \{ userId \} \}\)/u);
});
