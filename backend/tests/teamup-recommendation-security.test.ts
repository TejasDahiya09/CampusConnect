import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { prisma } from '../src/database/prisma.js';
import { createStudentsService } from '../src/modules/students/students.service.js';

const student = (id: string) => ({
  id,
  profile: {
    avatar: null,
    bio: 'React',
    department: 'Synthetic',
    fullName: 'Synthetic student',
    interests: [],
    skills: ['React'],
  },
});
const project = (id: string) => ({
  id,
  ownerId: 'owner',
  title: 'React project',
  description: 'Synthetic description',
  category: null,
  status: 'OPEN',
  requiredSkills: ['React'],
  maxMembers: 3,
  deadline: null as Date | null,
  members: [] as { userId: string }[],
  applications: [] as { applicantId: string; status: string }[],
  createdAt: new Date(),
  updatedAt: new Date(),
  owner: {
    id: 'owner',
    profile: { avatar: null, department: null, fullName: 'Owner', moderationVisibility: 'VISIBLE' },
  },
});
type Query = { where: Record<string, unknown>; select?: Record<string, unknown>; take?: number };
const harness = () => {
  const rows = [
    project('eligible'),
    project('member'),
    project('pending'),
    project('accepted'),
    project('rejected'),
    project('full'),
    project('expired'),
  ];
  rows[1]!.members = [{ userId: 'viewer' }];
  for (const [index, status] of [
    [2, 'PENDING'],
    [3, 'ACCEPTED'],
    [4, 'REJECTED'],
  ] as const)
    rows[index]!.applications = [{ applicantId: 'viewer', status }];
  rows[5]!.maxMembers = 1;
  rows[6]!.deadline = new Date('2000-01-01');
  let ownerStatus = 'ACTIVE';
  let projectAvailable = true;
  let semanticCalls = 0;
  const queries: Query[] = [];
  const candidateQueries: Query[] = [];
  const db = {
    user: {
      findUnique: () => Promise.resolve({ status: ownerStatus }),
      findMany: (q: Query) => {
        candidateQueries.push(q);
        return Promise.resolve([student('candidate')]);
      },
    },
    profile: {
      findUnique: () => Promise.resolve({ bio: 'React', skills: ['React'], interests: [] }),
    },
    teamUp: {
      findMany: (q: Query) => {
        queries.push(q);
        return Promise.resolve(rows);
      },
      findFirst: (q: Query) => {
        queries.push(q);
        return Promise.resolve(projectAvailable ? rows[0] : null);
      },
    },
  };
  const service = createStudentsService(db as unknown as typeof prisma, (_query, candidates) => {
    semanticCalls++;
    assert.ok(candidates.every((c) => !c.text.includes('Private note')));
    return Promise.resolve(null);
  });
  return {
    rows,
    queries,
    candidateQueries,
    service,
    get semanticCalls() {
      return semanticCalls;
    },
    set ownerStatus(value: string) {
      ownerStatus = value;
    },
    set projectAvailable(value: boolean) {
      projectAvailable = value;
    },
  };
};
void test('project recommendations exclude all application states, members, capacity-full and expired projects before scoring', async () => {
  const h = harness();
  const result = await h.service.recommendedProjects('viewer');
  assert.deepEqual(
    result.map((r) => r.project.id),
    ['eligible'],
  );
  assert.equal(result[0]?.project.viewerApplicationStatus, null);
  assert.equal(result[0]?.project.currentMemberCount, 1);
  assert.equal(JSON.stringify(result).includes('applicantId'), false);
  const query = h.queries[0]!;
  assert.equal(query.take, 100);
  assert.deepEqual(query.where.owner, { status: 'ACTIVE' });
  assert.deepEqual(query.where.ownerId, { not: 'viewer' });
  assert.equal(query.where.moderationVisibility, 'VISIBLE');
  assert.equal(query.where.status, 'OPEN');
  const dates = query.where.OR as { deadline: null | { gte: Date } }[];
  assert.equal(dates[0]?.deadline, null);
  assert.equal((dates[1]?.deadline as { gte: Date }).gte.toISOString().slice(11), '00:00:00.000Z');
});
void test('owner-scoped candidates exclude members and every existing applicant; public projection remains bounded', async () => {
  const h = harness();
  h.rows[0]!.members = [{ userId: 'member' }];
  h.rows[0]!.maxMembers = 5;
  h.rows[0]!.applications = ['PENDING', 'ACCEPTED', 'REJECTED'].map((status) => ({
    applicantId: status,
    status,
  }));
  const result = await h.service.recommendedStudents('owner', 'eligible');
  assert.equal(result.length, 1);
  const query = h.candidateQueries[0]!;
  assert.deepEqual(query.where.id, {
    notIn: ['owner', 'PENDING', 'ACCEPTED', 'REJECTED', 'member'],
  });
  assert.equal(query.where.status, 'ACTIVE');
  assert.deepEqual(query.where.profile, { is: { moderationVisibility: 'VISIBLE' } });
  assert.equal(query.take, 100);
  assert.deepEqual(Object.keys(result[0]!.student).sort(), [
    'avatar',
    'bio',
    'department',
    'displayName',
    'id',
    'interests',
    'skills',
  ]);
  assert.doesNotMatch(JSON.stringify(query.select), /email|phone|resume|enrollment/i);
  assert.deepEqual(h.queries[0]!.where.owner, { status: 'ACTIVE' });
});
for (const status of ['FULL', 'COMPLETED', 'ARCHIVED'])
  void test(`${status} project does not trigger candidate retrieval/scoring`, async () => {
    const h = harness();
    h.rows[0]!.status = status;
    assert.deepEqual(await h.service.recommendedStudents('owner', 'eligible'), []);
    assert.equal(h.candidateQueries.length, 0);
    assert.equal(h.semanticCalls, 0);
  });
