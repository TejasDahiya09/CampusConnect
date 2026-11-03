import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createAuthenticationMiddleware } from '../src/modules/auth/auth.middleware.js';
import { createTeamUpRouter } from '../src/modules/teamup/teamup.routes.js';
import { createTeamUpController } from '../src/modules/teamup/teamup.controller.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { withTestServer } from './helpers/test-server.js';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';
import type { prisma } from '../src/database/prisma.js';
import { Prisma, ProjectStatus } from '../src/generated/prisma/client.js';
import { createTeamUpRepository } from '../src/modules/teamup/teamup.repository.js';
import { createTeamUpService } from '../src/modules/teamup/teamup.service.js';
import { canStartTeamUpConversation } from '../src/modules/teamup/teamup-messaging.js';
import { applicationDeadlineExpired } from '../src/modules/teamup/teamup-policy.js';
import { parseTeamUpCreate, parseTeamUpUpdate } from '../src/modules/teamup/teamup.validation.js';
import type {
  TeamUpApplicationRecord,
  TeamUpMemberRecord,
} from '../src/modules/teamup/teamup.types.js';

const application = (applicantId = 'student', id = 'application'): TeamUpApplicationRecord => ({
  applicantId,
  id,
  status: 'PENDING',
  message: 'Private synthetic note',
  createdAt: '2026-01-01T00:00:00Z',
  reviewedAt: null,
  reviewerId: null,
});
const project = () => ({
  id: 'project',
  ownerId: 'owner',
  status: 'OPEN',
  moderationVisibility: 'VISIBLE',
  deadline: null as Date | null,
  maxMembers: 3,
  members: [] as TeamUpMemberRecord[],
  applications: [] as TeamUpApplicationRecord[],
  category: 'Technology',
  title: 'Synthetic project',
  description: 'Synthetic test description only.',
  requiredSkills: ['React'],
  featuredOnLanding: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  owner: {
    id: 'owner',
    profile: {
      avatar: null,
      department: null,
      fullName: 'Synthetic owner',
      moderationVisibility: 'VISIBLE',
    },
  },
});
type Query = { where?: Record<string, unknown>; data?: Record<string, unknown> };
const harness = (now: () => Date = () => new Date()) => {
  let row = project();
  let writes = 0;
  let attempts = 0;
  let conflicts = 0;
  let conflictAfterWrite = false;
  let rawConflict = false;
  let beforeTransaction = () => {};
  const accounts = new Map([
    ['owner', 'ACTIVE'],
    ['student', 'ACTIVE'],
    ['other', 'ACTIVE'],
  ]);
  const locks: string[] = [];
  const visible = (query: Query) => {
    const where = query.where ?? {};
    return (
      (!where.id || where.id === row.id) &&
      (!where.moderationVisibility || where.moderationVisibility === row.moderationVisibility) &&
      (!where.owner || accounts.get(row.ownerId) === 'ACTIVE')
    );
  };
  const find = (q: Query) => Promise.resolve(visible(q) ? structuredClone(row) : null);
  const client = {
    $queryRaw: (_sql: TemplateStringsArray, id: string) => {
      locks.push(id);
      return Promise.resolve([]);
    },
    user: {
      findUnique: (q: { where: { id: string } }) =>
        Promise.resolve(accounts.has(q.where.id) ? { status: accounts.get(q.where.id) } : null),
      findMany: () => Promise.resolve([]),
    },
    teamUp: {
      findFirst: find,
      findUnique: find,
      findMany: (q: Query) => Promise.resolve(visible(q) ? [structuredClone(row)] : []),
      count: (q: Query) => Promise.resolve(visible(q) ? 1 : 0),
      create: (q: Query) => {
        writes++;
        row = { ...row, ...q.data };
        if (conflictAfterWrite) {
          conflictAfterWrite = false;
          throw new Prisma.PrismaClientKnownRequestError('Synthetic rolled-back write', {
            code: 'P2034',
            clientVersion: '7.10.0',
          });
        }
        return Promise.resolve(structuredClone(row));
      },
      update: (q: Query) => {
        writes++;
        row = { ...row, ...q.data };
        if (conflictAfterWrite) {
          conflictAfterWrite = false;
          throw new Prisma.PrismaClientKnownRequestError('Synthetic rolled-back write', {
            code: 'P2034',
            clientVersion: '7.10.0',
          });
        }
        return Promise.resolve(structuredClone(row));
      },
    },
    $transaction: async <T>(
      run: (tx: unknown) => Promise<T>,
      options: { isolationLevel: string },
    ) => {
      assert.equal(options.isolationLevel, 'Serializable');
      attempts++;
      beforeTransaction();
      if (conflicts-- > 0)
        throw new Prisma.PrismaClientKnownRequestError('Synthetic serialization conflict', {
          code: rawConflict ? 'P2010' : 'P2034',
          meta: rawConflict
            ? {
                driverAdapterError: {
                  cause: { originalCode: '40001', kind: 'TransactionWriteConflict' },
                },
              }
            : {},
          clientVersion: '7.10.0',
        });
      const snapshot = structuredClone(row);
      const previousWrites = writes;
      try {
        return await run(client);
      } catch (error) {
        row = snapshot;
        writes = previousWrites;
        throw error;
      }
    },
  };
  const repository = createTeamUpRepository(client as unknown as typeof prisma, now);
  return {
    repository,
    accounts,
    locks,
    get row() {
      return row;
    },
    get writes() {
      return writes;
    },
    get attempts() {
      return attempts;
    },
    set conflicts(value: number) {
      conflicts = value;
    },
    set conflictAfterWrite(value: boolean) {
      conflictAfterWrite = value;
    },
    set rawConflict(value: boolean) {
      rawConflict = value;
    },
    set beforeTransaction(value: () => void) {
      beforeTransaction = value;
    },
  };
};

