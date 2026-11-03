import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test, mock } from 'node:test';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, ConversationType } from '../src/generated/prisma/client.js';
import { prisma } from '../src/database/prisma.js';
import {
  messagingRepository,
  createMessagingRepository,
} from '../src/modules/messaging/messaging.repository.js';
import { messagingService } from '../src/modules/messaging/messaging.service.js';
import { messagingEvents } from '../src/modules/messaging/messaging.events.js';
import { notificationEvents } from '../src/modules/notifications/notifications.events.js';
import { notificationsRepository } from '../src/modules/notifications/notifications.repository.js';
import { parseOpenConversation } from '../src/modules/messaging/messaging.validation.js';
import { createMessagingRouter } from '../src/modules/messaging/messaging.routes.js';
import { createAuthenticationMiddleware } from '../src/modules/auth/auth.middleware.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { withTestServer } from './helpers/test-server.js';
import { attachMessagingSocket } from '../src/modules/messaging/messaging.socket.js';
import { createServer } from 'node:http';
import { io as connect } from 'socket.io-client';
import express from 'express';
import { messageEncryption } from '../src/modules/messaging/message-encryption.js';
import { AppError } from '../src/errors/app-error.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import cors from 'cors';
import { servicePerson } from '../src/modules/services/services-policy.js';
import { notificationsController } from '../src/modules/notifications/notifications.controller.js';
const url = process.env.MESSAGING_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '5433');
  assert.equal(parsed.username, 'postgres');
  assert.equal(parsed.search, '');
  assert.match(parsed.pathname, /^\/campusconnect_messaging_test_[a-z0-9_]+$/);
  assert.equal(
    process.env.DATABASE_URL,
    url,
    'Pin all imported application clients to this isolated database.',
  );
}
const pool = url ? new Pool({ connectionString: url }) : null;
const db = url ? new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }) : null;

before(async () => {
  if (!pool) return;
  const identity = (
    await pool.query<{ database: string; address: string; port: number; version: string }>(
      "SELECT current_database() AS database,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version') AS version",
    )
  ).rows[0]!;
  assert.match(identity.database, /^campusconnect_messaging_test_[a-z0-9_]+$/);
  assert.equal(identity.address, '127.0.0.1');
  assert.equal(identity.port, 5433);
  assert.match(identity.version, /^17\./);
  assert.equal(
    (
      await pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'",
      )
    ).rows[0]!.n,
    0,
    'Never reuse a populated database.',
  );
  await pool.query(`
    CREATE TYPE account_status AS ENUM ('ACTIVE','SUSPENDED','DEACTIVATED');
    CREATE TYPE moderation_visibility AS ENUM ('VISIBLE','HIDDEN');
    CREATE TYPE service_status AS ENUM ('ACTIVE','PAUSED','ARCHIVED');
    CREATE TYPE conversation_type AS ENUM ('DIRECT','MARKETPLACE','TEAMUP','SERVICE','LOST_FOUND');
    CREATE TABLE users(id uuid PRIMARY KEY,status account_status NOT NULL DEFAULT 'ACTIVE');
    CREATE TABLE profiles(user_id uuid PRIMARY KEY REFERENCES users(id),full_name varchar(120) NOT NULL,department varchar(120),avatar jsonb,moderation_visibility moderation_visibility NOT NULL DEFAULT 'VISIBLE');
    CREATE TABLE services(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),provider_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,title varchar(180) NOT NULL,description text NOT NULL,category varchar(100) NOT NULL,skills text[] NOT NULL DEFAULT '{}',price numeric(12,2),currency char(3) NOT NULL DEFAULT 'INR',location varchar(180),images jsonb NOT NULL DEFAULT '[]',portfolio jsonb NOT NULL DEFAULT '[]',bookmarks jsonb NOT NULL DEFAULT '[]',bookings jsonb NOT NULL DEFAULT '[]',reviews jsonb NOT NULL DEFAULT '[]',rating numeric(3,2) NOT NULL DEFAULT 0,rating_count integer NOT NULL DEFAULT 0,status service_status NOT NULL DEFAULT 'ACTIVE',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),moderation_visibility moderation_visibility NOT NULL DEFAULT 'VISIBLE',moderation_reason varchar(500),moderated_at timestamptz,featured_on_landing boolean NOT NULL DEFAULT false);
    CREATE TABLE conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),participant_a_id uuid NOT NULL REFERENCES users(id),participant_b_id uuid NOT NULL REFERENCES users(id),context_type conversation_type NOT NULL DEFAULT 'DIRECT',context_id uuid,context_key varchar(36) NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(participant_a_id,participant_b_id,context_type,context_key));
    ALTER TABLE conversations ADD CONSTRAINT conversations_canonical_participants CHECK(participant_a_id < participant_b_id), ADD CONSTRAINT conversations_context_identity CHECK((context_type='DIRECT' AND context_id IS NULL AND context_key='') OR (context_type<>'DIRECT' AND context_id IS NOT NULL AND context_key=context_id::text));
    CREATE TYPE listing_status AS ENUM ('ACTIVE','SOLD','ARCHIVED');
    CREATE TABLE marketplace(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),seller_id uuid REFERENCES users(id),title varchar(180) NOT NULL,status listing_status NOT NULL DEFAULT 'ACTIVE',moderation_visibility moderation_visibility NOT NULL DEFAULT 'VISIBLE');
    CREATE TABLE teamup(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES users(id),title varchar(180) NOT NULL,members jsonb NOT NULL DEFAULT '[]',moderation_visibility moderation_visibility NOT NULL DEFAULT 'VISIBLE');
    CREATE TABLE test_notification_intents(event_id text NOT NULL, recipient_id uuid NOT NULL);
    CREATE TYPE notification_type AS ENUM ('MESSAGE','TEAM_APPLICATION','BOOKING','CLAIM','MATCH','LISTING','SYSTEM','ANNOUNCEMENT');
    CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),type notification_type NOT NULL,title varchar(180) NOT NULL,message varchar(1000),data jsonb NOT NULL DEFAULT '{}',read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid NOT NULL REFERENCES conversations(id),sender_id uuid NOT NULL REFERENCES users(id),receiver_id uuid NOT NULL REFERENCES users(id),context_type conversation_type NOT NULL DEFAULT 'DIRECT',context_id uuid,encrypted_content bytea NOT NULL,encryption_iv bytea NOT NULL,encryption_tag bytea NOT NULL,encryption_version smallint NOT NULL DEFAULT 1,attachments jsonb NOT NULL DEFAULT '[]',read_at timestamptz,edited_at timestamptz,deleted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
  `);
});
after(async () => {
  await db?.$disconnect();
  await prisma.$disconnect();
  await pool?.end();
});

const check = (name: string, run: () => Promise<void>) =>
  test('Messaging PostgreSQL: ' + name, { skip: !url }, run);
const user = async (status = 'ACTIVE', visibility = 'VISIBLE') => {
  const id = randomUUID();
  await pool!.query('INSERT INTO users(id,status) VALUES($1,$2)', [id, status]);
  await pool!.query(
    "INSERT INTO profiles(user_id,full_name,department,avatar,moderation_visibility) VALUES($1,'Synthetic private name','Synthetic department','{\"url\":\"private-avatar\"}',$2)",
    [id, visibility],
  );
  return id;
};
const direct = (a: string, b: string) =>
  messagingService.open(a, {
    contextType: ConversationType.DIRECT,
    contextId: null,
    targetUserId: b,
  });
const listing = async (seller: string) => {
  const id = randomUUID();
  await pool!.query(
    "INSERT INTO marketplace(id,seller_id,title) VALUES($1,$2,'Synthetic listing')",
    [id, seller],
  );
  return id;
};
const send = (a: string, c: string, text = 'synthetic message', key?: string) =>
  messagingService.send(a, c, text, key);
const count = async (sql: string, args: unknown[] = []) =>
  Number((await pool!.query<{ n: number }>(sql, args)).rows[0]!.n);
const denied = (run: () => Promise<unknown>, code?: string) =>
  assert.rejects(
    run,
    (e: unknown) => e instanceof Error && (!code || ('code' in e && e.code === code)),
  );

const createMessagingTestApp = () => {
  const authentication = createAuthenticationMiddleware({
    verifyAccessToken: (token) => {
      if (token === 'synthetic-expired')
        return Promise.reject(
          new AppError({
            code: 'INVALID_ACCESS_TOKEN',
            message: 'Authentication is required.',
            statusCode: 401,
          }),
        );
      return Promise.resolve({
        id: token,
        email: 'synthetic@example.test',
        emailVerified: true,
        metadata: {},
      });
    },
    repository: {
      findById: async (id) => {
        const row = await db!.user.findUnique({ where: { id }, select: { status: true } });
        return row
          ? {
              id,
              email: 'synthetic@example.test',
              emailVerifiedAt: null,
              profile: null,
              role: 'STUDENT',
              status: row.status,
            }
          : null;
      },
    },
  });
  const app = express();
  // Synthetic local browser fixture only; production CORS remains unchanged.
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use('/api/messages', createMessagingRouter({ authentication }));
  app.get('/api/notifications', authentication.requireAuth, notificationsController.list);
  app.get(
    '/api/notifications/unread-count',
    authentication.requireAuth,
    notificationsController.count,
  );
  app.use(errorHandler);
  return app;
};
const withMessagingHttp = async (run: (base: string) => Promise<void>) =>
  withTestServer(createMessagingTestApp(), run);

