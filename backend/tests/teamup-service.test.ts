import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProjectStatus } from '../src/generated/prisma/client.js';
import {
  teamUpRepository,
  type TeamUpRepository,
} from '../src/modules/teamup/teamup.repository.js';
import { createTeamUpService } from '../src/modules/teamup/teamup.service.js';
import {
  parseApplicationReview,
  parseTeamUpCreate,
  parseTeamUpQuery,
} from '../src/modules/teamup/teamup.validation.js';
import type {
  TeamUpApplicationRecord,
  TeamUpProjectSummary,
} from '../src/modules/teamup/teamup.types.js';

const project: TeamUpProjectSummary = {
  category: 'Technology',
  createdAt: '2026-10-07T00:00:00Z',
  currentMemberCount: 1,
  deadline: '2026-12-01',
  description: 'A practical student project for campus collaboration.',
  id: '11111111-1111-4111-8111-111111111111',
  maxMembers: 3,
  owner: { avatar: null, department: 'CSE', displayName: 'Owner', id: 'owner' },
  ownerId: 'owner',
  requiredSkills: ['React'],
  status: ProjectStatus.OPEN,
  title: 'Campus project',
  updatedAt: '2026-10-07T00:00:00Z',
  viewerApplicationStatus: null,
  viewerIsMember: false,
  viewerIsOwner: true,
};
const application: TeamUpApplicationRecord = {
  applicantId: 'student',
  createdAt: '2026-10-07T00:00:00Z',
  id: '22222222-2222-4222-8222-222222222222',
  message: null,
  reviewedAt: null,
  reviewerId: null,
  status: 'PENDING',
};
const repository = (overrides: Partial<TeamUpRepository> = {}): TeamUpRepository => ({
  ...teamUpRepository,
  create: () => Promise.resolve(project),
  findById: () => Promise.resolve({ ...project, members: [] }),
  list: () => Promise.resolve({ items: [project], total: 1 }),
  updateOwned: () => Promise.resolve(project),
  apply: () => Promise.resolve(application),
  listApplications: () => Promise.resolve([]),
  review: () =>
    Promise.resolve({
      application: { ...application, status: 'ACCEPTED' },
      kind: 'application',
      project: { ...project, currentMemberCount: 2 },
    }),
  transition: () => Promise.resolve({ ...project, status: ProjectStatus.COMPLETED }),
  workspace: () => Promise.resolve({ applications: [], joined: [], owned: [project] }),
  ...overrides,
});

void describe('TeamUp validation', () => {
  void it('accepts a bounded real project and rejects client ownership fields', () => {
    assert.equal(
      parseTeamUpCreate({
        category: 'Technology',
        deadline: '2026-12-01',
        description: project.description,
        maxMembers: 3,
        requiredSkills: ['React'],
        title: project.title,
      }).maxMembers,
      3,
    );
    assert.throws(
      () =>
        parseTeamUpCreate({
          category: 'Technology',
          deadline: null,
          description: project.description,
          maxMembers: 3,
          ownerId: 'attacker',
          requiredSkills: [],
          title: project.title,
        }),
      { code: 'VALIDATION_ERROR' },
    );
  });
  void it('validates discovery and review values', () => {
    assert.equal(parseTeamUpQuery({ page: '2', skill: 'React', status: 'OPEN' }).page, 2);
    assert.equal(parseApplicationReview({ status: 'ACCEPTED' }), 'ACCEPTED');
    assert.throws(() => parseApplicationReview({ status: 'PENDING' }), {
      code: 'VALIDATION_ERROR',
    });
  });
});

void describe('TeamUp service rules', () => {
  void it('derives creation ownership from the service caller', async () => {
    let owner = '';
    const service = createTeamUpService(
      repository({
        create: (ownerId) => {
          owner = ownerId;
          return Promise.resolve(project);
        },
      }),
    );
    await service.createProject('authenticated-owner', {
      category: null,
      deadline: null,
      description: project.description,
      maxMembers: 3,
      requiredSkills: [],
      title: project.title,
    });
    assert.equal(owner, 'authenticated-owner');
  });
  void it('returns pagination and workspace data', async () => {
    const service = createTeamUpService(repository());
    assert.equal((await service.listProjects({ limit: 1, page: 1, sort: 'newest' })).totalPages, 1);
    assert.equal((await service.workspace('owner')).owned.length, 1);
  });
  void it('maps owner/member/duplicate and closed application failures', async () => {
    for (const [result, code] of [
      ['forbidden', 'TEAMUP_APPLICATION_FORBIDDEN'],
      ['conflict', 'TEAMUP_APPLICATION_EXISTS'],
      ['not-found', 'TEAMUP_APPLICATION_CLOSED'],
    ] as const) {
      const service = createTeamUpService(repository({ apply: () => Promise.resolve(result) }));
      await assert.rejects(service.apply('student', project.id, null), { code });
    }
  });
  void it('accepts and rejects applications while enforcing capacity', async () => {
    const accepted = await createTeamUpService(repository()).reviewApplication(
      'owner',
      project.id,
      application.id,
      'ACCEPTED',
    );
    assert.equal(accepted.application.status, 'ACCEPTED');
    const full = createTeamUpService(
      repository({ review: () => Promise.resolve({ kind: 'capacity' }) }),
    );
    await assert.rejects(full.reviewApplication('owner', project.id, application.id, 'ACCEPTED'), {
      code: 'TEAMUP_PROJECT_FULL',
    });
  });
  void it('rejects non-owner edits and invalid lifecycle transitions', async () => {
    const service = createTeamUpService(
      repository({
        transition: () => Promise.resolve('not-found'),
        updateOwned: () => Promise.resolve(null),
      }),
    );
    await assert.rejects(service.updateProject('other', project.id, { title: 'Changed' }), {
      code: 'TEAMUP_PROJECT_FORBIDDEN',
    });
    await assert.rejects(service.transition('owner', project.id, ProjectStatus.OPEN), {
      code: 'INVALID_TEAMUP_STATUS_TRANSITION',
    });
  });
});