for (const [deadline, now, expired] of [
  [null, '2026-12-31T23:59:59.999Z', false],
  ['2027-01-01', '2026-12-31T23:59:59.999Z', false],
  ['2026-12-31', '2026-12-31T23:59:59.999Z', false],
  ['2026-12-30', '2026-12-31T00:00:00.000Z', true],
  ['2026-12-31', '2027-01-01T00:00:00.000Z', true],
  ['2026-10-26', '2026-10-27T00:15:00+05:30', false],
  ['2026-10-26', '2026-10-26T23:30:00-04:00', true],
] as const)
  void test(`deadline ${deadline ?? 'none'} at ${now}`, () =>
    assert.equal(
      applicationDeadlineExpired(deadline ? new Date(deadline) : null, new Date(now)),
      expired,
    ));

void test('malformed stored deadlines fail closed; malformed and missing create fields are rejected', () => {
  assert.equal(applicationDeadlineExpired(new Date('invalid')), true);
  for (const deadline of ['2026-02-30', 'invalid', undefined])
    assert.throws(
      () =>
        parseTeamUpCreate({
          title: 'A project',
          description: 'Valid description of a campus project.',
          category: null,
          deadline,
          maxMembers: 3,
          requiredSkills: [],
        }),
      { code: 'VALIDATION_ERROR' },
    );
  assert.deepEqual(parseTeamUpUpdate({ deadline: null }), { deadline: null });
});

void test('expired submission regression: no application write or notification', async () => {
  const h = harness();
  h.row.deadline = new Date('2000-01-01');
  let notifications = 0;
  const service = createTeamUpService(h.repository, {
    createSafely: () => {
      notifications++;
      return Promise.resolve(null);
    },
  });
  await assert.rejects(service.apply('student', 'project', null), {
    code: 'TEAMUP_APPLICATION_DEADLINE_EXPIRED',
  });
  assert.equal(h.writes, 0);
  assert.equal(notifications, 0);
});
for (const status of ['SUSPENDED', 'DEACTIVATED', 'MISSING'])
  void test(`${status} actor is denied all privileged repository entry points without writes`, async () => {
    const h = harness();
    if (status === 'MISSING') h.accounts.delete('owner');
    else h.accounts.set('owner', status);
    for (const operation of [
      () =>
        h.repository.create('owner', {
          title: 'A project',
          description: 'Description with enough text.',
          category: null,
          deadline: null,
          maxMembers: 3,
          requiredSkills: [],
        }),
      () => h.repository.updateOwned('owner', 'project', { title: 'Changed' }),
      () => h.repository.transition('owner', 'project', ProjectStatus.COMPLETED),
      () => h.repository.listApplications('owner', 'project'),
      () => h.repository.review('owner', 'project', 'application', 'ACCEPTED'),
      () => h.repository.workspace('owner'),
      () => h.repository.apply('owner', 'project', null),
    ])
      await assert.rejects(operation(), { code: 'ACCOUNT_UNAVAILABLE' });
    assert.equal(h.writes, 0);
  });
