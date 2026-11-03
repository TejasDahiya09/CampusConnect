import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, ProjectStatus } from '../src/generated/prisma/client.js';
import { createTeamUpRepository } from '../src/modules/teamup/teamup.repository.js';
import express from 'express';
import { errorHandler } from '../src/middleware/error-handler.js';
import { withTestServer } from './helpers/test-server.js';
import { createTeamUpService } from '../src/modules/teamup/teamup.service.js';
import { createStudentsService } from '../src/modules/students/students.service.js';

// Opt-in only. Never use DATABASE_URL: this suite creates its own minimal test schema.
const url = process.env.TEAMUP_TEST_DATABASE_URL;
const enabled = url !== undefined;
if (url) {
  const parsed = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname));
  assert.match(parsed.pathname, /^\/campusconnect_teamup_test_[a-z0-9_]+$/);
  assert.equal(
    parsed.search,
    '',
    'Connection overrides are not allowed for the isolated test database.',
  );
}
const pool = enabled ? new Pool({ connectionString: url }) : null;
const db = enabled ? new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }) : null;
const repository = db ? createTeamUpRepository(db) : null;
const students = db ? createStudentsService(db, () => Promise.resolve(null)) : null;
before(async () => {
  if (!pool) return;
  // Refuse even a test-named database that already contains application tables.
  const identity = (
    await pool.query<{ database: string; address: string; port: number }>(
      'SELECT current_database() AS database, host(inet_server_addr()) AS address, inet_server_port() AS port',
    )
  ).rows[0]!;
  assert.match(identity.database, /^campusconnect_teamup_test_[a-z0-9_]+$/);
  assert.equal(identity.address, '127.0.0.1');
  assert.equal(identity.port, Number(new URL(url!).port || 5432));
  const existing = await pool.query<{ count: string }>(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
  );
  assert.equal(existing.rows[0]?.count, '0', 'Use a fresh disposable test database.');
  await pool.query(`
    CREATE TYPE account_status AS ENUM ('ACTIVE','SUSPENDED','DEACTIVATED');
    CREATE TYPE moderation_visibility AS ENUM ('VISIBLE','HIDDEN');
    CREATE TYPE project_status AS ENUM ('OPEN','FULL','COMPLETED','ARCHIVED');
    CREATE TABLE users(id uuid PRIMARY KEY, status account_status NOT NULL DEFAULT 'ACTIVE');
    CREATE TABLE profiles(user_id uuid PRIMARY KEY REFERENCES users(id), full_name varchar(120) NOT NULL,
      avatar jsonb, department varchar(120), bio varchar(1000), interests text[] NOT NULL DEFAULT '{}',
      skills text[] NOT NULL DEFAULT '{}', moderation_visibility moderation_visibility NOT NULL DEFAULT 'VISIBLE');
    CREATE TABLE teamup(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id),
      title varchar(180) NOT NULL, description text NOT NULL, category varchar(100),
      required_skills text[] NOT NULL DEFAULT '{}', members jsonb NOT NULL DEFAULT '[]',
      applications jsonb NOT NULL DEFAULT '[]', bookmarks jsonb NOT NULL DEFAULT '[]', images jsonb NOT NULL DEFAULT '[]', status project_status NOT NULL DEFAULT 'OPEN',
      max_members smallint NOT NULL DEFAULT 5, deadline date, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), moderation_visibility moderation_visibility NOT NULL DEFAULT 'VISIBLE',
      featured_on_landing boolean NOT NULL DEFAULT false, moderation_reason varchar(500), moderated_at timestamptz);
  `);
});
after(async () => {
  await db?.$disconnect();
  await pool?.end();
});
const check = (name: string, run: () => Promise<void>) => test(name, { skip: !enabled }, run);
const user = async (status = 'ACTIVE', visibility = 'VISIBLE') => {
  const id = randomUUID();
  await pool!.query('INSERT INTO users(id,status) VALUES($1,$2)', [id, status]);
  await pool!.query(
    "INSERT INTO profiles(user_id,full_name,skills,moderation_visibility) VALUES($1,'Synthetic test student',ARRAY['React'],$2)",
    [id, visibility],
  );
  return id;
};
const fixture = async () => {
  const owner = await user();
  const applicant = await user();
  const skill = 'Test-' + randomUUID();
  await pool!.query('UPDATE profiles SET skills=$1 WHERE user_id=ANY($2::uuid[])', [
    [skill],
    [owner, applicant],
  ]);
  const project = await repository!.create(owner, {
    title: 'Isolated security test',
    description: 'Synthetic project used only in a disposable database.',
    category: 'Technology',
    requiredSkills: [skill],
    maxMembers: 2,
    deadline: null,
  });
  return { owner, applicant, project };
};
const pending = async () => {
  const f = await fixture();
  const application = await repository!.apply(f.applicant, f.project.id, 'Synthetic test note');
  assert.equal(typeof application, 'object');
  if (typeof application === 'string') throw new Error(application);
  return { ...f, application };
};
const snapshot = async (id: string) =>
  (await pool!.query('SELECT * FROM teamup WHERE id=$1', [id])).rows as unknown[];

