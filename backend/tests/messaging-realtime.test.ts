import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, test } from 'node:test';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import {
  attachMessagingSocket,
  type ResolveMessagingUser,
} from '../src/modules/messaging/messaging.socket.js';
import { messagingEvents } from '../src/modules/messaging/messaging.events.js';
import type { MessageView } from '../src/modules/messaging/messaging.types.js';
import { notificationEvents } from '../src/modules/notifications/notifications.events.js';
import type { NotificationView } from '../src/modules/notifications/notifications.types.js';

const clients: ClientSocket[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});
const once = <T>(socket: ClientSocket, event: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}.`)), 2000);
    socket.once(event, (value: T) => {
      clearTimeout(timer);
      resolve(value);
    });
  });

void test('authenticated Socket.IO user rooms deliver persisted message events', async () => {
  const server = createServer();
  const realtime = attachMessagingSocket(server, (token) => {
    if (token === 'valid-a')
      return Promise.resolve({ userId: 'user-a', expiresAt: Date.now() + 60_000 });
    if (token === 'valid-b')
      return Promise.resolve({ userId: 'user-b', expiresAt: Date.now() + 60_000 });
    return Promise.reject(new Error('invalid'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server unavailable.');
  const url = `http://127.0.0.1:${address.port}`;
  const first = connect(url, { auth: { token: 'valid-a' }, transports: ['websocket'] });
  const second = connect(url, { auth: { token: 'valid-b' }, transports: ['websocket'] });
  clients.push(first, second);
  await Promise.all([once(first, 'connect'), once(second, 'connect')]);
  const message: MessageView = {
    conversationId: 'conversation',
    id: 'message',
    read: false,
    senderId: 'user-a',
    sentAt: new Date().toISOString(),
    text: 'delivered after persistence',
  };
  const received = once<MessageView>(second, 'message:new');
  messagingEvents.emit('message', message, ['user-a', 'user-b']);
  assert.deepEqual(await received, message);
  await new Promise<void>((done) => {
    void realtime.close(() => done());
  });
});

void test('Socket.IO rejects missing or invalid authentication', async () => {
  const server = createServer();
  const realtime = attachMessagingSocket(server, () => Promise.reject(new Error('invalid')));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server unavailable.');
  const client = connect(`http://127.0.0.1:${address.port}`, { transports: ['websocket'] });
  clients.push(client);
  const error = await once<Error>(client, 'connect_error');
  assert.equal(error.message, 'Authentication is required.');
  await new Promise<void>((done) => {
    void realtime.close(() => done());
  });
});

