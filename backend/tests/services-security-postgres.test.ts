import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import express from 'express';
import { PrismaClient, ServiceStatus, UserRole } from '../src/generated/prisma/client.js';
import { prisma } from '../src/database/prisma.js';
import { createServicesRepository } from '../src/modules/services/services.repository.js';
import { createServicesService } from '../src/modules/services/services.service.js';
import { parseServiceQuery } from '../src/modules/services/services.validation.js';
import {
  canStartServiceConversation,
  openServiceConversation,
} from '../src/modules/services/services-messaging.js';
import { searchRepository } from '../src/modules/search/search.repository.js';
import { messagingRepository } from '../src/modules/messaging/messaging.repository.js';
import { createAuthenticationMiddleware } from '../src/modules/auth/auth.middleware.js';
import { createServicesRouter } from '../src/modules/services/services.routes.js';
import { createServicesController } from '../src/modules/services/services.controller.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { withTestServer } from './helpers/test-server.js';
import { AppError } from '../src/errors/app-error.js';
import { messagingController } from '../src/modules/messaging/messaging.controller.js';
import { notificationsService } from '../src/modules/notifications/notifications.service.js';
import { notificationsRepository } from '../src/modules/notifications/notifications.repository.js';
import type {
  ServiceView,
  ServiceRequestRecord,
  ServicesWorkspace,
} from '../src/modules/services/services.types.js';

const url = process.env.SERVICES_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '5433');
  assert.equal(parsed.username, 'postgres');
  assert.equal(parsed.search, '');
  assert.match(parsed.pathname, /^\/campusconnect_services_test_[a-z0-9_]+$/);
  assert.equal(
    process.env.DATABASE_URL,
    url,
    'Pin all imported application clients to this isolated database.',
  );
}
const pool = url ? new Pool({ connectionString: url }) : null;
const db = url ? new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }) : null;
const repository = db ? createServicesRepository(db) : null;
before(async () => {
  if (!pool) return;
  const identity = (
    await pool.query<{ database: string; address: string; port: number; version: string }>(
      "SELECT current_database() AS database,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version') AS version",
    )
  ).rows[0]!;
  assert.match(identity.database, /^campusconnect_services_test_[a-z0-9_]+$/);
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
  test('Services PostgreSQL: ' + name, { skip: !url }, run);

/** Production middleware/controllers/repositories; only identity verification is an offline fixture. */
const withServicesHttp = async (
  actors: ReadonlyMap<string, UserRole>,
  run: (base: string) => Promise<void>,
) => {
  const authentication = createAuthenticationMiddleware({
    verifyAccessToken: (token) => {
      if (!actors.has(token))
        throw new AppError({
          code: 'INVALID_TOKEN',
          message: 'Invalid test identity.',
          statusCode: 401,
        });
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
              emailVerifiedAt: new Date(),
              role: actors.get(id) ?? UserRole.STUDENT,
              status: row.status,
              profile: null,
            }
          : null;
      },
    },
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/services',
    createServicesRouter({
      authentication,
      controller: createServicesController(
        createServicesService(repository!, notificationsService),
      ),
    }),
  );
  const messages = express.Router();
  messages.use(authentication.requireAuth);
  messages.post('/conversations', messagingController.open);
  messages.get('/:id', messagingController.history);
  messages.post('/:id', messagingController.send);
  messages.patch('/:id/read', messagingController.markRead);
  app.use('/api/messages', messages);
  app.use(errorHandler);
  await withTestServer(app, run);
};
const http = async <T = Record<string, unknown>>(
  base: string,
  actor: string | null,
  method: string,
  path: string,
  body?: unknown,
) => {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(actor ? { authorization: 'Bearer ' + actor } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      success: boolean;
      data: T;
      meta?: { page: number; limit: number; total: number; totalPages: number };
      error?: { code: string };
    },
  };
};
const user = async (status = 'ACTIVE', visibility = 'VISIBLE') => {
  const id = randomUUID();
  await pool!.query('INSERT INTO users(id,status) VALUES($1,$2)', [id, status]);
  await pool!.query(
    "INSERT INTO profiles(user_id,full_name,department,avatar,moderation_visibility) VALUES($1,$2,'Synthetic department','{\"synthetic\":true}',$3)",
    [id, 'Synthetic identity ' + id, visibility],
  );
  return id;
};
const fixture = async () => {
  const provider = await user(),
    requester = await user(),
    category = 'Test-' + randomUUID();
  const service = await repository!.create(provider, {
    title: 'Synthetic service ' + category,
    description: 'Synthetic local service description for security verification.',
    category,
    location: 'Synthetic campus',
    price: '50.00',
    pricingType: 'FIXED',
    skills: ['Teaching'],
  });
  return { provider, requester, service };
};
const pending = async () => {
  const f = await fixture(),
    request = await repository!.request(
      f.requester,
      f.service.id,
      'Synthetic private request note',
    );
  if (typeof request === 'string') throw new Error(request);
  return { ...f, request };
};
const snapshot = async (id: string) =>
  (await pool!.query('SELECT * FROM services WHERE id=$1', [id])).rows as unknown[];
const stored = async (id: string) =>
  (
    await pool!.query<{
      status: string;
      bookings: { id: string; requesterId: string; status: string }[];
    }>('SELECT status,bookings FROM services WHERE id=$1', [id])
  ).rows[0]!;
const serviceWithIntents = (repo = repository!) =>
  createServicesService(repo, {
    createSafely: async (input) => {
      await pool!.query(
        'INSERT INTO test_notification_intents(event_id,recipient_id) VALUES($1,$2)',
        [input.eventId, input.recipientId],
      );
      return null;
    },
  });
const intents = async (eventId: string) =>
  (
    await pool!.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM test_notification_intents WHERE event_id=$1',
      [eventId],
    )
  ).rows[0]!.n;