void test(
  'Messaging PostgreSQL: 11E actual browser/HTTP/Socket/encrypted database journey',
  { skip: !url || process.env.MESSAGING_BROWSER_INTEGRATION !== '1' },
  async () => {
    const a = await user(),
      b = await user(),
      conversation = await direct(a, b);
    for (let i = 0; i < 34; i++) await direct(a, await user());
    const app = createMessagingTestApp(),
      server = createServer(app);
    const realtime = attachMessagingSocket(server, async (token) => {
      const row = await db!.user.findUnique({ where: { id: token }, select: { status: true } });
      if (row?.status !== 'ACTIVE') throw new Error('Unavailable');
      return { userId: token, expiresAt: Date.now() + 120_000 };
    });
    // Local test control, never mounted by application code.
    app.post('/__qa/disconnect/' + b, (_request, response) => {
      for (const socket of realtime.sockets.sockets.values())
        if (socket.rooms.has('user:' + b)) socket.conn.close();
      response.json({ closed: true });
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const output = join(tmpdir(), 'campusconnect-messaging-11f-integrated-browser');
    const childEnv = { ...process.env };
    for (const key of Object.keys(childEnv))
      if (/DATABASE|SUPABASE|ENCRYPTION|AWS_|AI_SERVICE|GEMINI|VERTEX/.test(key))
        delete childEnv[key];
    try {
      const child = await promisify(execFile)(
        process.execPath,
        [
          'frontend/tests/messaging-local-integration-browser-qa.mjs',
          output,
          'http://127.0.0.1:' + String(address.port),
          a,
          b,
          conversation.id,
        ],
        {
          cwd: resolve(import.meta.dirname, '../..'),
          env: childEnv,
          timeout: 90_000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        },
      );
      console.log(child.stdout.trim());
      assert.equal(
        await count('SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1', [
          conversation.id,
        ]),
        5,
      );
      assert.equal(
        await count(
          'SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1 AND read_at IS NOT NULL',
          [conversation.id],
        ),
        5,
      );
    } finally {
      await new Promise<void>((done) => {
        void realtime.close(() => done());
      });
    }
  },
);

for (const contextType of ['DIRECT', 'MARKETPLACE', 'TEAMUP', 'SERVICE'] as const) {
  void check(
    '11E complete HTTP/encrypted-storage/socket/read/reconnect journey — ' + contextType,
    async () => {
      const a = await user(),
        b = await user(),
        outsider = await user();
      let contextId: string | undefined;
      if (contextType === 'MARKETPLACE') contextId = await listing(b);
      if (contextType === 'TEAMUP') {
        contextId = randomUUID();
        await pool!.query('INSERT INTO teamup(id,owner_id,title,members) VALUES($1,$2,$3,$4)', [
          contextId,
          a,
          'Synthetic integration project',
          JSON.stringify([{ userId: b }]),
        ]);
      }
      if (contextType === 'SERVICE') {
        contextId = randomUUID();
        await pool!.query(
          'INSERT INTO services(provider_id,title,description,category,bookings) VALUES($1,$2,$3,$4,$5)',
          [
            b,
            'Synthetic integration service',
            'Synthetic description',
            'Help',
            JSON.stringify([{ id: contextId, requesterId: a, status: 'ACCEPTED' }]),
          ],
        );
      }
      const server = createServer(createMessagingTestApp());
      const realtime = attachMessagingSocket(server, async (token) => {
        const account = await db!.user.findUnique({
          where: { id: token },
          select: { status: true },
        });
        if (account?.status !== 'ACTIVE') throw new Error('Unavailable');
        return { userId: token, expiresAt: Date.now() + 60_000 };
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const base = 'http://127.0.0.1:' + String(address.port);
      const sockets = [b, outsider].map((id) =>
        connect(base, { auth: { token: id }, transports: ['websocket'], reconnection: false }),
      );
      const once = <T>(socket: (typeof sockets)[number], event: string) =>
        new Promise<T>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Synthetic journey socket timeout')),
            3000,
          );
          socket.once(event, (value: T) => {
            clearTimeout(timer);
            resolve(value);
          });
        });
      const request = (actor: string, path: string, method = 'GET', body?: unknown) =>
        fetch(base + '/api/messages' + path, {
          method,
          headers: { authorization: 'Bearer ' + actor, 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      try {
        await Promise.all(sockets.map((socket) => once(socket, 'connect')));
        let leaked = 0;
        sockets[1]!.on('message:new', () => {
          leaked++;
        });
        const openBody = { contextType, contextId, targetUserId: b };
        const opened = await request(a, '/conversations', 'POST', openBody);
        assert.equal(opened.status, 201);
        const conversation = (
          (await opened.json()) as {
            data: { conversation: { id: string; contextId: string | null; contextType: string } };
          }
        ).data.conversation;
        assert.equal(conversation.contextType, contextType);
        assert.equal(conversation.contextId, contextId ?? null);
        const again = await request(a, '/conversations', 'POST', openBody);
        assert.equal(
          ((await again.json()) as { data: { conversation: { id: string } } }).data.conversation.id,
          conversation.id,
        );
        const key = randomUUID(),
          text = '11E synthetic confidential journey ' + contextType;
        const delivered = once<{ id: string; text: string }>(sockets[0]!, 'message:new');
        const notice = once<{ path: string; description: null; title: string }>(
          sockets[0]!,
          'notification:created',
        );
        assert.equal(
          (await request(a, '/' + conversation.id, 'POST', { text, clientMessageId: key })).status,
          201,
        );
        assert.deepEqual(
          { id: (await delivered).id, text: (await delivered).text },
          { id: key, text },
        );
        const notification = await notice;
        assert.equal(notification.path, '/messages/' + conversation.id);
        assert.equal(notification.description, null);
        assert.doesNotMatch(notification.title, /Synthetic private name/);
        const persisted = (
          await pool!.query<{
            sender_id: string;
            receiver_id: string;
            encrypted_content: Buffer;
            encryption_iv: Buffer;
            encryption_tag: Buffer;
            encryption_version: number;
          }>('SELECT * FROM messages WHERE id=$1', [key])
        ).rows[0]!;
        assert.equal(persisted.sender_id, a);
        assert.equal(persisted.receiver_id, b);
        assert.equal(persisted.encrypted_content.includes(Buffer.from(text)), false);
        assert.equal(persisted.encryption_iv.length, 12);
        assert.equal(persisted.encryption_tag.length, 16);
        assert.equal(persisted.encryption_version, 1);
        assert.equal((await request(outsider, '/' + conversation.id)).status, 404);
        assert.equal((await fetch(base + '/api/messages/' + conversation.id)).status, 401);
        assert.equal((await request('synthetic-expired', '/' + conversation.id)).status, 401);
        assert.equal(
          (await request(a, '/' + conversation.id, 'POST', { text, senderId: outsider })).status,
          400,
        );
        const history = (
          (await (await request(b, '/' + conversation.id)).json()) as {
            data: { messages: { id: string; text: string }[]; readReceipt: string };
          }
        ).data;
        assert.equal(history.messages[0]?.text, text);
        const concurrent = await send(a, conversation.id, 'Synthetic arrival after receipt');
        assert.equal(
          (
            await request(b, '/' + conversation.id + '/read', 'PATCH', {
              readReceipt: history.readReceipt,
            })
          ).status,
          200,
        );
        assert.equal(
          await count('SELECT count(*)::int AS n FROM messages WHERE id=$1 AND read_at IS NULL', [
            concurrent.id,
          ]),
          1,
        );
        assert.equal(
          (
            await request(outsider, '/' + conversation.id + '/read', 'PATCH', {
              readReceipt: history.readReceipt,
            })
          ).status,
          404,
        );
        sockets[0]!.disconnect();
        const gap = await send(a, conversation.id, 'Synthetic message committed during disconnect');
        const reconnected = once(sockets[0]!, 'connect');
        sockets[0]!.connect();
        await reconnected;
        const recovery = (
          (await (
            await request(b, '/' + conversation.id + '/updates?after=' + key + '&limit=100')
          ).json()) as { data: { messages: { id: string }[]; readReceipt: string } }
        ).data;
        assert.deepEqual(
          new Set(recovery.messages.map((message) => message.id)),
          new Set([concurrent.id, gap.id]),
        );
        await request(b, '/' + conversation.id + '/read', 'PATCH', {
          readReceipt: recovery.readReceipt,
        });
        const inbox = (
          (await (await request(b, '')).json()) as {
            data: {
              unread: { total: number };
              conversations: { id: string; unreadCount: number }[];
            };
          }
        ).data;
        assert.equal(inbox.unread.total, 0);
        assert.equal(inbox.conversations.find((row) => row.id === conversation.id)?.unreadCount, 0);
        await request(a, '/' + conversation.id, 'POST', { text, clientMessageId: key });
        assert.equal(await count('SELECT count(*)::int AS n FROM messages WHERE id=$1', [key]), 1);
        assert.equal(
          await count(
            "SELECT count(*)::int AS n FROM notifications WHERE data->>'eventId'=$1 AND user_id=$2",
            [key, b],
          ),
          1,
        );
        assert.equal(leaked, 0);
      } finally {
        sockets.forEach((socket) => socket.disconnect());
        await new Promise<void>((resolve) => {
          void realtime.close(() => resolve());
        });
      }
    },
  );
}

void check(
  '11E known late-commit cursor omission reproduced against two real database transactions',
  async () => {
    const a = await user(),
      b = await user(),
      c = await direct(a, b);
    const baseline = await send(a, c.id, 'Synthetic baseline');
    const transaction = await pool!.connect();
    const lateId = randomUUID();
    const encrypted = messageEncryption.encrypt('Synthetic late commit');
    let transactionOpen = false;
    try {
      await transaction.query('BEGIN');
      transactionOpen = true;
      await transaction.query(
        'INSERT INTO messages(id,conversation_id,sender_id,receiver_id,encrypted_content,encryption_iv,encryption_tag,encryption_version) VALUES($1,$2,$3,$4,$5,$6,$7,1)',
        [
          lateId,
          c.id,
          a,
          b,
          Buffer.from(encrypted.encryptedContent),
          Buffer.from(encrypted.encryptionIv),
          Buffer.from(encrypted.encryptionTag),
        ],
      );
      // Explicit ordering keys make the held-transaction visibility test independent
      // of differences between application millisecond clocks and database defaults.
      await transaction.query(
        "UPDATE messages SET created_at=(SELECT created_at + interval '1 second' FROM messages WHERE id=$1) WHERE id=$2",
        [baseline.id, lateId],
      );
      const newer = await send(a, c.id, 'Synthetic newer committed message');
      await pool!.query(
        "UPDATE messages SET created_at=(SELECT created_at + interval '2 seconds' FROM messages WHERE id=$1) WHERE id=$2",
        [baseline.id, newer.id],
      );
      const first = await messagingService.updates(b, c.id, baseline.id, 100);
      assert.deepEqual(
        first.messages.map((message) => message.id),
        [newer.id],
      );
      await transaction.query('COMMIT');
      transactionOpen = false;
      const next = await messagingService.updates(b, c.id, first.nextCursor, 100);
      const ordering = (
        await pool!.query<{ earlier: boolean }>(
          'SELECT a.created_at < b.created_at AS earlier FROM messages a, messages b WHERE a.id=$1 AND b.id=$2',
          [lateId, newer.id],
        )
      ).rows[0]!.earlier;
      assert.equal(ordering, true);
      assert.equal(
        next.messages.length,
        0,
        'Known ordering-based recovery omits a row committed behind the advanced anchor. This is NOT a recovery success claim.',
      );
      const repaired = await messagingService.updates(b, c.id, 'start', 100, true);
      assert.ok(
        repaired.messages.some((row) => row.id === lateId),
        'Recent authoritative reconciliation recovers the late commit behind the advanced forward cursor.',
      );
      const visible = new Map(
        [...first.messages, ...repaired.messages, ...repaired.messages].map((row) => [row.id, row]),
      );
      assert.equal(visible.size, 3);
      const full = await messagingService.historyPage(b, c.id, 1, 50);
      assert.ok(full.messages.some((message) => message.id === lateId));
      assert.equal(await count('SELECT count(*)::int AS n FROM messages WHERE id=$1', [lateId]), 1);
    } finally {
      if (transactionOpen) await transaction.query('ROLLBACK');
      transaction.release();
    }
  },
);

void check(
  '11E notification persistence failure preserves the message and does not log content or encryption key',
  async () => {
    const a = await user(),
      b = await user(),
      c = await direct(a, b),
      id = randomUUID();
    const text = 'Synthetic secret content must stay out of operational logs';
    const logs: unknown[][] = [];
    const capture = mock.method(console, 'error', (...args: unknown[]) => {
      logs.push(args);
    });
    const failure = mock.method(notificationsRepository, 'create', () =>
      Promise.reject(new Error(text)),
    );
    try {
      const result = await send(a, c.id, text, id);
      assert.equal(result.id, id);
      assert.equal(await count('SELECT count(*)::int AS n FROM messages WHERE id=$1', [id]), 1);
      assert.equal(
        await count("SELECT count(*)::int AS n FROM notifications WHERE data->>'eventId'=$1", [id]),
        0,
      );
      assert.equal(JSON.stringify(logs).includes(text), false);
      assert.equal(JSON.stringify(logs).includes(process.env.MESSAGE_ENCRYPTION_KEY!), false);
      assert.ok(logs.length > 0);
    } finally {
      failure.mock.restore();
      capture.mock.restore();
    }
  },
);

void check(
  '11E bounded local query/latency benchmark with synthetic indexed conversations',
  async () => {
    await pool!.query(
      'CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id,created_at DESC,id DESC); CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(receiver_id,created_at DESC) WHERE read_at IS NULL; CREATE INDEX IF NOT EXISTS idx_conversations_participant_a ON conversations(participant_a_id,updated_at DESC); CREATE INDEX IF NOT EXISTS idx_conversations_participant_b ON conversations(participant_b_id,updated_at DESC)',
    );
    const measured = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url!, max: 4 }),
      log: [{ emit: 'event', level: 'query' }],
    });
    let queries = 0;
    measured.$on('query', () => {
      queries++;
    });
    const repository = createMessagingRepository(measured);
    const measurements: {
      operation: string;
      dataset: number;
      samples: number;
      p50Ms: number;
      p95Ms: number;
      queryCounts: number[];
    }[] = [];
    const sample = async (operation: string, dataset: number, run: () => Promise<unknown>) => {
      await run();
      const times: number[] = [],
        counts: number[] = [];
      for (let i = 0; i < 5; i++) {
        queries = 0;
        const start = performance.now();
        await run();
        times.push(performance.now() - start);
        counts.push(queries);
      }
      times.sort((a, b) => a - b);
      measurements.push({
        operation,
        dataset,
        samples: 5,
        p50Ms: Number(times[2]!.toFixed(2)),
        p95Ms: Number(times[4]!.toFixed(2)),
        queryCounts: counts,
      });
    };
    try {
      let last: { a: string; b: string; conversationId: string } | undefined;
      for (const size of [1, 10, 50, 100]) {
        const a = await user();
        let b = '',
          conversationId = '';
        for (let i = 0; i < size; i++) {
          b = await user();
          const ordered = [a, b].sort();
          conversationId = (
            await pool!.query<{ id: string }>(
              'INSERT INTO conversations(participant_a_id,participant_b_id) VALUES($1,$2) RETURNING id',
              ordered,
            )
          ).rows[0]!.id;
        }
        await sample('DIRECT inbox repository (not HTTP/JWT/socket)', size, () =>
          repository.list(a),
        );
        last = { a, b, conversationId };
      }
      const { a, b, conversationId } = last!;
      await measured.message.createMany({
        data: Array.from({ length: 1001 }, (_, i) => ({
          id: randomUUID(),
          conversationId,
          senderId: a,
          receiverId: b,
          ...messageEncryption.encrypt('Synthetic benchmark row ' + i),
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        })),
      });
      const anchor = (await repository.history(conversationId, 21, 50))[0]!;
      await sample('History latest 50', 1001, () => repository.history(conversationId, 1, 50));
      await sample('Cursor next 100', 1001, () =>
        repository.updates(conversationId, anchor.id, 100),
      );
      await sample('Unread count', 1001, () =>
        measured.message.count({ where: { conversationId, receiverId: b, readAt: null } }),
      );
      const start = performance.now();
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, (_, i) =>
          repository.send(
            {
              id: conversationId,
              participantAId: [a, b].sort()[0]!,
              participantBId: [a, b].sort()[1]!,
              contextId: null,
              contextType: 'DIRECT',
            },
            a,
            'Synthetic concurrent benchmark ' + i,
            randomUUID(),
          ),
        ),
      );
      const successes = results.filter((result) => result.status === 'fulfilled').length;
      const rejected = results
        .filter((result) => result.status === 'rejected')
        .map((result) => (result.reason as { code?: string }).code ?? 'UNKNOWN');
      assert.ok(rejected.every((code) => code === 'MESSAGING_CONCURRENCY_CONFLICT'));
      assert.equal(
        await count('SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1', [
          conversationId,
        ]),
        1001 + successes,
      );
      const output = join(tmpdir(), 'campusconnect-messaging-11f-legacy-benchmark.json');
      await writeFile(
        output,
        JSON.stringify(
          {
            evidence: 'VERIFIED — LOCAL DATABASE',
            host: '127.0.0.1',
            port: 5433,
            fixtureDatabase: new URL(url!).pathname.slice(1),
            poolMax: 4,
            method:
              'One warmup and five sequential measured samples; p95=max of five (coarse), not a capacity estimate',
            measurements,
            concurrentSends: {
              attempted: 4,
              persisted: successes,
              rejectedCodes: rejected,
              elapsedMs: Number((performance.now() - start).toFixed(2)),
            },
          },
          null,
          2,
        ),
      );
      console.log('Bounded synthetic performance evidence:', output);
    } finally {
      await measured.$disconnect();
    }
  },
);
void check('canonical DIRECT identity and concurrent reverse-pair creation', async () => {
  const a = await user(),
    b = await user();
  const rows = await Promise.all([direct(a, b), direct(b, a), direct(a, b), direct(b, a)]);
  assert.equal(new Set(rows.map((r) => r.id)).size, 1);
  assert.equal(rows[0].participantAId, [a, b].sort()[0]);
  assert.equal(
    await count('SELECT count(*)::int AS n FROM conversations WHERE id=$1', [rows[0].id]),
    1,
  );
});
for (const status of ['SUSPENDED', 'DEACTIVATED'])
  void check(
    status + ' actor/target cannot create or send; persisted history retained',
    async () => {
      const a = await user(),
        b = await user();
      const c = await direct(a, b);
      await send(a, c.id);
      await pool!.query('UPDATE users SET status=$2 WHERE id=$1', [b, status]);
      await denied(() => direct(awaitNever(), b));
      await denied(() => send(a, c.id));
      await denied(() => send(b, c.id));
      const fresh = await user();
      await denied(() => direct(fresh, b));
      await denied(() => direct(b, fresh));
      assert.equal(
        await count('SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1', [c.id]),
        1,
      );
    },
  );