for (const reason of ['capacity', 'expiry'])
  void test(`${reason} prevents owner recruitment suggestions`, async () => {
    const h = harness();
    if (reason === 'capacity') h.rows[0]!.maxMembers = 1;
    else h.rows[0]!.deadline = new Date('2000-01-01');
    assert.deepEqual(await h.service.recommendedStudents('owner', 'eligible'), []);
    assert.equal(h.semanticCalls, 0);
  });
for (const status of ['SUSPENDED', 'DEACTIVATED'])
  void test(`${status} requester cannot request either recommendation mode`, async () => {
    const h = harness();
    h.ownerStatus = status;
    await assert.rejects(h.service.recommendedProjects('viewer'), { code: 'ACCOUNT_UNAVAILABLE' });
    await assert.rejects(h.service.recommendedStudents('owner', 'eligible'), {
      code: 'ACCOUNT_UNAVAILABLE',
    });
    assert.equal(h.queries.length, 0);
    assert.equal(h.semanticCalls, 0);
  });
void test('unrelated owners and concealed projects cannot retrieve candidates', async () => {
  const h = harness();
  await assert.rejects(h.service.recommendedStudents('other', 'eligible'), {
    code: 'TEAMUP_RECOMMENDATIONS_FORBIDDEN',
  });
  h.projectAvailable = false;
  await assert.rejects(h.service.recommendedStudents('owner', 'eligible'), {
    code: 'TEAMUP_PROJECT_NOT_FOUND',
  });
  assert.equal(h.candidateQueries.length, 0);
});
void test('a hidden owner profile does not leak identity attributes through project recommendations', async () => {
  const h = harness();
  h.rows[0]!.owner.profile.moderationVisibility = 'HIDDEN';
  const result = await h.service.recommendedProjects('viewer');
  assert.deepEqual(result[0]?.project.owner, {
    id: 'owner',
    avatar: null,
    department: null,
    displayName: 'CampusConnect student',
  });
});