const concurrentRepository = () => {
  let reads = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = async <T>(query: () => Promise<T>) => {
    const result = await query();
    reads++;
    if (reads <= 2) {
      if (reads === 2) release();
      await gate;
    }
    return result;
  };
  const client = db!.$extends({
    query: {
      service: {
        findFirst: ({ args, query }) => read(() => query(args)),
        findUnique: ({ args, query }) => read(() => query(args)),
      },
    },
  });
  return { repo: createServicesRepository(client as unknown as PrismaClient), reads: () => reads };
};

for (const status of ['SUSPENDED', 'DEACTIVATED']) {
  void check(
    `${status} provider rejects new requests and all privileged actions without writes or intents`,
    async () => {
      const f = await pending();
      await pool!.query('UPDATE users SET status=$1 WHERE id=$2', [status, f.provider]);
      const saved = await snapshot(f.service.id);
      const intentCount = (
        await pool!.query<{ n: number }>('SELECT count(*)::int AS n FROM test_notification_intents')
      ).rows[0]!.n;
      assert.equal(await repository!.request(f.requester, f.service.id, null), 'not-found');
      await assert.rejects(serviceWithIntents().request(f.requester, f.service.id, null), {
        code: 'SERVICE_UNAVAILABLE',
      });
      for (const operation of [
        () =>
          repository!.create(f.provider, {
            title: 'Denied service',
            description: 'This operation must never persist.',
            category: 'Test',
            location: null,
            price: '0',
            pricingType: 'FREE',
            skills: [],
          }),
        () => repository!.update(f.provider, f.service.id, { title: 'Denied edit' }),
        () => repository!.transition(f.provider, f.service.id, ServiceStatus.ARCHIVED),
        () => repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'ACCEPTED'),
        () => repository!.workspace(f.provider),
      ])
        await assert.rejects(operation(), { code: 'ACCOUNT_UNAVAILABLE' });
      assert.equal(await repository!.find(f.service.id), null);
      assert.equal(
        (await repository!.find(f.service.id, f.requester))?.provider.displayName,
        'CampusConnect student',
      );
      assert.deepEqual(await snapshot(f.service.id), saved);
      assert.equal(await intents(f.request.id), 0);
      assert.equal(
        (
          await pool!.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM test_notification_intents',
          )
        ).rows[0]!.n,
        intentCount,
      );
    },
  );
  void check(
    `${status} requester cannot submit or be accepted; pending rejection remains possible`,
    async () => {
      const f = await pending();
      await pool!.query('UPDATE users SET status=$1 WHERE id=$2', [status, f.requester]);
      const saved = await snapshot(f.service.id);
      await assert.rejects(repository!.request(f.requester, f.service.id, null), {
        code: 'ACCOUNT_UNAVAILABLE',
      });
      await assert.rejects(
        repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'ACCEPTED'),
        { code: 'ACCOUNT_UNAVAILABLE' },
      );
      assert.deepEqual(await snapshot(f.service.id), saved);
      assert.equal(
        (await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'REJECTED')).kind,
        'request',
      );
    },
  );
}
void check(
  'cross-provider mutations and request-ID substitution cause no state changes',
  async () => {
    const f = await pending(),
      other = await fixture(),
      saved = await snapshot(f.service.id);
    assert.equal(
      await repository!.update(other.provider, f.service.id, { title: 'Attack' }),
      'forbidden',
    );
    assert.equal(
      await repository!.transition(other.provider, f.service.id, ServiceStatus.ARCHIVED),
      'forbidden',
    );
    assert.deepEqual(
      await repository!.mutateRequest(other.provider, f.service.id, f.request.id, 'ACCEPTED'),
      { kind: 'forbidden' },
    );
    assert.deepEqual(
      await repository!.mutateRequest(f.provider, f.service.id, randomUUID(), 'ACCEPTED'),
      { kind: 'not-found' },
    );
    assert.deepEqual(await snapshot(f.service.id), saved);
  },
);
for (const lifecycle of ['PAUSED', 'ARCHIVED', 'HIDDEN'])
  void check(
    `${lifecycle} preserves historical access/completion but prohibits new engagement`,
    async () => {
      const f = await pending();
      await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'ACCEPTED');
      if (lifecycle === 'HIDDEN')
        await pool!.query("UPDATE services SET moderation_visibility='HIDDEN' WHERE id=$1", [
          f.service.id,
        ]);
      else
        await pool!.query('UPDATE services SET status=$1 WHERE id=$2', [lifecycle, f.service.id]);
      assert.equal(await repository!.request(await user(), f.service.id, null), 'not-found');
      assert.ok(await repository!.find(f.service.id, f.provider));
      assert.ok(await repository!.find(f.service.id, f.requester));
      assert.equal(
        (await repository!.workspace(f.requester)).requested.some((r) => r.id === f.request.id),
        true,
      );
      assert.equal(
        (await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'COMPLETED')).kind,
        'request',
      );
      assert.equal(
        await canStartServiceConversation(db!, f.provider, f.requester, f.request.id),
        lifecycle !== 'HIDDEN',
      );
      if (lifecycle === 'HIDDEN') {
        assert.equal(await repository!.find(f.service.id), null);
        assert.equal(await repository!.find(f.service.id, await user()), null);
      }
    },
  );
for (const final of ['REJECTED', 'COMPLETED'] as const)
  void check(`re-request after ${final} projects the latest status and eligibility`, async () => {
    const f = await pending();
    if (final === 'COMPLETED')
      await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'ACCEPTED');
    await repository!.mutateRequest(f.provider, f.service.id, f.request.id, final);
    assert.equal((await repository!.find(f.service.id, f.requester))?.viewerRequestStatus, final);
    assert.equal((await repository!.find(f.service.id, f.requester))?.viewerCanRequest, true);
    const request = await repository!.request(f.requester, f.service.id, null);
    assert.equal(typeof request, 'object');
    assert.equal(
      (await repository!.find(f.service.id, f.requester))?.viewerRequestStatus,
      'PENDING',
    );
    assert.equal((await repository!.find(f.service.id, f.requester))?.viewerCanRequest, false);
    assert.equal(await repository!.request(f.requester, f.service.id, null), 'conflict');
    assert.equal((await stored(f.service.id)).bookings.length, 2);
  });