function awaitNever(): string {
  return '00000000-0000-4000-8000-000000000099';
}
for (const status of ['SUSPENDED', 'DEACTIVATED'])
  void check('Marketplace rejects ' + status + ' seller', async () => {
    const seller = await user(status),
      buyer = await user(),
      id = await listing(seller);
    await denied(() =>
      messagingService.open(buyer, {
        contextType: ConversationType.MARKETPLACE,
        contextId: id,
        targetUserId: seller,
      }),
    );
    assert.equal(
      await count('SELECT count(*)::int AS n FROM conversations WHERE context_id=$1', [id]),
      0,
    );
  });
void check(
  'Marketplace ownership/status/visibility; historical conversation reuse after sale/hiding',
  async () => {
    const seller = await user(),
      buyer = await user(),
      other = await user(),
      id = await listing(seller);
    const input = {
      contextType: ConversationType.MARKETPLACE,
      contextId: id,
      targetUserId: seller,
    };
    await denied(() => messagingService.open(buyer, { ...input, targetUserId: other }));
    const c = await messagingService.open(buyer, input);
    await pool!.query(
      "UPDATE marketplace SET status='SOLD',moderation_visibility='HIDDEN' WHERE id=$1",
      [id],
    );
    assert.equal((await messagingService.open(buyer, input)).id, c.id);
    await denied(() => messagingService.open(other, input));
    assert.equal((await send(buyer, c.id)).conversationId, c.id);
    assert.equal((await messagingRepository.list(buyer))[0]!.contextPath, null);
  },
);
void check('TEAMUP requires actual members; historical reuse survives removal', async () => {
  const owner = await user(),
    member = await user(),
    other = await user(),
    id = randomUUID();
  await pool!.query(
    "INSERT INTO teamup(id,owner_id,title,members) VALUES($1,$2,'Synthetic project',$3)",
    [id, owner, JSON.stringify([{ userId: member }])],
  );
  const input = { contextType: ConversationType.TEAMUP, contextId: id, targetUserId: owner };
  await denied(() => messagingService.open(other, input));
  const c = await messagingService.open(member, input);
  await pool!.query("UPDATE teamup SET members='[]',moderation_visibility='HIDDEN' WHERE id=$1", [
    id,
  ]);
  assert.equal((await messagingService.open(member, input)).id, c.id);
  await send(member, c.id);
});
void check(
  'SERVICE exact accepted request pair, not listing ID; completed/archived history reuse',
  async () => {
    const provider = await user(),
      requester = await user(),
      third = await user(),
      id = randomUUID(),
      requestId = randomUUID();
    await pool!.query(
      "INSERT INTO services(id,provider_id,title,description,category,bookings) VALUES($1,$2,'Synthetic service','Synthetic description','Help',$3)",
      [
        id,
        provider,
        JSON.stringify([{ id: requestId, requesterId: requester, status: 'ACCEPTED' }]),
      ],
    );
    const input = {
      contextType: ConversationType.SERVICE,
      contextId: requestId,
      targetUserId: provider,
    };
    await denied(() => messagingService.open(third, input));
    await denied(() => messagingService.open(requester, { ...input, contextId: id }));
    const c = await messagingService.open(requester, input);
    assert.equal(c.contextId, requestId);
    await pool!.query(
      "UPDATE services SET status='ARCHIVED',moderation_visibility='HIDDEN' WHERE id=$1",
      [id],
    );
    assert.equal((await messagingService.open(requester, input)).id, c.id);
    await send(requester, c.id);
  },
);
void check('unsupported LOST_FOUND validator and cross-context identities', async () => {
  const a = await user(),
    b = await user(),
    id = await listing(b);
  assert.throws(() =>
    parseOpenConversation({ contextType: 'LOST_FOUND', contextId: id, targetUserId: b }),
  );
  const c = await direct(a, b),
    m = await messagingService.open(a, {
      contextType: ConversationType.MARKETPLACE,
      contextId: id,
      targetUserId: b,
    });
  assert.notEqual(c.id, m.id);
});
void check('encrypted concurrent sends and forged sender do not violate pair/context', async () => {
  const a = await user(),
    b = await user(),
    third = await user(),
    c = await direct(a, b);
  await denied(() => send(third, c.id), 'CONVERSATION_NOT_FOUND');
  const keys = Array.from({ length: 6 }, () => randomUUID());
  const attempts = await Promise.allSettled(
    keys.map((key, i) => send(i % 2 ? a : b, c.id, 'Synthetic ' + String(i), key)),
  );
  const rows = [];
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]!;
    if (attempt.status === 'fulfilled') rows.push(attempt.value);
    else {
      assert.equal((attempt.reason as { code: string }).code, 'MESSAGING_CONCURRENCY_CONFLICT');
      rows.push(await send(i % 2 ? a : b, c.id, 'Synthetic ' + String(i), keys[i]));
    }
  }
  assert.equal(new Set(rows.map((r) => r.id)).size, 6);
  const persisted = await pool!.query<{
    encrypted_content: Buffer;
    encryption_iv: Buffer;
    encryption_tag: Buffer;
    sender_id: string;
    receiver_id: string;
    context_type: string;
  }>('SELECT * FROM messages WHERE conversation_id=$1', [c.id]);
  for (const row of persisted.rows) {
    assert.equal(row.encrypted_content.includes(Buffer.from('Synthetic')), false);
    assert.equal(row.encryption_iv.length, 12);
    assert.equal(row.encryption_tag.length, 16);
    assert.ok(([a, b] as string[]).includes(row.sender_id));
    assert.ok(([a, b] as string[]).includes(row.receiver_id));
    assert.notEqual(row.sender_id, row.receiver_id);
    assert.equal(row.context_type, 'DIRECT');
  }
});
void check(
  'durable client ID concurrent retry returns one row, notification and event; changed payload/context/sender conflicts',
  async () => {
    const a = await user(),
      b = await user(),
      third = await user(),
      c = await direct(a, b),
      key = randomUUID();
    let emitted = 0,
      notices = 0;
    const onMessage = () => {
        emitted++;
      },
      onNotice = () => {
        notices++;
      };
    messagingEvents.on('message', onMessage);
    notificationEvents.on('created', onNotice);
    try {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => send(a, c.id, 'same payload', key)),
      );
      assert.deepEqual(new Set(responses.map((r) => r.id)), new Set([key]));
      assert.equal(await count('SELECT count(*)::int AS n FROM messages WHERE id=$1', [key]), 1);
      assert.equal(
        await count("SELECT count(*)::int AS n FROM notifications WHERE data->>'eventId'=$1", [
          key,
        ]),
        1,
      );
      assert.equal(emitted, 1);
      assert.equal(notices, 1);
      await denied(() => send(a, c.id, 'different payload', key), 'MESSAGE_IDEMPOTENCY_CONFLICT');
      await denied(() => send(b, c.id, 'same payload', key), 'MESSAGE_IDEMPOTENCY_CONFLICT');
      const other = await direct(a, third);
      await denied(() => send(a, other.id, 'same payload', key), 'MESSAGE_IDEMPOTENCY_CONFLICT');
    } finally {
      messagingEvents.off('message', onMessage);
      notificationEvents.off('created', onNotice);
    }
  },
);
void check(
  'legacy sends without client ID remain separate, never falsely claimed idempotent',
  async () => {
    const a = await user(),
      b = await user(),
      c = await direct(a, b);
    const first = await send(a, c.id),
      second = await send(a, c.id);
    assert.notEqual(first.id, second.id);
  },
);
void check('metadata and socket-listener failures after commit do not fail the send', async () => {
  const a = await user(),
    b = await user(),
    c = await direct(a, b),
    key = randomUUID();
  const metadata = mock.method(messagingRepository, 'notificationDetails', () =>
    Promise.reject(new Error('Synthetic failure')),
  );
  const fail = () => {
    throw new Error('Synthetic event failure');
  };
  messagingEvents.on('message', fail);
  try {
    assert.equal((await send(a, c.id, 'committed synthetic', key)).id, key);
    assert.equal(await count('SELECT count(*)::int AS n FROM messages WHERE id=$1', [key]), 1);
    assert.equal((await send(a, c.id, 'committed synthetic', key)).id, key);
  } finally {
    metadata.mock.restore();
    messagingEvents.off('message', fail);
  }
});
void check(
  'exact latest page receipt excludes older and newly arriving messages; overlapping acknowledgments idempotent',
  async () => {
    const a = await user(),
      b = await user(),
      c = await direct(a, b);
    for (let i = 0; i < 7; i++) await send(a, c.id, 'Synthetic ' + String(i));
    const latest = await messagingService.historyPage(b, c.id, 1, 3);
    const after = await send(a, c.id, 'arrived after fetch');
    await Promise.all([
      messagingService.markRead(b, c.id, latest.readReceipt),
      messagingService.markRead(b, c.id, latest.readReceipt),
    ]);
    assert.equal(
      await count(
        'SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1 AND read_at IS NULL',
        [c.id],
      ),
      5,
    );
    assert.equal(
      await count('SELECT count(*)::int AS n FROM messages WHERE id=$1 AND read_at IS NULL', [
        after.id,
      ]),
      1,
    );
    assert.equal((await messagingService.list(b, {})).unread.total, 5);
    const older = await messagingService.historyPage(b, c.id, 3, 3);
    await messagingService.markRead(b, c.id, older.readReceipt);
    assert.equal(
      await count(
        'SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1 AND read_at IS NOT NULL',
        [c.id],
      ),
      5,
    );
  },
);
void check(
  'receipt rejects missing, forged, wrong-user and wrong-conversation acknowledgment; empty fetch safe',
  async () => {
    const a = await user(),
      b = await user(),
      third = await user(),
      c = await direct(a, b),
      other = await direct(a, third);
    const empty = await messagingService.historyPage(b, c.id, 1, 50);
    assert.equal((await messagingService.markRead(b, c.id, empty.readReceipt)).updated, 0);
    await send(a, c.id);
    const page = await messagingService.historyPage(b, c.id, 1, 50);
    await denied(() => messagingService.markRead(b, c.id, undefined));
    await denied(() => messagingService.markRead(b, c.id, page.readReceipt + 'x'));
    await denied(() => messagingService.markRead(a, c.id, page.readReceipt));
    await denied(() => messagingService.markRead(a, other.id, page.readReceipt));
    await denied(
      () => messagingService.markRead(third, c.id, page.readReceipt),
      'CONVERSATION_NOT_FOUND',
    );
    assert.equal(
      await count(
        'SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1 AND read_at IS NULL',
        [c.id],
      ),
      1,
    );
  },
);
for (const state of ['VISIBLE', 'HIDDEN', 'SUSPENDED', 'DEACTIVATED'])
  void check('identity projection ' + state + ' and cached notification redaction', async () => {
    const a = await user(),
      b = await user(),
      c = await direct(a, b);
    await send(b, c.id);
    if (state === 'HIDDEN')
      await pool!.query("UPDATE profiles SET moderation_visibility='HIDDEN' WHERE user_id=$1", [b]);
    if (['SUSPENDED', 'DEACTIVATED'].includes(state))
      await pool!.query('UPDATE users SET status=$2 WHERE id=$1', [b, state]);
    const inbox = await messagingRepository.list(a),
      person = inbox.find((row) => row.id === c.id)!.otherParticipant;
    assert.equal(person.id, b);
    if (state === 'VISIBLE') {
      assert.equal(person.displayName, 'Synthetic private name');
    } else {
      assert.equal(person.displayName, 'CampusConnect student');
      assert.equal(person.avatar, null);
      assert.equal(person.department, null);
    }
    const notice = await notificationsRepository.list(a, 1, 20, false);
    assert.equal(notice.items[0]!.title, 'New message');
    assert.equal(notice.items[0]!.description, null);
    const details = await messagingRepository.notificationDetails(c, b);
    if (state !== 'VISIBLE') assert.equal(details.senderName, 'CampusConnect student');
  });