for (const status of ['SUSPENDED', 'DEACTIVATED'])
  void test(`${status} owner cannot receive applications or appear through private/history projections`, async () => {
    const h = harness();
    h.accounts.set('owner', status);
    const before = structuredClone(h.row);
    assert.equal(await h.repository.apply('student', 'project', null), 'not-found');
    assert.equal(await h.repository.findById('project'), null);
    const workspace = await h.repository.workspace('student');
    assert.deepEqual(workspace, { owned: [], joined: [], applications: [] });
    assert.deepEqual(h.row, before);
    assert.equal(h.writes, 0);
  });
for (const status of ['SUSPENDED', 'DEACTIVATED'])
  void test(`${status} applicant cannot apply or be accepted`, async () => {
    const h = harness();
    h.accounts.set('student', status);
    h.row.applications = [application()];
    await assert.rejects(h.repository.apply('student', 'project', null), {
      code: 'ACCOUNT_UNAVAILABLE',
    });
    await assert.rejects(h.repository.review('owner', 'project', 'application', 'ACCEPTED'), {
      code: 'ACCOUNT_UNAVAILABLE',
    });
    assert.equal(h.writes, 0);
  });
void test('cross-owner edit, archival, completion, private application read and review are denied without mutation', async () => {
  const h = harness();
  h.row.applications = [application()];
  const before = structuredClone(h.row);
  assert.equal(await h.repository.updateOwned('other', 'project', { title: 'Attack' }), null);
  for (const status of [ProjectStatus.ARCHIVED, ProjectStatus.COMPLETED])
    assert.equal(await h.repository.transition('other', 'project', status), 'forbidden');
  assert.equal(await h.repository.listApplications('other', 'project'), 'forbidden');
  assert.deepEqual(await h.repository.review('other', 'project', 'application', 'ACCEPTED'), {
    kind: 'forbidden',
  });
  assert.equal(h.writes, 0);
  assert.deepEqual(h.row, before);
});
void test('hidden projects cannot be read, mutated, reviewed or exposed through workspace', async () => {
  const h = harness();
  h.row.moderationVisibility = 'HIDDEN';
  h.row.applications = [application()];
  assert.equal(await h.repository.findById('project'), null);
  assert.equal(await h.repository.updateOwned('owner', 'project', { title: 'Hidden' }), null);
  assert.equal(await h.repository.apply('student', 'project', null), 'not-found');
  assert.equal(await h.repository.listApplications('owner', 'project'), 'not-found');
  assert.deepEqual(await h.repository.review('owner', 'project', 'application', 'REJECTED'), {
    kind: 'not-found',
  });
  assert.equal(
    await h.repository.transition('owner', 'project', ProjectStatus.ARCHIVED),
    'not-found',
  );
  assert.deepEqual(await h.repository.workspace('owner'), {
    owned: [],
    joined: [],
    applications: [],
  });
  assert.equal(h.writes, 0);
});
for (const status of ['COMPLETED', 'ARCHIVED'])
  void test(`${status} cannot be edited, applied to or reviewed`, async () => {
    const h = harness();
    h.row.status = status;
    h.row.applications = [application()];
    assert.equal(await h.repository.updateOwned('owner', 'project', { title: 'Closed' }), null);
    assert.equal(await h.repository.apply('student', 'project', null), 'not-found');
    assert.deepEqual(await h.repository.review('owner', 'project', 'application', 'REJECTED'), {
      kind: 'closed',
    });
    assert.equal(h.writes, 0);
  });