void check(
  'concurrent duplicate submissions persist one active request and retry current state',
  async () => {
    const f = await fixture(),
      concurrent = concurrentRepository();
    const results = await Promise.all([
      concurrent.repo.request(f.requester, f.service.id, null),
      concurrent.repo.request(f.requester, f.service.id, null),
    ]);
    assert.equal(results.filter((r) => typeof r === 'object').length, 1);
    assert.equal(results.filter((r) => r === 'conflict').length, 1);
    assert.ok(concurrent.reads() >= 3);
    assert.equal((await stored(f.service.id)).bookings.length, 1);
  },
);
void check('concurrent accept/reject decisions finalize a request once', async () => {
  const f = await pending(),
    concurrent = concurrentRepository();
  const results = await Promise.all([
    concurrent.repo.mutateRequest(f.provider, f.service.id, f.request.id, 'ACCEPTED'),
    concurrent.repo.mutateRequest(f.provider, f.service.id, f.request.id, 'REJECTED'),
  ]);
  assert.equal(results.filter((r) => r.kind === 'request').length, 1);
  assert.equal(results.filter((r) => r.kind === 'conflict').length, 1);
  assert.ok(concurrent.reads() >= 3);
  const rows = (await stored(f.service.id)).bookings;
  assert.equal(rows.length, 1);
  assert.ok(['ACCEPTED', 'REJECTED'].includes(rows[0]!.status));
});
void check(
  'invalid finalization and duplicate completion do not mutate the stored request',
  async () => {
    const f = await pending(),
      saved = await snapshot(f.service.id);
    assert.deepEqual(
      await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'COMPLETED'),
      { kind: 'conflict' },
    );
    assert.deepEqual(await snapshot(f.service.id), saved);
    await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'ACCEPTED');
    await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'COMPLETED');
    const completed = await snapshot(f.service.id);
    assert.deepEqual(
      await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'COMPLETED'),
      { kind: 'conflict' },
    );
    assert.deepEqual(await snapshot(f.service.id), completed);
  },
);

// Synchronize a real conflicting commit after the first snapshot read.
const afterFirstRead = (change: () => Promise<unknown>) => {
  let reads = 0;
  const read = async <T>(query: () => Promise<T>) => {
    const result = await query();
    reads++;
    if (reads === 1) await change();
    return result;
  };
  const client = db!.$extends({
    query: {
      service: {
        findFirst: ({ args, query }) => read(() => query(args)),
        findUnique: ({ args, query }) => read(() => query(args)),
      },
    },
  });
  return { repo: createServicesRepository(client as unknown as PrismaClient), reads: () => reads };
};
void check(
  'archival committed after a submission snapshot prevents a stale request append',
  async () => {
    const f = await fixture(),
      hooked = afterFirstRead(() =>
        pool!.query("UPDATE services SET status='ARCHIVED' WHERE id=$1", [f.service.id]),
      );
    assert.equal(await hooked.repo.request(f.requester, f.service.id, null), 'not-found');
    assert.ok(hooked.reads() >= 2);
    assert.equal((await stored(f.service.id)).status, 'ARCHIVED');
    assert.deepEqual((await stored(f.service.id)).bookings, []);
  },
);
for (const transition of [ServiceStatus.PAUSED, ServiceStatus.ACTIVE])
  void check(`stale ${transition} cannot overwrite concurrent ARCHIVED`, async () => {
    const f = await fixture();
    if (transition === 'ACTIVE')
      await repository!.transition(f.provider, f.service.id, ServiceStatus.PAUSED);
    const hooked = afterFirstRead(() =>
      pool!.query("UPDATE services SET status='ARCHIVED' WHERE id=$1", [f.service.id]),
    );
    assert.equal(await hooked.repo.transition(f.provider, f.service.id, transition), 'conflict');
    assert.ok(hooked.reads() >= 2);
    assert.equal((await stored(f.service.id)).status, 'ARCHIVED');
  });
void check(
  'moderation committed after edit snapshot prevents modification of newly hidden service',
  async () => {
    const f = await fixture(),
      hooked = afterFirstRead(() =>
        pool!.query("UPDATE services SET moderation_visibility='HIDDEN' WHERE id=$1", [
          f.service.id,
        ]),
      );
    assert.equal(
      await hooked.repo.update(f.provider, f.service.id, { title: 'Must not persist' }),
      'not-found',
    );
    assert.ok(hooked.reads() >= 2);
    assert.equal((await repository!.find(f.service.id, f.provider))?.title, f.service.title);
  },
);

const withBlockedAccount = async (
  id: string,
  status: string,
  operation: () => Promise<unknown>,
) => {
  const blocker = await pool!.connect();
  try {
    await blocker.query('BEGIN');
    const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
      .pid;
    await blocker.query('UPDATE users SET status=$1 WHERE id=$2', [status, id]);
    const pendingOperation = operation().then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
    let observed = false;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const result = await pool!.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))',
        [pid],
      );
      if (result.rows[0]!.n > 0) {
        observed = true;
        break;
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    await blocker.query('COMMIT');
    const outcome = await pendingOperation;
    assert.equal(observed, true, 'Observed real account-lock contention');
    return outcome;
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
  }
};
void check(
  'provider suspension overlapping submission denies a stale eligible request without notification',
  async () => {
    const f = await fixture(),
      saved = await snapshot(f.service.id);
    const outcome = await withBlockedAccount(f.provider, 'SUSPENDED', () =>
      serviceWithIntents().request(f.requester, f.service.id, null),
    );
    assert.ok(
      ['ACCOUNT_UNAVAILABLE', 'SERVICE_UNAVAILABLE'].includes(
        (outcome.error as { code: string }).code,
      ),
    );
    assert.deepEqual(await snapshot(f.service.id), saved);
    assert.equal((await stored(f.service.id)).bookings.length, 0);
  },
);
void check(
  'requester deactivation overlapping acceptance denies membership-like engagement with no partial write',
  async () => {
    const f = await pending(),
      saved = await snapshot(f.service.id);
    const outcome = await withBlockedAccount(f.requester, 'DEACTIVATED', () =>
      serviceWithIntents().mutate(f.provider, f.service.id, f.request.id, 'ACCEPTED'),
    );
    assert.equal((outcome.error as { code: string }).code, 'ACCOUNT_UNAVAILABLE');
    assert.deepEqual(await snapshot(f.service.id), saved);
    assert.equal(await intents(f.request.id + ':ACCEPTED'), 0);
  },
);