void check(
  'real HTTP controller validates receipt, body, owner identity and participant access',
  async () => {
    const a = await user(),
      b = await user(),
      third = await user(),
      c = await direct(a, b);
    await send(a, c.id);
    await withMessagingHttp(async (base) => {
      const call = (path: string, actor: string, method = 'GET', body?: unknown) =>
        fetch(base + '/api/messages' + path, {
          method,
          headers: { authorization: 'Bearer ' + actor, 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      assert.equal((await call('/' + c.id, third)).status, 404);
      const response = await call('/' + c.id, b);
      const page = (await response.json()) as {
        data: { readReceipt: string; messages: unknown[] };
      };
      assert.equal(response.status, 200);
      assert.equal(page.data.messages.length, 1);
      const durable = randomUUID();
      const post = () =>
        call('/' + c.id, a, 'POST', { text: 'Synthetic HTTP retry', clientMessageId: durable });
      const first = await post(),
        second = await post();
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      const payload = (await second.json()) as { data: { message: { id: string } } };
      assert.equal(payload.data.message.id, durable);
      assert.equal(
        (await call('/' + c.id, a, 'POST', { text: 'Different retry', clientMessageId: durable }))
          .status,
        409,
      );

      assert.equal((await call('/' + c.id + '/read', b, 'PATCH')).status, 400);
      assert.equal(
        (await call('/' + c.id + '/read', b, 'PATCH', { readReceipt: page.data.readReceipt }))
          .status,
        200,
      );
      assert.equal((await call('/' + c.id, a, 'POST', { text: 'x', senderId: third })).status, 400);
      assert.equal(
        (
          await call('/conversations', a, 'POST', {
            contextType: 'LOST_FOUND',
            contextId: randomUUID(),
            targetUserId: b,
          })
        ).status,
        400,
      );
    });
  },
);
void check(
  'database-backed socket recipients are revalidated after suspension across both sessions',
  async () => {
    const a = await user(),
      server = createServer();
    const io = attachMessagingSocket(
      server,
      async (token) => {
        const row = await db!.user.findUnique({ where: { id: token }, select: { status: true } });
        if (row?.status !== 'ACTIVE') throw new Error('Unavailable');
        return { userId: token, expiresAt: Date.now() + 60_000 };
      },
      30_000,
    );
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const sockets = [
      connect('http://127.0.0.1:' + String(address.port), {
        auth: { token: a },
        transports: ['websocket'],
      }),
      connect('http://127.0.0.1:' + String(address.port), {
        auth: { token: a },
        transports: ['websocket'],
      }),
    ];
    const once = (socket: (typeof sockets)[number], event: string) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Socket timeout')), 2000);
        socket.once(event, () => {
          clearTimeout(timer);
          resolve();
        });
      });
    try {
      await Promise.all(sockets.map((socket) => once(socket, 'connect')));
      let delivered = 0;
      sockets.forEach((socket) =>
        socket.on('message:new', () => {
          delivered++;
        }),
      );
      await pool!.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [a]);
      const disconnected = sockets.map((socket) => once(socket, 'disconnect'));
      messagingEvents.emit(
        'message',
        {
          id: randomUUID(),
          conversationId: randomUUID(),
          senderId: a,
          sentAt: new Date().toISOString(),
          read: false,
          text: 'Synthetic revoked delivery',
        },
        [a],
      );
      await Promise.all(disconnected);
      assert.equal(delivered, 0);
    } finally {
      sockets.forEach((socket) => socket.disconnect());
      await new Promise<void>((done) => {
        void io.close(() => done());
      });
    }
  },
);