// Both transactions must read the same project snapshot before either writes.
const concurrentRepository = () => {
  let reads = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const client = db!.$extends({
    query: {
      teamUp: {
        async findFirst({ args, query }) {
          const result = await query(args);
          reads++;
          if (reads <= 2) {
            if (reads === 2) release();
            await gate;
          }
          return result;
        },
      },
    },
  });
  return {
    repository: createTeamUpRepository(client as unknown as PrismaClient),
    reads: () => reads,
  };
};
const persisted = async (id: string) =>
  (
    await pool!.query<{
      status: string;
      members: { userId: string; applicationId: string }[];
      applications: { id: string; applicantId: string; status: string }[];
    }>('SELECT status,members,applications FROM teamup WHERE id=$1', [id])
  ).rows[0]!;

for (const status of ['SUSPENDED', 'DEACTIVATED']) {
  void check(
    `PostgreSQL: ${status} callers cannot create, mutate, read workspace or review`,
    async () => {
      const f = await pending();
      await pool!.query('UPDATE users SET status=$1 WHERE id=$2', [status, f.owner]);
      const saved = await snapshot(f.project.id);
      for (const operation of [
        () =>
          repository!.create(f.owner, {
            title: 'Forbidden project',
            description: 'Must never create this project.',
            category: null,
            requiredSkills: [],
            maxMembers: 2,
            deadline: null,
          }),
        () => repository!.updateOwned(f.owner, f.project.id, { title: 'Forbidden edit' }),
        () => repository!.transition(f.owner, f.project.id, ProjectStatus.ARCHIVED),
        () => repository!.review(f.owner, f.project.id, f.application.id, 'ACCEPTED'),
        () => repository!.listApplications(f.owner, f.project.id),
        () => repository!.workspace(f.owner),
        () => students!.recommendedStudents(f.owner, f.project.id),
      ])
        await assert.rejects(operation(), { code: 'ACCOUNT_UNAVAILABLE' });
      assert.equal(await repository!.apply(f.applicant, f.project.id, null), 'not-found');
      assert.equal(await repository!.findById(f.project.id), null);
      assert.deepEqual(await snapshot(f.project.id), saved);
    },
  );
  void check(`PostgreSQL: ${status} applicant cannot apply or become a member`, async () => {
    const f = await pending();
    await pool!.query('UPDATE users SET status=$1 WHERE id=$2', [status, f.applicant]);
    const saved = await snapshot(f.project.id);
    await assert.rejects(repository!.apply(f.applicant, f.project.id, null), {
      code: 'ACCOUNT_UNAVAILABLE',
    });
    await assert.rejects(repository!.review(f.owner, f.project.id, f.application.id, 'ACCEPTED'), {
      code: 'ACCOUNT_UNAVAILABLE',
    });
    assert.deepEqual(await snapshot(f.project.id), saved);
  });
}
void check(
  'PostgreSQL: unrelated users cannot edit, transition, inspect or review applications',
  async () => {
    const f = await pending();
    const other = await user();
    const saved = await snapshot(f.project.id);
    assert.equal(await repository!.updateOwned(other, f.project.id, { title: 'Attack' }), null);
    for (const status of [ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED])
      assert.equal(await repository!.transition(other, f.project.id, status), 'forbidden');
    assert.equal(await repository!.listApplications(other, f.project.id), 'forbidden');
    assert.deepEqual(await repository!.review(other, f.project.id, f.application.id, 'ACCEPTED'), {
      kind: 'forbidden',
    });
    assert.equal((await repository!.workspace(other)).applications.length, 0);
    await assert.rejects(students!.recommendedStudents(other, f.project.id), {
      code: 'TEAMUP_RECOMMENDATIONS_FORBIDDEN',
    });
    assert.deepEqual(await snapshot(f.project.id), saved);
  },
);
void check(
  'PostgreSQL: hidden projects are concealed across reads, workspace and mutations',
  async () => {
    const f = await pending();
    await pool!.query("UPDATE teamup SET moderation_visibility='HIDDEN' WHERE id=$1", [
      f.project.id,
    ]);
    const saved = await snapshot(f.project.id);
    assert.equal(await repository!.findById(f.project.id), null);
    assert.equal(
      await repository!.updateOwned(f.owner, f.project.id, { title: 'Hidden edit' }),
      null,
    );
    assert.equal(await repository!.listApplications(f.owner, f.project.id), 'not-found');
    assert.deepEqual(
      await repository!.review(f.owner, f.project.id, f.application.id, 'REJECTED'),
      { kind: 'not-found' },
    );
    assert.equal(
      await repository!.transition(f.owner, f.project.id, ProjectStatus.ARCHIVED),
      'not-found',
    );
    assert.equal((await repository!.workspace(f.owner)).owned.length, 0);
    assert.equal((await repository!.workspace(f.applicant)).applications.length, 0);
    assert.deepEqual(await snapshot(f.project.id), saved);
  },
);
for (const status of [ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED])
  void check(`PostgreSQL: ${status} projects reject application writes and review`, async () => {
    const f = await pending();
    await pool!.query('UPDATE teamup SET status=$1 WHERE id=$2', [status, f.project.id]);
    const saved = await snapshot(f.project.id);
    assert.equal(await repository!.apply(await user(), f.project.id, null), 'not-found');
    assert.deepEqual(
      await repository!.review(f.owner, f.project.id, f.application.id, 'REJECTED'),
      { kind: 'closed' },
    );
    assert.equal(
      await repository!.updateOwned(f.owner, f.project.id, { title: 'Closed edit' }),
      null,
    );
    assert.deepEqual(await snapshot(f.project.id), saved);
  });