const withSerializationFault = async (
  id: string,
  failures: number,
  run: (attempts: () => Promise<number>) => Promise<void>,
) => {
  const suffix = randomUUID().replaceAll('-', ''),
    seq = 'services_retry_seq_' + suffix,
    fn = 'services_retry_fn_' + suffix,
    trigger = 'services_retry_trigger_' + suffix;
  assert.match(id, /^[a-f0-9-]+$/);
  await pool!.query(
    `CREATE SEQUENCE ${seq};CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${id}'::uuid THEN IF nextval('${seq}')<=${failures} THEN RAISE EXCEPTION 'Synthetic Services serialization conflict' USING ERRCODE='40001'; END IF;END IF;RETURN NEW;END $$;CREATE TRIGGER ${trigger} BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION ${fn}();`,
  );
  try {
    await run(async () =>
      Number(
        (await pool!.query<{ last_value: string }>(`SELECT last_value FROM ${seq}`)).rows[0]!
          .last_value,
      ),
    );
  } finally {
    await pool!.query(
      `DROP TRIGGER ${trigger} ON services;DROP FUNCTION ${fn}();DROP SEQUENCE ${seq};`,
    );
  }
};
void check(
  'a retried request review persists one outcome and one notification intent',
  async () => {
    const f = await pending();
    await withSerializationFault(f.service.id, 1, async (attempts) => {
      assert.equal(
        (await serviceWithIntents().mutate(f.provider, f.service.id, f.request.id, 'ACCEPTED'))
          .kind,
        'request',
      );
      assert.equal(await attempts(), 2);
    });
    assert.equal((await stored(f.service.id)).bookings[0]!.status, 'ACCEPTED');
    assert.equal(await intents(f.request.id + ':ACCEPTED'), 1);
  },
);
void check(
  'retry exhaustion returns HTTP 409 after three actual failures without partial JSONB or notification',
  async () => {
    const f = await pending(),
      saved = await snapshot(f.service.id);
    await withSerializationFault(f.service.id, 3, async (attempts) => {
      const app = express();
      app.post('/isolated-review', async (_req, res) =>
        res.json(
          await serviceWithIntents().mutate(f.provider, f.service.id, f.request.id, 'ACCEPTED'),
        ),
      );
      app.use(errorHandler);
      await withTestServer(app, async (base) => {
        const response = await fetch(base + '/isolated-review', { method: 'POST' });
        assert.equal(response.status, 409);
        const body = (await response.json()) as { error: { code: string } };
        assert.equal(body.error.code, 'SERVICE_CONCURRENCY_CONFLICT');
      });
      assert.equal(await attempts(), 3);
      assert.deepEqual(await snapshot(f.service.id), saved);
      assert.equal(await intents(f.request.id + ':ACCEPTED'), 0);
    });
  },
);

void check(
  'hidden identity is redacted in detail/list/workspace/search and notification sender projections',
  async () => {
    const f = await pending();
    await pool!.query(
      "UPDATE profiles SET moderation_visibility='HIDDEN' WHERE user_id=ANY($1::uuid[])",
      [[f.provider, f.requester]],
    );
    const detail = await repository!.find(f.service.id, f.requester);
    assert.equal(detail?.provider.displayName, 'CampusConnect student');
    assert.equal(detail?.provider.avatar, null);
    assert.equal(detail?.provider.department, null);
    const listed = await repository!.list(parseServiceQuery({ category: f.service.category }));
    assert.equal(listed.items[0]?.provider.displayName, 'CampusConnect student');
    const workspace = await repository!.workspace(f.provider);
    const request = workspace.received.find((r) => r.id === f.request.id);
    assert.equal(request?.requester.displayName, 'CampusConnect student');
    assert.equal(request?.message, 'Synthetic private request note');
    assert.equal(JSON.stringify(detail).includes('Synthetic private request note'), false);
    assert.equal(
      (await searchRepository.services(f.service.category, 10)).find((s) => s.id === f.service.id)
        ?.provider.profile,
      null,
    );
    const notification = await messagingRepository.notificationDetails(
      { contextType: 'SERVICE', contextId: f.request.id },
      f.provider,
    );
    assert.equal(notification.senderName, 'CampusConnect student');
  },
);
void check('combined fixed/free price bounds filter actual persisted numeric values', async () => {
  const f = await fixture();
  const base = {
    title: 'Synthetic price',
    description: 'Synthetic pricing-filter verification description.',
    category: f.service.category,
    location: null,
    skills: [],
  };
  await repository!.create(f.provider, { ...base, pricingType: 'FIXED', price: '150.00' });
  await repository!.create(f.provider, { ...base, pricingType: 'FREE', price: '0' });
  await repository!.create(f.provider, { ...base, pricingType: 'NEGOTIABLE', price: null });
  const fixed = await repository!.list(
    parseServiceQuery({
      category: f.service.category,
      pricingType: 'FIXED',
      minPrice: '100',
      maxPrice: '200',
    }),
  );
  assert.equal(fixed.total, 1);
  assert.equal(fixed.items[0]?.price, '150.00');
  const free = await repository!.list(
    parseServiceQuery({
      category: f.service.category,
      pricingType: 'FREE',
      minPrice: '0',
      maxPrice: '20',
    }),
  );
  assert.equal(free.total, 1);
  assert.equal(free.items[0]?.price, '0.00');
  const negotiable = await repository!.list(
    parseServiceQuery({ category: f.service.category, pricingType: 'NEGOTIABLE' }),
  );
  assert.equal(negotiable.total, 1);
  assert.equal(negotiable.items[0]?.price, null);
});
void check(
  'SERVICE conversation uses request ID, exact active pair, and no duplicate context',
  async () => {
    const f = await pending(),
      other = await user();
    assert.equal(
      await canStartServiceConversation(db!, f.provider, f.requester, f.request.id),
      false,
    );
    await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'ACCEPTED');
    assert.equal(
      await canStartServiceConversation(db!, f.provider, f.requester, f.service.id),
      false,
    );
    assert.equal(await canStartServiceConversation(db!, f.provider, other, f.request.id), false);
    const a = await openServiceConversation(db!, f.provider, f.requester, f.request.id),
      b = await openServiceConversation(db!, f.requester, f.provider, f.request.id);
    assert.equal(a.id, b.id);
    assert.equal(
      (
        await pool!.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM conversations WHERE context_id=$1',
          [f.request.id],
        )
      ).rows[0]!.n,
      1,
    );
    await pool!.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [f.requester]);
    assert.equal(
      await canStartServiceConversation(db!, f.provider, f.requester, f.request.id),
      false,
    );
    await assert.rejects(openServiceConversation(db!, f.provider, f.requester, f.request.id), {
      code: 'ACCOUNT_UNAVAILABLE',
    });
    assert.ok(await messagingRepository.get(a.id, f.provider));
    assert.equal(await messagingRepository.get(a.id, other), null);
  },
);