const snapshotGate = () => {
  let reached!: () => void,
    release!: () => void,
    first = true;
  const snapshot = new Promise<void>((resolve) => {
      reached = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  const client = db!.$extends({
    query: {
      conversation: {
        findUnique: async ({ args, query }) => {
          const row = await query(args);
          if (first) {
            first = false;
            reached();
            await gate;
          }
          return row;
        },
      },
    },
  });
  return {
    repository: createMessagingRepository(client as unknown as PrismaClient),
    snapshot,
    release,
  };
};
for (const change of [
  'target-suspended',
  'actor-deactivated',
  'listing-hidden',
  'team-member-removed',
  'service-request-rejected',
])
  void check(
    'creation rechecks ' + change + ' committed after authoritative snapshot',
    async () => {
      const a = await user(),
        b = await user();
      let input = {
        contextType: ConversationType.DIRECT as ConversationType,
        contextId: null as string | null,
        targetUserId: b,
      };
      let mutate: () => Promise<unknown>;
      if (change === 'listing-hidden') {
        const id = await listing(b);
        input = { ...input, contextType: ConversationType.MARKETPLACE, contextId: id };
        mutate = () =>
          pool!.query("UPDATE marketplace SET moderation_visibility='HIDDEN' WHERE id=$1", [id]);
      } else if (change === 'team-member-removed') {
        const id = randomUUID();
        await pool!.query(
          "INSERT INTO teamup(id,owner_id,title,members) VALUES($1,$2,'Synthetic project',$3)",
          [id, b, JSON.stringify([{ userId: a }])],
        );
        input = { ...input, contextType: ConversationType.TEAMUP, contextId: id };
        mutate = () => pool!.query("UPDATE teamup SET members='[]' WHERE id=$1", [id]);
      } else if (change === 'service-request-rejected') {
        const id = randomUUID(),
          requestId = randomUUID();
        await pool!.query(
          "INSERT INTO services(id,provider_id,title,description,category,bookings) VALUES($1,$2,'Synthetic service','Synthetic description','Help',$3)",
          [id, b, JSON.stringify([{ id: requestId, requesterId: a, status: 'ACCEPTED' }])],
        );
        input = { ...input, contextType: ConversationType.SERVICE, contextId: requestId };
        mutate = () =>
          pool!.query('UPDATE services SET bookings=$2 WHERE id=$1', [
            id,
            JSON.stringify([{ id: requestId, requesterId: a, status: 'REJECTED' }]),
          ]);
      } else
        mutate = () =>
          pool!.query('UPDATE users SET status=$2 WHERE id=$1', [
            change === 'target-suspended' ? b : a,
            change === 'target-suspended' ? 'SUSPENDED' : 'DEACTIVATED',
          ]);
      const gate = snapshotGate();
      const pending = gate.repository.open(a, input);
      const outcome = denied(() => pending, 'MESSAGING_NOT_ALLOWED');
      try {
        await gate.snapshot;
        await mutate();
      } finally {
        gate.release();
      }
      await outcome;
      assert.equal(
        await count(
          'SELECT count(*)::int AS n FROM conversations WHERE participant_a_id=$1 AND participant_b_id=$2',
          [...[a, b].sort()],
        ),
        0,
      );
    },
  );
void check('concurrent first snapshots preserve unique conversation under retry', async () => {
  const a = await user(),
    b = await user(),
    left = snapshotGate(),
    right = snapshotGate();
  const first = left.repository.open(a, {
    contextType: ConversationType.DIRECT,
    contextId: null,
    targetUserId: b,
  });
  const second = right.repository.open(b, {
    contextType: ConversationType.DIRECT,
    contextId: null,
    targetUserId: a,
  });
  await Promise.all([left.snapshot, right.snapshot]);
  left.release();
  right.release();
  assert.equal((await first).id, (await second).id);
  assert.equal(
    await count(
      'SELECT count(*)::int AS n FROM conversations WHERE participant_a_id=$1 AND participant_b_id=$2',
      [...[a, b].sort()],
    ),
    1,
  );
});
for (const failures of [1, 5])
  void check(
    'real serialization ' +
      (failures === 1 ? 'retry commits once' : 'exhaustion rolls back with 409'),
    async () => {
      const a = await user(),
        b = await user(),
        c = await direct(a, b),
        key = randomUUID(),
        suffix = randomUUID().replaceAll('-', ''),
        sequence = 'msg_seq_' + suffix,
        fn = 'msg_fn_' + suffix,
        trigger = 'msg_trigger_' + suffix;
      assert.match(key, /^[a-f0-9-]+$/);
      await pool!.query(
        `CREATE SEQUENCE ${sequence};CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${key}'::uuid THEN IF nextval('${sequence}')<=${failures} THEN RAISE EXCEPTION 'Synthetic serialization failure' USING ERRCODE='40001';END IF;END IF;RETURN NEW;END $$;CREATE TRIGGER ${trigger} BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION ${fn}();`,
      );
      try {
        if (failures === 1) {
          assert.equal((await send(a, c.id, 'Synthetic retry', key)).id, key);
          assert.equal(
            await count('SELECT count(*)::int AS n FROM messages WHERE id=$1', [key]),
            1,
          );
          assert.equal(
            await count("SELECT count(*)::int AS n FROM notifications WHERE data->>'eventId'=$1", [
              key,
            ]),
            1,
          );
        } else {
          await withMessagingHttp(async (base) => {
            const response = await fetch(base + '/api/messages/' + c.id, {
              method: 'POST',
              headers: { authorization: 'Bearer ' + a, 'content-type': 'application/json' },
              body: JSON.stringify({ text: 'Synthetic retry', clientMessageId: key }),
            });
            assert.equal(response.status, 409);
            const body = (await response.json()) as { error: { code: string } };
            assert.equal(body.error.code, 'MESSAGING_CONCURRENCY_CONFLICT');
          });
          assert.equal(
            await count('SELECT count(*)::int AS n FROM messages WHERE id=$1', [key]),
            0,
          );
          assert.equal(
            await count("SELECT count(*)::int AS n FROM notifications WHERE data->>'eventId'=$1", [
              key,
            ]),
            0,
          );
        }
        assert.equal(
          Number(
            (await pool!.query<{ last_value: string }>(`SELECT last_value FROM ${sequence}`))
              .rows[0]!.last_value,
          ),
          failures === 1 ? 2 : 3,
        );
      } finally {
        await pool!.query(
          `DROP TRIGGER ${trigger} ON messages;DROP FUNCTION ${fn}();DROP SEQUENCE ${sequence};`,
        );
      }
    },
  );

for (const type of ['MARKETPLACE', 'TEAMUP', 'SERVICE'] as const)
  void check(type + ' hidden-profile and moderated-context projections', async () => {
    const a = await user(),
      b = await user();
    let id = randomUUID();
    if (type === 'MARKETPLACE') id = await listing(b);
    if (type === 'TEAMUP')
      await pool!.query(
        "INSERT INTO teamup(id,owner_id,title,members) VALUES($1,$2,'Synthetic project',$3)",
        [id, b, JSON.stringify([{ userId: a }])],
      );
    if (type === 'SERVICE') {
      const serviceId = randomUUID();
      await pool!.query(
        "INSERT INTO services(id,provider_id,title,description,category,bookings) VALUES($1,$2,'Synthetic service','Synthetic description','Help',$3)",
        [serviceId, b, JSON.stringify([{ id, requesterId: a, status: 'COMPLETED' }])],
      );
    }
    const c = await messagingService.open(a, { contextType: type, contextId: id, targetUserId: b });
    await pool!.query("UPDATE profiles SET moderation_visibility='HIDDEN' WHERE user_id=$1", [b]);
    const projection = (await messagingRepository.list(a)).find((row) => row.id === c.id)!;
    assert.equal(projection.otherParticipant.displayName, 'CampusConnect student');
    assert.equal(projection.otherParticipant.avatar, null);
    assert.equal(projection.otherParticipant.department, null);
    if (type === 'MARKETPLACE')
      await pool!.query("UPDATE marketplace SET moderation_visibility='HIDDEN' WHERE id=$1", [id]);
    if (type === 'TEAMUP')
      await pool!.query("UPDATE teamup SET moderation_visibility='HIDDEN' WHERE id=$1", [id]);
    if (type === 'SERVICE')
      await pool!.query(
        "UPDATE services SET moderation_visibility='HIDDEN' WHERE bookings @> $1::jsonb",
        [JSON.stringify([{ id }])],
      );
    const redacted = (await messagingRepository.list(a)).find((row) => row.id === c.id)!;
    assert.equal(redacted.contextPath, null);
    assert.doesNotMatch(redacted.contextLabel, /Synthetic/);
  });
void check(
  'default latest fifty acknowledgment leaves five older and a concurrent new message unread',
  async () => {
    const a = await user(),
      b = await user(),
      c = await direct(a, b);
    for (let i = 0; i < 55; i++) await send(a, c.id, 'Synthetic page ' + String(i));
    const fetched = await messagingService.historyPage(b, c.id, 1, 50);
    assert.equal(fetched.messages.length, 50);
    const newer = await send(a, c.id, 'Concurrent arrival');
    assert.equal((await messagingService.markRead(b, c.id, fetched.readReceipt)).updated, 50);
    assert.equal((await messagingService.list(b, {})).unread.total, 6);
    assert.equal(
      await count('SELECT count(*)::int AS n FROM messages WHERE id=$1 AND read_at IS NULL', [
        newer.id,
      ]),
      1,
    );
  },
);

void check(
  'cursor recovery covers 235 persisted messages, equal timestamps and concurrent inserts without gaps',
  async () => {
    const a = await user(),
      b = await user(),
      c = await direct(a, b);
    const baseline = await send(a, c.id, 'baseline');
    const encrypted = messageEncryption.encrypt('Synthetic recovery content');
    const insert = async (n: number) => {
      await pool!.query(
        `INSERT INTO messages(id,conversation_id,sender_id,receiver_id,encrypted_content,encryption_iv,encryption_tag,encryption_version,created_at)
      SELECT gen_random_uuid(),$1,$2,$3,$4,$5,$6,1,'2099-01-01T00:00:00.123456Z'::timestamptz FROM generate_series(1,$7)`,
        [
          c.id,
          a,
          b,
          Buffer.from(encrypted.encryptedContent),
          Buffer.from(encrypted.encryptionIv),
          Buffer.from(encrypted.encryptionTag),
          n,
        ],
      );
    };
    await insert(235);
    const first = await messagingService.updates(b, c.id, baseline.id, 100);
    assert.equal(first.messages.length, 100);
    assert.equal(first.hasMore, true);
    // Insert a later timestamp during pagination; all equal-timestamp UUIDs already existed.
    const extra = await send(a, c.id, 'Concurrent later insert');
    await pool!.query("UPDATE messages SET created_at='2099-01-02T00:00:00.000001Z' WHERE id=$1", [
      extra.id,
    ]);
    const second = await messagingService.updates(b, c.id, first.nextCursor, 100);
    const third = await messagingService.updates(b, c.id, second.nextCursor, 100);
    const ids = [...first.messages, ...second.messages, ...third.messages].map((m) => m.id);
    const expected = (
      await pool!.query<{ id: string }>(
        'SELECT id FROM messages WHERE conversation_id=$1 AND id<>$2 ORDER BY created_at,id',
        [c.id, baseline.id],
      )
    ).rows.map((m) => m.id);
    assert.deepEqual(ids, expected);
    assert.equal(new Set(ids).size, 236);
    assert.equal(third.hasMore, false);
    assert.equal((await messagingService.markRead(b, c.id, first.readReceipt)).updated, 100);
    assert.equal(
      await count(
        'SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1 AND read_at IS NULL',
        [c.id],
      ),
      137,
    );
    assert.equal(
      (await messagingService.updates(b, c.id, third.nextCursor, 100)).messages.length,
      0,
    );
  },
);

void check(
  'recovery HTTP enforces participants, cursor identity, page bounds and ACTIVE status',
  async () => {
    const a = await user(),
      b = await user(),
      stranger = await user(),
      c = await direct(a, b),
      other = await direct(a, stranger);
    const baseline = await send(a, c.id),
      foreign = await send(a, other.id);
    await withMessagingHttp(async (base) => {
      const get = (actor: string, tail: string) =>
        fetch(base + '/api/messages/' + c.id + '/updates?' + tail, {
          headers: { authorization: 'Bearer ' + actor },
        });
      assert.equal((await get(b, 'after=' + baseline.id + '&limit=100')).status, 200);
      assert.equal((await get(stranger, 'after=' + baseline.id)).status, 404);
      assert.equal((await get(b, 'after=' + foreign.id)).status, 400);
      assert.equal((await get(b, 'after=' + baseline.id + '&limit=101')).status, 400);
      assert.equal((await get(b, 'after=bad')).status, 400);
      await pool!.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [b]);
      assert.equal((await get(b, 'after=' + baseline.id)).status, 403);
    });
  },
);

void check(
  'read invalidation is post-persistence, reader-only, content-free and idempotent',
  async () => {
    const a = await user(),
      b = await user(),
      c = await direct(a, b);
    await send(a, c.id);
    const page = await messagingService.historyPage(b, c.id, 1, 50);
    const events: unknown[] = [];
    const listener = (value: { conversationId: string }, ids: readonly string[]) =>
      events.push({ value, ids });
    messagingEvents.on('read', listener);
    try {
      assert.equal((await messagingService.markRead(b, c.id, page.readReceipt)).updated, 1);
      assert.deepEqual(events, [{ value: { conversationId: c.id }, ids: [b] }]);
      assert.equal(
        await count(
          'SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1 AND read_at IS NOT NULL',
          [c.id],
        ),
        1,
      );
      await messagingService.markRead(b, c.id, page.readReceipt);
      assert.equal(events.length, 1);
    } finally {
      messagingEvents.off('read', listener);
    }
  },
);

void check(
  '11F bounded inbox pages, encrypted scope cursors, search, totals, redaction and deep links',
  async () => {
    const a = await user(),
      b = await user(),
      outsider = await user();
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      const peer = i === 0 ? b : await user();
      const c = await direct(a, peer);
      ids.push(c.id);
      await send(peer, c.id);
    }
    await pool!.query(
      "UPDATE conversations SET updated_at='2026-01-01' WHERE participant_a_id=$1 OR participant_b_id=$1",
      [a],
    );
    const first = await messagingService.list(a, { limit: 3 });
    assert.equal(first.conversations.length, 3);
    assert.equal(first.unread.total, 7);
    assert.ok(first.nextCursor);
    const firstCursor = first.nextCursor;
    const second = await messagingService.list(a, { limit: 3, cursor: firstCursor });
    const third = await messagingService.list(a, { limit: 3, cursor: second.nextCursor! });
    const all = [...first.conversations, ...second.conversations, ...third.conversations];
    assert.equal(new Set(all.map((row) => row.id)).size, 7);
    assert.equal(third.nextCursor, null);
    assert.deepEqual(
      all.map((row) => row.id),
      [...ids].sort().reverse(),
    );
    await denied(
      () => messagingService.list(outsider, { cursor: firstCursor }),
      'INVALID_INBOX_CURSOR',
    );
    await denied(
      () => messagingService.list(a, { cursor: firstCursor, contextType: ConversationType.TEAMUP }),
      'INVALID_INBOX_CURSOR',
    );
    await denied(
      () => messagingService.list(a, { cursor: firstCursor + 'x' }),
      'INVALID_INBOX_CURSOR',
    );
    const selected = await messagingService.list(a, { limit: 1, selected: ids[0]! });
    assert.equal(selected.selectedConversation?.id, ids[0]);
    assert.equal(
      (await messagingService.list(outsider, { selected: ids[0]! })).selectedConversation,
      undefined,
    );
    await pool!.query("UPDATE profiles SET full_name='OnlyVisibleSearch' WHERE user_id=$1", [b]);
    assert.equal(
      (await messagingService.list(a, { search: 'onlyvisiblesearch' })).conversations.length,
      1,
    );
    await pool!.query("UPDATE profiles SET moderation_visibility='HIDDEN' WHERE user_id=$1", [b]);
    assert.equal(
      (await messagingService.list(a, { search: 'onlyvisiblesearch' })).conversations.length,
      0,
    );
    assert.equal(
      (await messagingService.list(a, { search: 'CampusConnect student' })).conversations.length,
      1,
    );
    assert.equal(
      (await messagingService.list(a, { contextType: ConversationType.TEAMUP })).conversations
        .length,
      0,
    );
    // A row becoming active above an existing page cursor returns on authoritative refresh, not twice within this scan.
    await send(b, ids[0]!);
    assert.equal((await messagingService.list(a, { limit: 1 })).conversations[0]?.id, ids[0]);
  },
);

