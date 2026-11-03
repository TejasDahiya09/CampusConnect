import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { apiRequest, apiRequestWithMeta } from '../src/services/api-client.js';
import { createTeamUpApi } from '../src/features/teamup/teamup-service.js';
import { canApplyToProject, type TeamUpProject } from '../src/features/teamup/teamup.types.js';

const project: TeamUpProject = {
  category: 'Technology',
  createdAt: '2026-10-07T00:00:00Z',
  currentMemberCount: 1,
  deadline: null,
  description: 'A practical student project for campus collaboration.',
  id: '11111111-1111-4111-8111-111111111111',
  maxMembers: 3,
  owner: { avatar: null, department: 'CSE', displayName: 'Owner', id: 'owner' },
  ownerId: 'owner',
  requiredSkills: ['React'],
  status: 'OPEN',
  title: 'Campus project',
  updatedAt: '2026-10-07T00:00:00Z',
  viewerApplicationStatus: null,
  viewerIsMember: false,
  viewerIsOwner: false,
};
interface Call {
  readonly init?: RequestInit;
  readonly path: string;
}
const harness = (responses: unknown[]) => {
  const calls: Call[] = [];
  const request = (<T>(path: string, init?: RequestInit) => {
    calls.push({ ...(init ? { init } : {}), path });
    return Promise.resolve(responses.shift() as T);
  }) satisfies typeof apiRequest;
  const withMeta = (<T>(path: string, init?: RequestInit) => {
    calls.push({ ...(init ? { init } : {}), path });
    return Promise.resolve(
      responses.shift() as {
        readonly data: T;
        readonly meta?: Readonly<Record<string, boolean | null | number | string>>;
      },
    );
  }) satisfies typeof apiRequestWithMeta;
  return { api: createTeamUpApi(request, withMeta), calls };
};

void describe('TeamUp frontend API integration', () => {
  void it('maps real discovery filters and pagination', async () => {
    const { api, calls } = harness([
      { data: { projects: [project] }, meta: { limit: 12, page: 2, total: 13, totalPages: 2 } },
    ]);
    const result = await api.getProjects({
      keyword: 'campus',
      limit: 12,
      page: 2,
      skill: 'React',
      sort: 'newest',
      status: 'OPEN',
    });
    const url = new URL(calls[0]?.path ?? '', 'https://example.test');
    assert.equal(url.searchParams.get('skill'), 'React');
    assert.equal(result.pagination.totalPages, 2);
  });
  void it('creates and edits without client-supplied ownership', async () => {
    const { api, calls } = harness([{ project }, { project }]);
    const draft = {
      category: 'Technology',
      deadline: '',
      description: project.description,
      featuredOnLanding: true,
      maxMembers: 3,
      requiredSkills: ['React'],
      title: project.title,
    };
    await api.createProject(draft);
    await api.updateProject(project.id, { ...draft, featuredOnLanding: false });
    const requestBody = calls[0]?.init?.body;
    assert.ok(typeof requestBody === 'string');
    const createBody = JSON.parse(requestBody) as Record<string, unknown>;
    assert.equal(createBody.ownerId, undefined);
    assert.equal(createBody.featuredOnLanding, true);
    const updateRequestBody = calls[1]?.init?.body;
    assert.ok(typeof updateRequestBody === 'string');
    const updateBody = JSON.parse(updateRequestBody) as Record<string, unknown>;
    assert.equal(updateBody.featuredOnLanding, false);
    assert.deepEqual(
      calls.map(({ init }) => init?.method),
      ['POST', 'PATCH'],
    );
  });
  void it('connects apply, review, lifecycle, and workspace routes', async () => {
    const application = {
      applicant: project.owner,
      applicantId: 'student',
      createdAt: project.createdAt,
      id: 'application',
      message: null,
      reviewedAt: null,
      reviewerId: null,
      status: 'PENDING' as const,
    };
    const { api, calls } = harness([
      { application },
      { application: { ...application, status: 'ACCEPTED' }, project },
      { project },
      { applications: [], joined: [], owned: [project] },
    ]);
    await api.apply(project.id, 'Ready to help');
    await api.reviewApplication(project.id, application.id, 'ACCEPTED');
    await api.transition(project.id, 'COMPLETED');
    await api.getWorkspace();
    assert.deepEqual(
      calls.map(({ init, path }) => [init?.method, path]),
      [
        ['POST', `/api/teamup/projects/${project.id}/applications`],
        ['PATCH', `/api/teamup/projects/${project.id}/applications/application`],
        ['PATCH', `/api/teamup/projects/${project.id}/status`],
        [undefined, '/api/teamup/workspace'],
      ],
    );
  });
});

void describe('TeamUp frontend permissions', () => {
  void it('shows apply only to eligible students', () => {
    assert.equal(canApplyToProject(project), true);
    assert.equal(canApplyToProject({ ...project, viewerIsOwner: true }), false);
    assert.equal(canApplyToProject({ ...project, viewerApplicationStatus: 'PENDING' }), false);
    assert.equal(canApplyToProject({ ...project, status: 'FULL' }), false);
  });
});