void check(
  'PostgreSQL: expiry prevents new submissions but preserves and permits review of old applications',
  async () => {
    const f = await pending();
    await pool!.query("UPDATE teamup SET deadline='2000-01-01' WHERE id=$1", [f.project.id]);
    const saved = await snapshot(f.project.id);
    assert.equal(await repository!.apply(await user(), f.project.id, null), 'expired');
    assert.deepEqual(await snapshot(f.project.id), saved);
    assert.equal(
      (await repository!.review(f.owner, f.project.id, f.application.id, 'ACCEPTED')).kind,
      'application',
    );
  },
);
void check(
  'PostgreSQL: deadline today and tomorrow allow submissions; duplicate and finalized requests do not mutate',
  async () => {
    for (const days of [0, 1]) {
      const f = await fixture();
      const day = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      await pool!.query('UPDATE teamup SET deadline=$1 WHERE id=$2', [day, f.project.id]);
      const application = await repository!.apply(f.applicant, f.project.id, null);
      assert.equal(typeof application, 'object');
      if (typeof application === 'string') throw new Error(application);
      const saved = await snapshot(f.project.id);
      assert.equal(await repository!.apply(f.applicant, f.project.id, null), 'conflict');
      assert.deepEqual(await snapshot(f.project.id), saved);
      await repository!.review(f.owner, f.project.id, application.id, 'REJECTED');
      const finalized = await snapshot(f.project.id);
      assert.deepEqual(
        await repository!.review(f.owner, f.project.id, application.id, 'ACCEPTED'),
        { kind: 'conflict' },
      );
      assert.equal(await repository!.apply(f.applicant, f.project.id, null), 'conflict');
      assert.deepEqual(await snapshot(f.project.id), finalized);
    }
  },
);
void check('PostgreSQL: concurrent acceptances cannot exceed capacity', async () => {
  const f = await pending();
  const second = await user();
  const other = await repository!.apply(second, f.project.id, null);
  if (typeof other === 'string') throw new Error(other);
  const concurrent = concurrentRepository();
  const results = await Promise.all([
    concurrent.repository.review(f.owner, f.project.id, f.application.id, 'ACCEPTED'),
    concurrent.repository.review(f.owner, f.project.id, other.id, 'ACCEPTED'),
  ]);
  assert.ok(concurrent.reads() >= 3, 'A real conflicted transaction retried against current state');
  const stored = await persisted(f.project.id);
  assert.equal(stored.members.length, 1);
  assert.equal(new Set(stored.members.map((m) => m.userId)).size, 1);
  const accepted = stored.applications.filter((a) => a.status === 'ACCEPTED');
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0]?.id, stored.members[0]?.applicationId);
  assert.equal(stored.applications.filter((a) => a.status === 'PENDING').length, 1);
  assert.equal(results.filter((r) => r.kind === 'application').length, 1);
  assert.equal(results.filter((r) => r.kind === 'capacity').length, 1);
  const row = await repository!.findById(f.project.id);
  assert.equal(row?.currentMemberCount, 2);
  assert.equal(row?.status, 'FULL');
});
void check(
  'PostgreSQL: concurrent duplicate submissions create exactly one application',
  async () => {
    const f = await fixture();
    const concurrent = concurrentRepository();
    const results = await Promise.all([
      concurrent.repository.apply(f.applicant, f.project.id, null),
      concurrent.repository.apply(f.applicant, f.project.id, null),
    ]);
    assert.ok(concurrent.reads() >= 3);
    assert.equal((await persisted(f.project.id)).applications.length, 1);
    assert.equal((await persisted(f.project.id)).members.length, 0);
    assert.equal(results.filter((r) => typeof r === 'object').length, 1);
    assert.equal(results.filter((r) => r === 'conflict').length, 1);
    assert.equal(
      ((await repository!.listApplications(f.owner, f.project.id)) as unknown[]).length,
      1,
    );
  },
);
void check('PostgreSQL: application IDs cannot be reviewed under another project', async () => {
  const a = await pending();
  const b = await fixture();
  const saved = await snapshot(b.project.id);
  assert.deepEqual(await repository!.review(b.owner, b.project.id, a.application.id, 'ACCEPTED'), {
    kind: 'not-found',
  });
  assert.deepEqual(await snapshot(b.project.id), saved);
});
void check(
  'PostgreSQL: membership and capacity survive deadline edits; member/owner cannot apply',
  async () => {
    const f = await pending();
    await repository!.review(f.owner, f.project.id, f.application.id, 'ACCEPTED');
    const updated = await repository!.updateOwned(f.owner, f.project.id, {
      deadline: new Date('2000-01-01'),
      maxMembers: 3,
    });
    assert.equal(typeof updated, 'object');
    assert.equal((await repository!.findById(f.project.id))?.currentMemberCount, 2);
    await repository!.updateOwned(f.owner, f.project.id, { deadline: null });
    assert.equal(await repository!.apply(f.applicant, f.project.id, null), 'forbidden');
    assert.equal(await repository!.apply(f.owner, f.project.id, null), 'forbidden');
    assert.equal(
      await repository!.updateOwned(f.owner, f.project.id, { maxMembers: 1 }),
      'capacity',
    );
  },
);
void check(
  'PostgreSQL: project recommendations exclude applied, member, own, full, expired and inactive-owner projects',
  async () => {
    const f = await fixture();
    const eligible = await students!.recommendedProjects(f.applicant);
    assert.ok(eligible.some((r) => r.project.id === f.project.id));
    await repository!.apply(f.applicant, f.project.id, null);
    assert.ok(
      !(await students!.recommendedProjects(f.applicant)).some(
        (r) => r.project.id === f.project.id,
      ),
    );
    await pool!.query("UPDATE teamup SET applications='[]', deadline='2000-01-01' WHERE id=$1", [
      f.project.id,
    ]);
    assert.ok(
      !(await students!.recommendedProjects(f.applicant)).some(
        (r) => r.project.id === f.project.id,
      ),
    );
    await pool!.query("UPDATE teamup SET deadline=NULL, status='FULL' WHERE id=$1", [f.project.id]);
    assert.ok(
      !(await students!.recommendedProjects(f.applicant)).some(
        (r) => r.project.id === f.project.id,
      ),
    );
    await pool!.query("UPDATE teamup SET status='OPEN' WHERE id=$1;", [f.project.id]);
    await pool!.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [f.owner]);
    assert.ok(
      !(await students!.recommendedProjects(f.applicant)).some(
        (r) => r.project.id === f.project.id,
      ),
    );
  },
);
void check(
  'PostgreSQL: suitable students exclude all applicants, members and hidden/inactive profiles',
  async () => {
    const f = await pending();
    const candidate = await user();
    const hidden = await user('ACTIVE', 'HIDDEN');
    const suspended = await user('SUSPENDED');
    await pool!.query('UPDATE profiles SET skills=$1 WHERE user_id=ANY($2::uuid[])', [
      f.project.requiredSkills,
      [candidate, hidden, suspended],
    ]);
    const results = await students!.recommendedStudents(f.owner, f.project.id);
    const ids = results.map((r) => r.student.id);
    assert.ok(ids.includes(candidate));
    for (const id of [f.owner, f.applicant, hidden, suspended]) assert.ok(!ids.includes(id));
    for (const result of results)
      assert.deepEqual(Object.keys(result.student).sort(), [
        'avatar',
        'bio',
        'department',
        'displayName',
        'id',
        'interests',
        'skills',
      ]);
    await repository!.review(f.owner, f.project.id, f.application.id, 'ACCEPTED');
    assert.deepEqual(await students!.recommendedStudents(f.owner, f.project.id), []);
  },
);