void check(
  '11F multiple late commits, equal timestamp ordering and repeated recent reconciliation preserve identities',
  async () => {
    const a = await user(),
      b = await user(),
      c = await direct(a, b);
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push((await send(a, c.id)).id);
    await pool!.query("UPDATE messages SET created_at='2026-01-01' WHERE conversation_id=$1", [
      c.id,
    ]);
    const first = await messagingService.updates(b, c.id, 'start', 2, true);
    const second = await messagingService.updates(b, c.id, first.nextCursor, 2, true);
    const third = await messagingService.updates(b, c.id, second.nextCursor, 2, true);
    assert.deepEqual(
      [...first.messages, ...second.messages, ...third.messages].map((row) => row.id),
      [...ids].sort().reverse(),
    );
    const late = await pool!.connect();
    try {
      await late.query('BEGIN');
      const delayed = [randomUUID(), randomUUID()];
      for (const id of delayed) {
        const e = messageEncryption.encrypt('Synthetic delayed');
        await late.query(
          "INSERT INTO messages(id,conversation_id,sender_id,receiver_id,encrypted_content,encryption_iv,encryption_tag,encryption_version,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,1,'2025-01-01')",
          [
            id,
            c.id,
            a,
            b,
            Buffer.from(e.encryptedContent),
            Buffer.from(e.encryptionIv),
            Buffer.from(e.encryptionTag),
          ],
        );
      }
      const before = await messagingService.updates(b, c.id, 'start', 100, true);
      assert.equal(before.messages.length, 6);
      await late.query('COMMIT');
      const after = await messagingService.updates(b, c.id, 'start', 100, true);
      assert.equal(after.messages.length, 8);
      for (const id of delayed) assert.ok(after.messages.some((row) => row.id === id));
      const visible = new Map(
        [...before.messages, ...after.messages, ...after.messages].map((row) => [row.id, row]),
      );
      assert.equal(visible.size, 8);
    } finally {
      await late.query('ROLLBACK');
      late.release();
    }
    const other = await direct(a, await user());
    await denied(
      () => messagingService.updates(b, other.id, 'start', 100, true),
      'CONVERSATION_NOT_FOUND',
    );
    await denied(
      () => messagingService.updates(b, c.id, randomUUID(), 100, true),
      'INVALID_HISTORY_CURSOR',
    );
  },
);