void check(
  'actual Services router rejects unauthenticated/forged/wrong-owner writes and permits its exact provider',
  async () => {
    const f = await fixture(),
      other = await user();
    const authentication = createAuthenticationMiddleware({
      verifyAccessToken: (token) =>
        Promise.resolve({
          id: token,
          email: 'synthetic@example.test',
          emailVerified: true,
          metadata: {},
        }),
      repository: {
        findById: async (id) => {
          const row = await db!.user.findUnique({ where: { id }, select: { status: true } });
          return row
            ? {
                id,
                email: 'synthetic@example.test',
                emailVerifiedAt: new Date(),
                role: id === other ? UserRole.ADMIN : UserRole.STUDENT,
                status: row.status,
                profile: null,
              }
            : null;
        },
      },
    });
    const app = express();
    app.use(express.json());
    app.use(
      '/api/services',
      createServicesRouter({
        authentication,
        controller: createServicesController(serviceWithIntents()),
      }),
    );
    app.use(errorHandler);
    await withTestServer(app, async (base) => {
      const path = base + '/api/services/' + f.service.id;
      assert.equal((await fetch(path, { method: 'PATCH' })).status, 401);
      const patch = (actor: string, body: unknown) =>
        fetch(path, {
          method: 'PATCH',
          headers: { authorization: 'Bearer ' + actor, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      assert.equal((await patch(other, { title: 'Wrong owner' })).status, 403);
      assert.equal(
        (await patch(f.provider, { providerId: other, title: 'Forged identity' })).status,
        400,
      );
      assert.equal((await patch(f.provider, { title: 'Authorized edit' })).status, 200);
      assert.equal((await fetch(path)).status, 200);
    });
    assert.equal((await repository!.find(f.service.id))?.title, 'Authorized edit');
  },
);

void check(
  'eligible provider can complete accepted history after requester deactivation',
  async () => {
    const f = await pending();
    await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'ACCEPTED');
    await pool!.query("UPDATE users SET status='DEACTIVATED' WHERE id=$1", [f.requester]);
    assert.equal(
      (await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'COMPLETED')).kind,
      'request',
    );
    assert.equal((await stored(f.service.id)).bookings[0]?.status, 'COMPLETED');
    assert.equal(
      (await repository!.workspace(f.provider)).received.find((r) => r.id === f.request.id)
        ?.requester.displayName,
      'CampusConnect student',
    );
  },
);
void check(
  'latest request uses real timestamp ordering and active history independently prevents re-request',
  async () => {
    const f = await fixture();
    const record = (id: string, status: string, createdAt: string) => ({
      id,
      requesterId: f.requester,
      status,
      createdAt,
      updatedAt: createdAt,
      reviewedAt: null,
      message: null,
    });
    await pool!.query('UPDATE services SET bookings=$1 WHERE id=$2', [
      JSON.stringify([
        record(randomUUID(), 'COMPLETED', '2026-10-26T12:00:00.000Z'),
        record(randomUUID(), 'REJECTED', '2026-10-26T10:00:00.000Z'),
      ]),
      f.service.id,
    ]);
    assert.equal(
      (await repository!.find(f.service.id, f.requester))?.viewerRequestStatus,
      'COMPLETED',
    );
    assert.equal((await repository!.find(f.service.id, f.requester))?.viewerCanRequest, true);
    await pool!.query('UPDATE services SET bookings=bookings || $1::jsonb WHERE id=$2', [
      JSON.stringify([record(randomUUID(), 'PENDING', '2026-10-26T09:00:00.000Z')]),
      f.service.id,
    ]);
    assert.equal(
      (await repository!.find(f.service.id, f.requester))?.viewerRequestStatus,
      'COMPLETED',
    );
    assert.equal((await repository!.find(f.service.id, f.requester))?.viewerCanRequest, false);
    assert.equal(await repository!.request(f.requester, f.service.id, null), 'conflict');
  },
);
void check(
  'pending requests cannot be accepted after visibility or availability restrictions',
  async () => {
    for (const state of ['PAUSED', 'ARCHIVED', 'HIDDEN']) {
      const f = await pending();
      if (state === 'HIDDEN')
        await pool!.query("UPDATE services SET moderation_visibility='HIDDEN' WHERE id=$1", [
          f.service.id,
        ]);
      else await pool!.query('UPDATE services SET status=$1 WHERE id=$2', [state, f.service.id]);
      const saved = await snapshot(f.service.id);
      assert.deepEqual(
        await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'ACCEPTED'),
        { kind: 'conflict' },
      );
      assert.deepEqual(await snapshot(f.service.id), saved);
      assert.equal(
        (await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'REJECTED')).kind,
        'request',
      );
    }
  },
);