void test('full rejects acceptance but permits pending rejection', async () => {
  const h = harness();
  h.row.status = 'FULL';
  h.row.applications = [application()];
  assert.deepEqual(await h.repository.review('owner', 'project', 'application', 'ACCEPTED'), {
    kind: 'capacity',
  });
  assert.equal(h.writes, 0);
  assert.equal(
    (await h.repository.review('owner', 'project', 'application', 'REJECTED')).kind,
    'application',
  );
  assert.equal(h.row.members.length, 0);
});
void test('active owner creates and applies valid partial edits without replacing stored relationships', async () => {
  const h = harness();
  const created = await h.repository.create('owner', {
    title: 'Real project',
    description: 'A valid long description.',
    category: null,
    deadline: null,
    maxMembers: 3,
    requiredSkills: ['React'],
  });
  assert.equal(created.ownerId, 'owner');
  h.row.applications = [application()];
  const before = structuredClone(h.row.applications);
  await h.repository.updateOwned('owner', 'project', { deadline: new Date('2000-01-01') });
  assert.deepEqual(h.row.applications, before);
  assert.equal(h.row.featuredOnLanding, false);
  assert.ok(h.locks.includes('owner'));
});
void test('all existing application states block reapplication, owner/member cannot apply, no writes', async () => {
  for (const status of ['PENDING', 'ACCEPTED', 'REJECTED'] as const) {
    const h = harness();
    h.row.applications = [{ ...application(), status }];
    assert.equal(await h.repository.apply('student', 'project', null), 'conflict');
    assert.equal(h.writes, 0);
  }
  const h = harness();
  assert.equal(await h.repository.apply('owner', 'project', null), 'forbidden');
  h.row.members = [{ userId: 'student', applicationId: 'old', joinedAt: '2026-01-01' }];
  assert.equal(await h.repository.apply('student', 'project', null), 'forbidden');
  assert.equal(h.writes, 0);
});
void test('acceptance updates membership once and pending applications may be reviewed after expiry', async () => {
  const h = harness();
  h.row.applications = [application()];
  h.row.deadline = new Date('2000-01-01');
  assert.equal(
    (await h.repository.review('owner', 'project', 'application', 'ACCEPTED')).kind,
    'application',
  );
  assert.equal(h.row.members.length, 1);
  const saved = structuredClone(h.row);
  assert.deepEqual(await h.repository.review('owner', 'project', 'application', 'ACCEPTED'), {
    kind: 'conflict',
  });
  assert.deepEqual(h.row, saved);
  assert.equal(h.writes, 1);
});
void test('unknown/mismatched application IDs and duplicate membership cannot mutate', async () => {
  const h = harness();
  h.row.applications = [application()];
  assert.deepEqual(
    await h.repository.review('owner', 'project', 'another-project-application', 'ACCEPTED'),
    { kind: 'not-found' },
  );
  h.row.members = [{ userId: 'student', applicationId: 'old', joinedAt: '2026-01-01' }];
  assert.deepEqual(await h.repository.review('owner', 'project', 'application', 'ACCEPTED'), {
    kind: 'conflict',
  });
  assert.equal(h.writes, 0);
});
void test('capacity is checked against current records for each acceptance and capacity edit', async () => {
  const h = harness();
  h.row.maxMembers = 2;
  h.row.applications = [application(), application('other', 'second')];
  assert.equal(
    (await h.repository.review('owner', 'project', 'application', 'ACCEPTED')).kind,
    'application',
  );
  assert.equal(h.row.status, 'FULL');
  assert.deepEqual(await h.repository.review('owner', 'project', 'second', 'ACCEPTED'), {
    kind: 'capacity',
  });
  assert.equal(h.row.members.length, 1);
  assert.equal(await h.repository.updateOwned('owner', 'project', { maxMembers: 1 }), 'capacity');
  assert.equal(h.writes, 1);
});
void test('serialization conflict retries re-read current account status rather than trust middleware snapshot', async () => {
  const h = harness();
  h.conflicts = 1;
  h.beforeTransaction = () => {
    if (h.attempts === 2) h.accounts.set('owner', 'SUSPENDED');
  };
  await assert.rejects(h.repository.transition('owner', 'project', ProjectStatus.COMPLETED), {
    code: 'ACCOUNT_UNAVAILABLE',
  });
  assert.equal(h.attempts, 2);
  assert.equal(h.writes, 0);
});
void test('serialization retry success is bounded and exhaustion returns actionable 409', async () => {
  const h = harness();
  h.conflicts = 1;
  await h.repository.transition('owner', 'project', ProjectStatus.COMPLETED);
  assert.equal(h.attempts, 2);
  assert.equal(h.writes, 1);
  const failed = harness();
  failed.conflicts = 3;
  await assert.rejects(failed.repository.transition('owner', 'project', ProjectStatus.COMPLETED), {
    code: 'TEAMUP_CONCURRENCY_CONFLICT',
    statusCode: 409,
  });
  assert.equal(failed.attempts, 3);
  assert.equal(failed.writes, 0);
});
void test('notifications occur after the committed review once, not during retried transactions', async () => {
  const h = harness();
  h.row.applications = [application()];
  h.conflicts = 1;
  let count = 0;
  const service = createTeamUpService(h.repository, {
    createSafely: () => {
      assert.equal(h.writes, 1);
      count++;
      return Promise.resolve(null);
    },
  });
  await service.reviewApplication('owner', 'project', 'application', 'ACCEPTED');
  assert.equal(count, 1);
  assert.equal(h.attempts, 2);
});