void check(
  '11F same-dataset 10/100/500 inbox performance before and after bounded batching',
  async () => {
    const measured = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url!, max: 4 }),
      log: [{ emit: 'event', level: 'query' }],
    });
    let queries = 0;
    measured.$on('query', () => queries++);
    const repo = createMessagingRepository(measured);
    const results: unknown[] = [];
    try {
      for (const size of [10, 100, 500]) {
        const a = await user();
        const peers = (
          await pool!.query<{ id: string }>(
            'INSERT INTO users(id) SELECT gen_random_uuid() FROM generate_series(1,$1) RETURNING id',
            [size],
          )
        ).rows.map((row) => row.id);
        await pool!.query(
          "INSERT INTO profiles(user_id,full_name) SELECT unnest($1::uuid[]),'Synthetic benchmark peer'",
          [peers],
        );
        await pool!.query(
          'INSERT INTO conversations(participant_a_id,participant_b_id) SELECT least($1::uuid,p),greatest($1::uuid,p) FROM unnest($2::uuid[]) p',
          [a, peers],
        );
        const records = await measured.conversation.findMany({
          where: { OR: [{ participantAId: a }, { participantBId: a }] },
        });
        await measured.message.createMany({
          data: records.map((row) => ({
            conversationId: row.id,
            senderId: row.participantAId === a ? row.participantBId : row.participantAId,
            receiverId: a,
            ...messageEncryption.encrypt('Synthetic benchmark latest message'),
          })),
        });
        // Exact former DIRECT query pattern: unbounded relation load + one unread query per row.
        const before = async () => {
          const rows = await measured.conversation.findMany({
            where: { OR: [{ participantAId: a }, { participantBId: a }] },
            include: {
              participantA: {
                select: {
                  id: true,
                  status: true,
                  profile: {
                    select: {
                      fullName: true,
                      avatar: true,
                      department: true,
                      moderationVisibility: true,
                    },
                  },
                },
              },
              participantB: {
                select: {
                  id: true,
                  status: true,
                  profile: {
                    select: {
                      fullName: true,
                      avatar: true,
                      department: true,
                      moderationVisibility: true,
                    },
                  },
                },
              },
              messages: { take: 1, orderBy: { createdAt: 'desc' } },
            },
            orderBy: { updatedAt: 'desc' },
          });
          const unreadCounts = await Promise.all(
            rows.map((row) =>
              measured.message.count({
                where: { conversationId: row.id, receiverId: a, readAt: null },
              }),
            ),
          );
          return {
            conversations: rows.map((row, i) => ({
              id: row.id,
              contextId: row.contextId,
              contextType: row.contextType,
              contextLabel: 'Direct',
              contextPath: null,
              createdAt: row.createdAt.toISOString(),
              updatedAt: row.updatedAt.toISOString(),
              unreadCount: unreadCounts[i] ?? 0,
              otherParticipant: servicePerson(
                row.participantAId === a ? row.participantB : row.participantA,
              ),
              lastMessage: row.messages[0]
                ? {
                    id: row.messages[0].id,
                    conversationId: row.id,
                    senderId: row.messages[0].senderId,
                    sentAt: row.messages[0].createdAt.toISOString(),
                    read: row.messages[0].readAt !== null,
                    text: messageEncryption.decrypt(row.messages[0]),
                  }
                : null,
            })),
            unread: {
              byContext: {
                DIRECT: unreadCounts.reduce((sum, n) => sum + n, 0),
                MARKETPLACE: 0,
                TEAMUP: 0,
                SERVICE: 0,
              },
              total: unreadCounts.reduce((sum, n) => sum + n, 0),
            },
          };
        };
        for (const [label, run] of [
          ['before', before],
          ['after', () => repo.inbox(a, { limit: 30 })],
        ] as const) {
          await run();
          const times: number[] = [],
            counts: number[] = [];
          let payload = 0,
            returned = 0;
          for (let i = 0; i < 5; i++) {
            queries = 0;
            const start = performance.now();
            const value = await run();
            times.push(performance.now() - start);
            counts.push(queries);
            payload = Buffer.byteLength(
              JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? String(v) : v)),
            );
            returned = Array.isArray(value) ? value.length : value.conversations.length;
          }
          times.sort((a, b) => a - b);
          results.push({
            label,
            dataset: size,
            queryCounts: counts,
            repositoryP50Ms: times[2],
            repositoryP95Ms: times[4],
            repositorySerializedBytes: payload,
            returned,
          });
          if (label === 'after') {
            assert.ok(counts.every((n) => n <= 10));
            assert.ok(returned <= 30);
            assert.ok(payload < 300_000);
          }
        }
        for (const label of ['before', 'after']) {
          const legacy =
            label === 'before' ? mock.method(messagingRepository, 'inbox', before) : undefined;
          try {
            await withMessagingHttp(async (base) => {
              const times: number[] = [];
              let bytes = 0;
              for (let i = 0; i < 5; i++) {
                const start = performance.now();
                const response = await fetch(base + '/api/messages', {
                  headers: { authorization: 'Bearer ' + a },
                });
                assert.equal(response.status, 200);
                const text = await response.text();
                bytes = Buffer.byteLength(text);
                assert.equal(
                  (JSON.parse(text) as { data: { conversations: unknown[] } }).data.conversations
                    .length,
                  label === 'before' ? size : Math.min(size, 30),
                );
                times.push(performance.now() - start);
              }
              times.sort((a, b) => a - b);
              results.push({
                label: label + ' HTTP including auth/DTO',
                dataset: size,
                p50Ms: times[2],
                p95Ms: times[4],
                responseBytes: bytes,
              });
            });
          } finally {
            legacy?.mock.restore();
          }
        }
      }
      await writeFile(
        join(tmpdir(), 'campusconnect-messaging-11f-performance.json'),
        JSON.stringify(
          {
            method:
              'same synthetic DIRECT datasets, warmup plus five sequential samples; p95 is coarse maximum, no production concurrency extrapolation',
            results,
          },
          null,
          2,
        ),
      );
    } finally {
      await measured.$disconnect();
    }
  },
);