void check('concurrent ownership transfer prevents a stale provider edit', async () => {
  const f = await fixture(),
    nextProvider = await user();
  const hooked = afterFirstRead(() =>
    pool!.query('UPDATE services SET provider_id=$1 WHERE id=$2', [nextProvider, f.service.id]),
  );
  assert.equal(
    await hooked.repo.update(f.provider, f.service.id, { title: 'Must not persist' }),
    'forbidden',
  );
  assert.ok(hooked.reads() >= 2);
  assert.equal((await repository!.find(f.service.id))?.title, f.service.title);
  assert.equal((await repository!.find(f.service.id))?.providerId, nextProvider);
});
void check(
  'simultaneous SERVICE conversation creation preserves its database unique identity',
  async () => {
    const f = await pending();
    await repository!.mutateRequest(f.provider, f.service.id, f.request.id, 'ACCEPTED');
    const results = await Promise.all([
      openServiceConversation(db!, f.provider, f.requester, f.request.id),
      openServiceConversation(db!, f.requester, f.provider, f.request.id),
    ]);
    assert.equal(results[0].id, results[1].id);
    assert.equal(
      (
        await pool!.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM conversations WHERE context_id=$1',
          [f.request.id],
        )
      ).rows[0]!.n,
      1,
    );
  },
);

void check(
  'request notifications use the transaction-authoritative provider and omit internal metadata from the DTO',
  async () => {
    const f = await fixture(),
      newProvider = await user();
    const hooked = afterFirstRead(() =>
      pool!.query('UPDATE services SET provider_id=$1 WHERE id=$2', [newProvider, f.service.id]),
    );
    const request = await serviceWithIntents(hooked.repo).request(
      f.requester,
      f.service.id,
      'Synthetic note',
    );
    assert.equal('notificationTarget' in request, false);
    assert.ok(hooked.reads() >= 2);
    const rows = await pool!.query<{ recipient_id: string }>(
      'SELECT recipient_id FROM test_notification_intents WHERE event_id=$1',
      [request.id],
    );
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0]!.recipient_id, newProvider);
    assert.equal((await stored(f.service.id)).bookings.length, 1);
  },
);