void test('real TeamUp HTTP router preserves public reads, authenticated writes, identity and owner boundaries', async () => {
  const h = harness();
  const id = '11111111-1111-4111-8111-111111111111';
  h.row.id = id;
  const auth = createAuthenticationMiddleware({
    verifyAccessToken: (token) =>
      Promise.resolve({
        id: token,
        email: 'synthetic@example.test',
        emailVerified: true,
        metadata: {},
      }),
    repository: {
      findById: (userId) =>
        Promise.resolve({
          id: userId,
          email: 'synthetic@example.test',
          emailVerifiedAt: new Date(),
          role:
            userId === 'admin'
              ? UserRole.ADMIN
              : userId === 'moderator'
                ? UserRole.MODERATOR
                : UserRole.STUDENT,
          status: (h.accounts.get(userId) as AccountStatus | undefined) ?? AccountStatus.ACTIVE,
          profile: null,
        }),
    },
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/teamup',
    createTeamUpRouter({
      authentication: auth,
      controller: createTeamUpController(createTeamUpService(h.repository)),
    }),
  );
  app.use(errorHandler);
  await withTestServer(app, async (base) => {
    for (const [method, path] of [
      ['POST', '/projects'],
      ['PATCH', `/projects/${id}`],
      ['PATCH', `/projects/${id}/status`],
      ['POST', `/projects/${id}/applications`],
      ['GET', `/projects/${id}/applications`],
      ['PATCH', `/projects/${id}/applications/${id}`],
      ['GET', '/workspace'],
      ['GET', '/recommended-projects'],
      ['GET', `/projects/${id}/recommended-students`],
    ] as const)
      assert.equal((await fetch(base + '/api/teamup' + path, { method })).status, 401);
    assert.equal((await fetch(base + '/api/teamup/projects')).status, 200);
    assert.equal((await fetch(base + '/api/teamup/projects/' + id)).status, 200);
    const attack = await fetch(base + '/api/teamup/projects/' + id, {
      method: 'PATCH',
      headers: { authorization: 'Bearer other', 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Attack' }),
    });
    assert.equal(attack.status, 403);
    assert.equal(h.writes, 0);
    for (const role of ['admin', 'moderator']) {
      h.accounts.set(role, 'ACTIVE');
      const denied = await fetch(base + '/api/teamup/projects/' + id + '/applications', {
        headers: { authorization: 'Bearer ' + role },
      });
      assert.equal(denied.status, 403);
    }
    for (const status of [AccountStatus.SUSPENDED, AccountStatus.DEACTIVATED]) {
      h.accounts.set('owner', status);
      const denied = await fetch(base + '/api/teamup/workspace', {
        headers: { authorization: 'Bearer owner' },
      });
      assert.equal(denied.status, 403);
    }
    h.accounts.set('owner', AccountStatus.ACTIVE);
    const forged = await fetch(base + '/api/teamup/projects/' + id, {
      method: 'PATCH',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId: 'other', title: 'Attack' }),
    });
    assert.equal(forged.status, 400);
    assert.equal(h.writes, 0);
    const allowed = await fetch(base + '/api/teamup/projects/' + id, {
      method: 'PATCH',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Authorized edit' }),
    });
    assert.equal(allowed.status, 200);
    assert.equal(h.writes, 1);
  });
});