void test('persisted notifications reach only the authenticated recipient room', async () => {
  const server = createServer();
  const realtime = attachMessagingSocket(server, (token) =>
    Promise.resolve({ userId: token, expiresAt: Date.now() + 60_000 }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server unavailable.');
  const recipient = connect(`http://127.0.0.1:${address.port}`, {
    auth: { token: 'recipient' },
    transports: ['websocket'],
  });
  const unrelated = connect(`http://127.0.0.1:${address.port}`, {
    auth: { token: 'unrelated' },
    transports: ['websocket'],
  });
  clients.push(recipient, unrelated);
  await Promise.all([once(recipient, 'connect'), once(unrelated, 'connect')]);
  let unrelatedDeliveries = 0;
  unrelated.on('notification:created', () => {
    unrelatedDeliveries += 1;
  });
  const notification: NotificationView = {
    createdAt: new Date().toISOString(),
    description: 'Safe context',
    id: 'notification',
    kind: 'MESSAGE_RECEIVED',
    path: '/messages/conversation',
    read: false,
    readAt: null,
    title: 'New message',
  };
  const received = once<NotificationView>(recipient, 'notification:created');
  notificationEvents.emit('created', notification, 'recipient');
  assert.deepEqual(await received, notification);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(unrelatedDeliveries, 0);
  await new Promise<void>((done) => {
    void realtime.close(() => done());
  });
});

const withSocketRuntime = async (
  auth: ResolveMessagingUser,
  run: (url: string, server: ReturnType<typeof attachMessagingSocket>) => Promise<void>,
  interval = 30_000,
  timeout = 5_000,
) => {
  const http = createServer(),
    server = attachMessagingSocket(http, auth, interval, timeout);
  await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Unavailable fixture');
  try {
    await run('http://127.0.0.1:' + String(address.port), server);
  } finally {
    await new Promise<void>((done) => {
      void server.close(() => done());
    });
  }
};
for (const state of ['invalid', 'expired', 'suspended', 'deactivated'])
  void test('socket rejects ' + state + ' synthetic identity', async () => {
    await withSocketRuntime(
      () =>
        state === 'expired'
          ? Promise.resolve({ userId: 'synthetic', expiresAt: Date.now() - 1 })
          : Promise.reject(new Error('Unavailable')),
      async (url) => {
        const client = connect(url, {
          auth: { token: 'synthetic-token' },
          transports: ['websocket'],
          reconnection: false,
        });
        clients.push(client);
        assert.equal(
          (await once<Error>(client, 'connect_error')).message,
          'Authentication failed.',
        );
      },
    );
  });
void test('connected token expires, disconnects and cannot receive private events', async () => {
  const expiresAt = Date.now() + 250;
  await withSocketRuntime(
    () => Promise.resolve({ userId: 'synthetic', expiresAt }),
    async (url, server) => {
      const client = connect(url, {
        auth: { token: 'synthetic' },
        transports: ['websocket'],
        reconnection: false,
      });
      clients.push(client);
      await once(client, 'connect');
      let received = 0;
      client.on('message:new', () => {
        received++;
      });
      await once(client, 'disconnect');
      assert.equal(server.of('/').sockets.size, 0);
      assert.equal(received, 0);
    },
  );
});
for (const state of ['suspended', 'deactivated'])
  void test(
    'private delivery checks authoritative ' + state + ' status before the next periodic tick',
    async () => {
      let active = true;
      await withSocketRuntime(
        () =>
          active
            ? Promise.resolve({ userId: 'synthetic', expiresAt: Date.now() + 60_000 })
            : Promise.reject(new Error('Unavailable')),
        async (url) => {
          const client = connect(url, { auth: { token: 'synthetic' }, transports: ['websocket'] });
          clients.push(client);
          await once(client, 'connect');
          let received = 0;
          client.on('message:new', () => {
            received++;
          });
          active = false;
          const disconnected = once(client, 'disconnect');
          messagingEvents.emit(
            'message',
            {
              id: 'synthetic-message',
              conversationId: 'synthetic-conversation',
              senderId: 'other',
              text: 'synthetic secret',
              read: false,
              sentAt: new Date().toISOString(),
            },
            ['synthetic'],
          );
          await disconnected;
          assert.equal(received, 0);
        },
      );
    },
  );
void test('idle account revocation disconnects all concurrent sessions during bounded revalidation', async () => {
  let active = true;
  await withSocketRuntime(
    () =>
      active
        ? Promise.resolve({ userId: 'synthetic', expiresAt: Date.now() + 60_000 })
        : Promise.reject(new Error('Unavailable')),
    async (url) => {
      const pair = [
        connect(url, { auth: { token: 'synthetic' }, transports: ['websocket'] }),
        connect(url, { auth: { token: 'synthetic' }, transports: ['websocket'] }),
      ];
      clients.push(...pair);
      await Promise.all(pair.map((c) => once(c, 'connect')));
      const disconnected = pair.map((c) => once(c, 'disconnect'));
      active = false;
      await Promise.all(disconnected);
    },
    20,
  );
});
void test('client room join events cannot acquire another identity room', async () => {
  await withSocketRuntime(
    (token) => Promise.resolve({ userId: token, expiresAt: Date.now() + 60_000 }),
    async (url, server) => {
      const attacker = connect(url, {
        auth: { token: 'attacker', userId: 'victim' },
        transports: ['websocket'],
      });
      clients.push(attacker);
      await once(attacker, 'connect');
      attacker.emit('join', 'user:victim');
      attacker.emit('join-room', { userId: 'victim' });
      const socket = [...server.of('/').sockets.values()][0]!;
      assert.ok(socket.rooms.has('user:attacker'));
      assert.equal(socket.rooms.has('user:victim'), false);
    },
  );
});

void test('socket handshake fails closed when authoritative authentication stalls', async () => {
  await withSocketRuntime(
    () => new Promise(() => {}),
    async (url) => {
      const client = connect(url, {
        auth: { token: 'synthetic' },
        transports: ['websocket'],
        reconnection: false,
      });
      clients.push(client);
      assert.equal((await once<Error>(client, 'connect_error')).message, 'Authentication failed.');
    },
    30_000,
    30,
  );
});
void test('private delivery fails closed when revalidation stalls', async () => {
  let available = true;
  await withSocketRuntime(
    () =>
      available
        ? Promise.resolve({ userId: 'synthetic', expiresAt: Date.now() + 60_000 })
        : new Promise(() => {}),
    async (url) => {
      const client = connect(url, { auth: { token: 'synthetic' }, transports: ['websocket'] });
      clients.push(client);
      await once(client, 'connect');
      let received = 0;
      client.on('message:new', () => {
        received++;
      });
      available = false;
      const disconnected = once(client, 'disconnect');
      messagingEvents.emit(
        'message',
        {
          id: 'synthetic-message',
          conversationId: 'synthetic',
          senderId: 'other',
          text: 'synthetic secret',
          read: false,
          sentAt: new Date().toISOString(),
        },
        ['synthetic'],
      );
      await disconnected;
      assert.equal(received, 0);
    },
    30_000,
    30,
  );
});

void test('read invalidations reach both authenticated reader tabs, exclude peers, and ignore client room/event claims', async () => {
  const server = createServer();
  const realtime = attachMessagingSocket(server, (token) =>
    Promise.resolve({ userId: token, expiresAt: Date.now() + 60_000 }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server');
  const open = (token: string) => {
    const socket = connect(`http://127.0.0.1:${address.port}`, {
      auth: { token },
      transports: ['websocket'],
    });
    clients.push(socket);
    return socket;
  };
  const a = open('reader'),
    b = open('reader'),
    peer = open('peer');
  try {
    await Promise.all([once(a, 'connect'), once(b, 'connect'), once(peer, 'connect')]);
    let leaked = 0,
      arbitrary = 0;
    peer.on('messages:read', () => {
      leaked++;
    });
    const listener = () => {
      arbitrary++;
    };
    messagingEvents.on('read', listener);
    peer.emit('join', 'user:reader');
    peer.emit('messages:read', { conversationId: 'forged' });
    const one = once(a, 'messages:read'),
      two = once(b, 'messages:read');
    messagingEvents.emit('read', { conversationId: 'synthetic-conversation' }, ['reader']);
    assert.deepEqual(await one, { conversationId: 'synthetic-conversation' });
    assert.deepEqual(await two, { conversationId: 'synthetic-conversation' });
    assert.equal(leaked, 0);
    assert.equal(arbitrary, 1);
    messagingEvents.off('read', listener);
  } finally {
    await new Promise<void>((resolve) => {
      void realtime.close(() => resolve());
    });
  }
});