void check(
  'complete HTTP + PostgreSQL publish/request/accept/encrypted conversation/complete journey',
  async () => {
    const provider = await user(),
      requester = await user(),
      other = await user();
    const actors = new Map([
      [provider, UserRole.STUDENT],
      [requester, UserRole.STUDENT],
      [other, UserRole.MODERATOR],
    ]);
    await withServicesHttp(actors, async (base) => {
      const category = 'Journey-' + randomUUID();
      const input = {
        title: 'Synthetic integrated service',
        description: 'Synthetic complete workflow description.\n\n[campusconnect-examiner-demo-v1]',
        category,
        location: 'Synthetic campus',
        price: '123.45',
        pricingType: 'FIXED',
        skills: ['Teaching'],
        featuredOnLanding: true,
      };
      assert.equal((await http(base, null, 'POST', '/api/services', input)).status, 401);
      assert.equal((await http(base, 'invalid-token', 'POST', '/api/services', input)).status, 401);
      assert.equal(
        (await http(base, provider, 'POST', '/api/services', { ...input, providerId: other }))
          .status,
        400,
      );
      const created = await http<{ service: ServiceView }>(
        base,
        provider,
        'POST',
        '/api/services',
        input,
      );
      assert.equal(created.status, 201);
      const service = created.body.data.service,
        id = service.id,
        path = '/api/services/' + id;
      assert.equal(service.providerId, provider);
      assert.equal(service.price, '123.45');
      assert.equal(service.featuredOnLanding, true);
      const discovery = await http<{ services: ServiceView[] }>(
        base,
        requester,
        'GET',
        '/api/services?' +
          new URLSearchParams({
            status: 'ACTIVE',
            category,
            search: 'integrated',
            pricingType: 'FIXED',
            minPrice: '100',
            maxPrice: '150',
            limit: '1',
            page: '1',
          }).toString(),
      );
      assert.equal(discovery.status, 200);
      assert.deepEqual(
        discovery.body.data.services.map((row) => row.id),
        [id],
      );
      assert.equal(discovery.body.meta?.total, 1);
      const publicDetail = await http<{ service: ServiceView }>(base, null, 'GET', path);
      assert.equal(publicDetail.status, 200);
      assert.equal('featuredOnLanding' in publicDetail.body.data.service, false);
      const publicJson = JSON.stringify(publicDetail.body.data);
      assert.doesNotMatch(
        publicJson,
        /synthetic@example|enrollment|encryptedContent|bookings|requesterId/,
      );
      assert.equal(
        (await http(base, provider, 'POST', path + '/requests', { message: null })).status,
        403,
      );
      const submitted = await http<{ request: ServiceRequestRecord }>(
        base,
        requester,
        'POST',
        path + '/requests',
        { message: 'Original synthetic private request note' },
      );
      assert.equal(submitted.status, 201);
      const request = submitted.body.data.request;
      assert.equal(request.status, 'PENDING');
      assert.equal(request.requesterId, requester);
      assert.equal(
        (await http(base, requester, 'POST', path + '/requests', { message: 'Duplicate' })).status,
        409,
      );
      const before = await snapshot(id);
      assert.equal(
        (
          await http(base, other, 'PATCH', path + '/requests/' + request.id + '/review', {
            status: 'ACCEPTED',
          })
        ).status,
        403,
      );
      assert.equal(
        (await http(base, requester, 'PATCH', path + '/requests/' + request.id + '/complete', {}))
          .status,
        403,
      );
      assert.deepEqual(await snapshot(id), before);
      const open = { contextType: 'SERVICE', contextId: request.id, targetUserId: provider };
      assert.equal(
        (await http(base, requester, 'POST', '/api/messages/conversations', open)).status,
        403,
      );
      assert.equal(
        (
          await http(base, provider, 'PATCH', path + '/requests/' + request.id + '/review', {
            status: 'ACCEPTED',
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await http(base, provider, 'PATCH', path + '/requests/' + request.id + '/review', {
            status: 'ACCEPTED',
          })
        ).status,
        409,
      );
      const workspace = await http<ServicesWorkspace>(
        base,
        provider,
        'GET',
        '/api/services/workspace',
      );
      assert.equal(
        workspace.body.data.received.find((row) => row.id === request.id)?.status,
        'ACCEPTED',
      );
      const conversation = await http<{ conversation: { id: string; contextId: string } }>(
        base,
        requester,
        'POST',
        '/api/messages/conversations',
        open,
      );
      assert.equal(conversation.status, 201);
      const conversationId = conversation.body.data.conversation.id;
      assert.equal(conversation.body.data.conversation.contextId, request.id);
      assert.notEqual(request.id, id);
      const reverse = await http<{ conversation: { id: string } }>(
        base,
        provider,
        'POST',
        '/api/messages/conversations',
        { ...open, targetUserId: requester },
      );
      assert.equal(reverse.body.data.conversation.id, conversationId);
      assert.equal(
        (await http(base, other, 'POST', '/api/messages/conversations', open)).status,
        403,
      );
      assert.equal((await http(base, other, 'GET', '/api/messages/' + conversationId)).status, 404);
      const plaintext = 'Synthetic encrypted service message';
      const sent = await http<{ message: { id: string; text: string } }>(
        base,
        requester,
        'POST',
        '/api/messages/' + conversationId,
        { text: plaintext },
      );
      assert.equal(sent.status, 201);
      assert.equal(sent.body.data.message.text, plaintext);
      const encrypted = (
        await pool!.query<{
          encrypted_content: Buffer;
          encryption_iv: Buffer;
          encryption_tag: Buffer;
          encryption_version: number;
        }>(
          'SELECT encrypted_content,encryption_iv,encryption_tag,encryption_version FROM messages WHERE id=$1',
          [sent.body.data.message.id],
        )
      ).rows[0]!;
      assert.equal(encrypted.encryption_version, 1);
      assert.equal(encrypted.encryption_iv.length, 12);
      assert.equal(encrypted.encryption_tag.length, 16);
      assert.equal(encrypted.encrypted_content.includes(Buffer.from(plaintext)), false);
      assert.equal(
        (
          await http(base, other, 'POST', '/api/messages/' + conversationId, {
            text: 'Unauthorized',
          })
        ).status,
        404,
      );
      assert.equal(
        (await http(base, provider, 'PATCH', path + '/requests/' + request.id + '/complete', {}))
          .status,
        200,
      );
      assert.equal(
        (await stored(id)).bookings.find((row) => row.id === request.id)?.status,
        'COMPLETED',
      );
      const history = await http<{ messages: { text: string }[] }>(
        base,
        provider,
        'GET',
        '/api/messages/' + conversationId,
      );
      assert.equal(history.body.data.messages[0]?.text, plaintext);
      const again = await http<{ service: ServiceView }>(base, requester, 'GET', path);
      assert.equal(again.body.data.service.viewerCanRequest, true);
      assert.equal(again.body.data.service.viewerRequestStatus, 'COMPLETED');
      const second = await http<{ request: ServiceRequestRecord }>(
        base,
        requester,
        'POST',
        path + '/requests',
        { message: null },
      );
      assert.equal(second.status, 201);
      assert.equal(
        (
          await http(
            base,
            provider,
            'PATCH',
            path + '/requests/' + second.body.data.request.id + '/review',
            { status: 'REJECTED' },
          )
        ).status,
        200,
      );
      assert.equal(
        (await http<{ service: ServiceView }>(base, requester, 'GET', path)).body.data.service
          .viewerCanRequest,
        true,
      );
      const saved = await stored(id);
      assert.equal(saved.bookings.length, 2);
      assert.deepEqual(
        saved.bookings.map((row) => row.status),
        ['COMPLETED', 'REJECTED'],
      );
      const notifications = (
        await pool!.query<{ user_id: string; kind: string }>(
          "SELECT user_id,data->>'kind' AS kind FROM notifications WHERE data->>'entityId'=$1",
          [id],
        )
      ).rows;
      for (const [kind, recipient, count] of [
        ['SERVICE_REQUEST', provider, 2],
        ['SERVICE_REQUEST_ACCEPTED', requester, 1],
        ['SERVICE_REQUEST_COMPLETED', requester, 1],
        ['SERVICE_REQUEST_REJECTED', requester, 1],
      ] as const)
        assert.equal(
          notifications.filter((row) => row.kind === kind && row.user_id === recipient).length,
          count,
        );
      assert.equal(
        notifications.some((row) => row.user_id === other),
        false,
      );
      const destinations = await notificationsRepository.list(provider, 1, 50, false);
      assert.ok(destinations.items.some((row) => row.path === '/services/saved'));
      assert.ok(destinations.items.some((row) => row.path === '/messages/' + conversationId));
      const bookingSnapshot = (await stored(id)).bookings;
      assert.equal(
        (await http(base, provider, 'PATCH', path, { featuredOnLanding: false })).status,
        200,
      );
      assert.deepEqual((await stored(id)).bookings, bookingSnapshot);
      await pool!.query("UPDATE services SET moderation_visibility='HIDDEN' WHERE id=$1", [id]);
      assert.equal((await http(base, null, 'GET', path)).status, 404);
      assert.equal((await http(base, other, 'GET', path)).status, 404);
      assert.equal((await http(base, requester, 'GET', path)).status, 200);
      // Step 11B: retrieving an existing participant context preserves legitimate history.
      assert.equal(
        (await http(base, requester, 'POST', '/api/messages/conversations', open)).status,
        201,
      );
      assert.equal(
        (await http(base, provider, 'GET', '/api/messages/' + conversationId)).status,
        200,
      );
      assert.equal((await http(base, other, 'GET', '/api/messages/' + conversationId)).status, 404);
      assert.equal(
        (
          await pool!.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1',
            [conversationId],
          )
        ).rows[0]!.n,
        1,
      );
    });
  },
);

void check(
  'HTTP pricing validation, null sorting and complete lifecycle use persisted real values',
  async () => {
    const provider = await user(),
      requester = await user(),
      admin = await user();
    await withServicesHttp(
      new Map([
        [provider, UserRole.STUDENT],
        [requester, UserRole.STUDENT],
        [admin, UserRole.ADMIN],
      ]),
      async (base) => {
        const category = 'Pricing-' + randomUUID(),
          ids: string[] = [];
        const input = {
          title: 'Synthetic pricing verification',
          description: 'Synthetic service with complete pricing and lifecycle coverage.',
          category,
          location: null,
          skills: [],
          featuredOnLanding: false,
        };
        for (const [pricingType, price, expected] of [
          ['FREE', '0', '0.00'],
          ['FIXED', '35.50', '35.50'],
          ['NEGOTIABLE', null, null],
        ] as const) {
          const response = await http<{ service: ServiceView }>(
            base,
            provider,
            'POST',
            '/api/services',
            { ...input, pricingType, price },
          );
          assert.equal(response.status, 201);
          ids.push(response.body.data.service.id);
          assert.equal(response.body.data.service.price, expected);
          assert.equal(response.body.data.service.pricingType, pricingType);
          assert.equal(
            (
              await pool!.query<{ price: string | null }>(
                'SELECT price::text AS price FROM services WHERE id=$1',
                [response.body.data.service.id],
              )
            ).rows[0]!.price,
            expected,
          );
        }
        const count = (
          await pool!.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM services WHERE category=$1',
            [category],
          )
        ).rows[0]!.n;
        for (const price of ['0', '-1', '1.234', '10000001'])
          assert.equal(
            (
              await http(base, provider, 'POST', '/api/services', {
                ...input,
                pricingType: 'FIXED',
                price,
              })
            ).status,
            400,
          );
        assert.equal(
          (
            await pool!.query<{ n: number }>(
              'SELECT count(*)::int AS n FROM services WHERE category=$1',
              [category],
            )
          ).rows[0]!.n,
          count,
        );
        const fixed = '/api/services/' + ids[1]!;
        const unchanged = await snapshot(ids[1]!);
        assert.equal((await http(base, provider, 'PATCH', fixed, { price: '75' })).status, 400);
        assert.equal(
          (await http(base, admin, 'PATCH', fixed, { title: 'Wrong owner' })).status,
          403,
        );
        assert.deepEqual(await snapshot(ids[1]!), unchanged);
        for (const query of [
          'pricingType=FREE&minPrice=1',
          'pricingType=NEGOTIABLE&maxPrice=10',
          'minPrice=20&maxPrice=10',
        ])
          assert.equal((await http(base, requester, 'GET', '/api/services?' + query)).status, 400);
        for (const [sort, prices] of [
          ['price_asc', ['0.00', '35.50', null]],
          ['price_desc', ['35.50', '0.00', null]],
        ] as const) {
          const response = await http<{ services: ServiceView[] }>(
            base,
            requester,
            'GET',
            '/api/services?' +
              new URLSearchParams({ category, status: 'ACTIVE', sort, limit: '3' }).toString(),
          );
          assert.deepEqual(
            response.body.data.services.map((row) => row.price),
            prices,
          );
        }
        assert.equal(
          (await http(base, provider, 'PATCH', fixed + '/status', { status: 'PAUSED' })).status,
          200,
        );
        assert.equal(
          (await http(base, requester, 'POST', fixed + '/requests', { message: null })).status,
          409,
        );
        assert.equal(
          (
            await http<{ services: ServiceView[] }>(
              base,
              requester,
              'GET',
              '/api/services?' + new URLSearchParams({ category, status: 'ACTIVE' }).toString(),
            )
          ).body.data.services.some((row) => row.id === ids[1]),
          false,
        );
        assert.equal(
          (await http(base, provider, 'PATCH', fixed + '/status', { status: 'ACTIVE' })).status,
          200,
        );
        assert.equal(
          (await http(base, provider, 'PATCH', fixed + '/status', { status: 'ACTIVE' })).status,
          409,
        );
        assert.equal(
          (await http(base, provider, 'PATCH', fixed + '/status', { status: 'ARCHIVED' })).status,
          200,
        );
        const archived = await snapshot(ids[1]!);
        assert.equal(
          (await http(base, provider, 'PATCH', fixed + '/status', { status: 'ACTIVE' })).status,
          409,
        );
        assert.equal(
          (await http(base, provider, 'PATCH', fixed, { title: 'Archived edit' })).status,
          409,
        );
        assert.deepEqual(await snapshot(ids[1]!), archived);
        const free = '/api/services/' + ids[0]!;
        assert.equal(
          (await http(base, provider, 'PATCH', free + '/status', { status: 'PAUSED' })).status,
          200,
        );
        assert.equal(
          (await http(base, provider, 'PATCH', free + '/status', { status: 'ARCHIVED' })).status,
          200,
        );
        assert.equal((await stored(ids[0]!)).status, 'ARCHIVED');
      },
    );
  },
);