void test('a conflict during a write rolls back before replaying the complete review', async () => {
  const h = harness();
  h.row.applications = [application()];
  h.conflictAfterWrite = true;
  assert.equal(
    (await h.repository.review('owner', 'project', 'application', 'ACCEPTED')).kind,
    'application',
  );
  assert.equal(h.attempts, 2);
  assert.equal(h.writes, 1);
  assert.equal(h.row.members.length, 1);
});
void test('raw row-lock serialization errors are retried with the same bounded policy', async () => {
  const h = harness();
  h.conflicts = 1;
  h.rawConflict = true;
  await h.repository.transition('owner', 'project', ProjectStatus.COMPLETED);
  assert.equal(h.attempts, 2);
  assert.equal(h.writes, 1);
});
void test('new TeamUp conversations require current members, active participants and visible active-owner projects', async () => {
  let available = true;
  let activeCount = 2;
  let queries = 0;
  const client = {
    teamUp: {
      findFirst: (query: { where: unknown }) => {
        assert.deepEqual(query.where, {
          id: 'project',
          moderationVisibility: 'VISIBLE',
          owner: { status: 'ACTIVE' },
        });
        return Promise.resolve(
          available ? { ownerId: 'owner', members: [{ userId: 'student' }] } : null,
        );
      },
    },
    user: {
      count: () => {
        queries++;
        return Promise.resolve(activeCount);
      },
    },
  } as unknown as Parameters<typeof canStartTeamUpConversation>[0];
  assert.equal(await canStartTeamUpConversation(client, 'owner', 'student', 'project'), true);
  for (const actor of ['former-member', 'unrelated'])
    assert.equal(await canStartTeamUpConversation(client, actor, 'student', 'project'), false);
  assert.equal(await canStartTeamUpConversation(client, 'owner', 'owner', 'project'), false);
  assert.equal(queries, 1);
  activeCount = 1;
  assert.equal(await canStartTeamUpConversation(client, 'owner', 'student', 'project'), false);
  available = false;
  assert.equal(await canStartTeamUpConversation(client, 'owner', 'student', 'project'), false);
});

void test('submission re-evaluates the UTC boundary after a concurrent transaction retry', async () => {
  let now = new Date('2026-12-31T23:59:59.999Z');
  const h = harness(() => now);
  h.row.deadline = new Date('2026-12-31');
  h.conflicts = 1;
  h.beforeTransaction = () => {
    if (h.attempts === 2) now = new Date('2027-01-01T00:00:00.000Z');
  };
  assert.equal(await h.repository.apply('student', 'project', null), 'expired');
  assert.equal(h.writes, 0);
});

void test('concurrent ownership and closure changes are rechecked after rollback', async () => {
  const h = harness();
  h.conflictAfterWrite = true;
  h.beforeTransaction = () => {
    if (h.attempts === 2) h.row.ownerId = 'other';
  };
  assert.equal(
    await h.repository.updateOwned('owner', 'project', { title: 'Must not persist' }),
    null,
  );
  assert.equal(h.writes, 0);
  assert.equal(h.row.title, 'Synthetic project');
  assert.equal(h.row.ownerId, 'other');
  const closed = harness();
  closed.row.applications = [application()];
  closed.conflictAfterWrite = true;
  closed.beforeTransaction = () => {
    if (closed.attempts === 2) closed.row.status = 'ARCHIVED';
  };
  assert.deepEqual(await closed.repository.review('owner', 'project', 'application', 'ACCEPTED'), {
    kind: 'closed',
  });
  assert.equal(closed.writes, 0);
  assert.equal(closed.row.members.length, 0);
  assert.equal(closed.row.applications[0]?.status, 'PENDING');
});
void test('full submission returns its stable capacity error without mutation', async () => {
  const h = harness();
  h.row.status = 'FULL';
  await assert.rejects(createTeamUpService(h.repository).apply('student', 'project', null), {
    code: 'TEAMUP_PROJECT_FULL',
    statusCode: 409,
  });
  assert.equal(h.writes, 0);
});

void test('adapter-pg raw conflict exhaustion produces 409 without writes', async () => {
  const h = harness();
  h.conflicts = 3;
  h.rawConflict = true;
  await assert.rejects(h.repository.transition('owner', 'project', ProjectStatus.COMPLETED), {
    code: 'TEAMUP_CONCURRENCY_CONFLICT',
    statusCode: 409,
  });
  assert.equal(h.attempts, 3);
  assert.equal(h.writes, 0);
});