void check(
  'PostgreSQL: suspension overlapping an owner mutation forces revalidation without changes',
  async () => {
    const f = await fixture();
    const saved = await snapshot(f.project.id);
    const blocker = await pool!.connect();
    let attempts = 0;
    const tracked = db!.$extends({
      query: {
        async $queryRaw({ args, query }) {
          attempts++;
          const result: unknown = await query(args);
          return result;
        },
      },
    });
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
        .pid;
      await blocker.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [f.owner]);
      const operation = createTeamUpRepository(tracked as unknown as PrismaClient)
        .transition(f.owner, f.project.id, ProjectStatus.COMPLETED)
        .then(
          (value) => ({ value, error: null }),
          (error: unknown) => ({ value: null, error }),
        );
      const deadline = Date.now() + 4000;
      let blocked = false;
      while (Date.now() < deadline) {
        const waiting = await pool!.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))',
          [pid],
        );
        if (waiting.rows[0]!.n > 0) {
          blocked = true;
          break;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      // Release even on assertion failure so the operation cannot remain waiting.
      await blocker.query('COMMIT');
      const result = await operation;
      assert.equal(blocked, true, 'Observed PostgreSQL account-row lock contention');
      assert.equal(
        (result.error as { code?: string })?.code,
        'ACCOUNT_UNAVAILABLE',
        'Owner suspension must return the account policy error',
      );
      assert.ok(attempts >= 2, 'Raw serialization failure retried; observed attempts: ' + attempts);
      assert.equal((result.error as { code?: string })?.code, 'ACCOUNT_UNAVAILABLE');
      assert.deepEqual(await snapshot(f.project.id), saved);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
  },
);
void check('PostgreSQL: concurrent archival wins over a stale application snapshot', async () => {
  const f = await fixture();
  let reads = 0;
  const hooked = db!.$extends({
    query: {
      teamUp: {
        async findFirst({ args, query }) {
          const result = await query(args);
          reads++;
          if (reads === 1)
            await pool!.query("UPDATE teamup SET status='ARCHIVED' WHERE id=$1", [f.project.id]);
          return result;
        },
      },
    },
  });
  assert.equal(
    await createTeamUpRepository(hooked as unknown as PrismaClient).apply(
      f.applicant,
      f.project.id,
      null,
    ),
    'not-found',
  );
  assert.ok(reads >= 2);
  const stored = await persisted(f.project.id);
  assert.equal(stored.status, 'ARCHIVED');
  assert.deepEqual(stored.applications, []);
  assert.deepEqual(stored.members, []);
});