void check(
  '11F recent reconciliation has a 1000-row client horizon and validates loaded-window boundaries',
  async () => {
    const a = await user(),
      b = await user(),
      c = await direct(a, b),
      foreign = await direct(a, await user());
    const rows = Array.from({ length: 1101 }, (_, i) => ({
      id: randomUUID(),
      conversationId: c.id,
      senderId: a,
      receiverId: b,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      ...messageEncryption.encrypt('Synthetic bounded history ' + i),
    }));
    await db!.message.createMany({ data: rows });
    let cursor = 'start';
    const visible = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const page = await messagingService.updates(b, c.id, cursor, 100, true);
      page.messages.forEach((row) => visible.add(row.id));
      cursor = page.nextCursor;
      if (i === 9) assert.equal(page.hasMore, true);
    }
    assert.equal(visible.size, 1000);
    assert.equal(visible.has(rows[0]!.id), false);
    assert.ok(
      (await messagingService.historyPage(b, c.id, 12, 100)).messages.some(
        (row) => row.id === rows[0]!.id,
      ),
      'Older history remains accessible; recent overlap does not guarantee arbitrarily old commits.',
    );
    const window = await messagingService.updates(b, c.id, 'start', 100, true, rows[1090]!.id);
    assert.equal(window.messages.length, 11);
    assert.equal(window.hasMore, false);
    const outsiderRow = await send(a, foreign.id);
    await denied(
      () => messagingService.updates(b, c.id, 'start', 100, true, outsiderRow.id),
      'INVALID_HISTORY_CURSOR',
    );
  },
);