// Real SQLSTATE 40001 is raised by a test-only trigger; nextval survives rollback,
// so persisted sequence values prove the number of database attempts.
const withSerializationFault = async (
  projectId: string,
  failures: number,
  run: (attempts: () => Promise<number>) => Promise<void>,
) => {
  const suffix = randomUUID().replaceAll('-', '');
  const seq = 'test_retry_seq_' + suffix;
  const fn = 'test_retry_fn_' + suffix;
  const trigger = 'test_retry_trigger_' + suffix;
  assert.match(projectId, /^[a-f0-9-]+$/);
  await pool!
    .query(`CREATE SEQUENCE ${seq}; CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.id='${projectId}'::uuid THEN
      IF nextval('${seq}')<=${failures} THEN RAISE EXCEPTION 'Synthetic isolated serialization conflict' USING ERRCODE='40001'; END IF;
    END IF; RETURN NEW; END $$;
    CREATE TRIGGER ${trigger} BEFORE UPDATE ON teamup FOR EACH ROW EXECUTE FUNCTION ${fn}();`);
  try {
    await run(async () =>
      Number(
        (await pool!.query<{ last_value: string }>(`SELECT last_value FROM ${seq}`)).rows[0]!
          .last_value,
      ),
    );
  } finally {
    await pool!.query(
      `DROP TRIGGER ${trigger} ON teamup; DROP FUNCTION ${fn}(); DROP SEQUENCE ${seq};`,
    );
  }
};
void check(
  'PostgreSQL: retried review commits membership and application once and delivers one notification',
  async () => {
    const f = await pending();
    await pool!.query('CREATE TABLE test_notification_deliveries(event_id text NOT NULL)');
    try {
      const service = createTeamUpService(repository!, {
        createSafely: async (input) => {
          await pool!.query('INSERT INTO test_notification_deliveries(event_id) VALUES($1)', [
            input.eventId,
          ]);
          return null;
        },
      });
      await withSerializationFault(f.project.id, 1, async (attempts) => {
        const result = await service.reviewApplication(
          f.owner,
          f.project.id,
          f.application.id,
          'ACCEPTED',
        );
        assert.equal(result.application.status, 'ACCEPTED');
        assert.equal(await attempts(), 2);
      });
      const stored = await persisted(f.project.id);
      assert.equal(stored.members.length, 1);
      assert.equal(stored.applications[0]?.status, 'ACCEPTED');
      assert.equal(stored.members[0]?.applicationId, f.application.id);
      assert.equal(
        (
          await pool!.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM test_notification_deliveries',
          )
        ).rows[0]!.n,
        1,
      );
    } finally {
      await pool!.query('DROP TABLE test_notification_deliveries');
    }
  },
);
void check(
  'PostgreSQL: three real serialization failures return HTTP 409 with no partial state or notification',
  async () => {
    const f = await pending();
    const saved = await snapshot(f.project.id);
    let notifications = 0;
    const service = createTeamUpService(repository!, {
      createSafely: () => {
        notifications++;
        return Promise.resolve(null);
      },
    });
    await withSerializationFault(f.project.id, 3, async (attempts) => {
      const app = express();
      app.post('/isolated-review', async (_request, response) =>
        response.json(
          await service.reviewApplication(f.owner, f.project.id, f.application.id, 'ACCEPTED'),
        ),
      );
      app.use(errorHandler);
      await withTestServer(app, async (base) => {
        const response = await fetch(base + '/isolated-review', { method: 'POST' });
        assert.equal(response.status, 409);
        const body = (await response.json()) as { error: { code: string } };
        assert.equal(body.error.code, 'TEAMUP_CONCURRENCY_CONFLICT');
      });
      assert.equal(await attempts(), 3);
      assert.equal(notifications, 0);
      assert.deepEqual(await snapshot(f.project.id), saved);
    });
  },
);

void check(
  'PostgreSQL: concurrent review of the same application creates exactly one membership',
  async () => {
    const f = await pending();
    const concurrent = concurrentRepository();
    const results = await Promise.all([
      concurrent.repository.review(f.owner, f.project.id, f.application.id, 'ACCEPTED'),
      concurrent.repository.review(f.owner, f.project.id, f.application.id, 'ACCEPTED'),
    ]);
    assert.equal(results.filter((r) => r.kind === 'application').length, 1);
    assert.equal(results.filter((r) => r.kind === 'conflict').length, 1);
    assert.ok(concurrent.reads() >= 3);
    const stored = await persisted(f.project.id);
    assert.equal(stored.members.length, 1);
    assert.equal(stored.applications.length, 1);
    assert.equal(stored.applications[0]?.status, 'ACCEPTED');
    assert.equal(stored.members[0]?.applicationId, f.application.id);
  },
);
