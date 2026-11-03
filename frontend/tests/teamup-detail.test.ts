import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  projectParticipation,
  refreshProjectReview,
} from '../src/features/teamup/teamup-detail-state';
import { teamUpFixtureProject as project } from './teamup-fixture-data';

void describe('TeamUp detail participation and authoritative reconciliation', () => {
  void it('uses actual ownership, membership and finalized application state', () => {
    for (const [patch, state] of [
      [{ viewerIsOwner: true }, 'owner'],
      [{ viewerIsMember: true }, 'member'],
      [{ viewerApplicationStatus: 'PENDING' }, 'pending'],
      [{ viewerApplicationStatus: 'ACCEPTED' }, 'accepted'],
      [{ viewerApplicationStatus: 'REJECTED' }, 'rejected'],
    ] as const)
      assert.equal(projectParticipation({ ...project, ...patch }, '2026-10-26').state, state);
  });
  void it('blocks full, closed and expired recruitment and keeps the final UTC day eligible', () => {
    assert.equal(
      projectParticipation({ ...project, deadline: null }, '2026-10-26').state,
      'eligible',
    );
    assert.equal(projectParticipation(project, '2026-12-01').state, 'eligible');
    assert.equal(projectParticipation(project, '2026-12-02').state, 'expired');
    assert.equal(
      projectParticipation({ ...project, currentMemberCount: 4 }, '2026-10-26').state,
      'full',
    );
    for (const status of ['FULL', 'COMPLETED', 'ARCHIVED'] as const)
      assert.equal(
        projectParticipation({ ...project, status }, '2026-10-26').state,
        status === 'FULL' ? 'full' : 'closed',
      );
  });
  void it('refreshes enriched applicant identities and the real member roster together', async () => {
    const member = { ...project.owner, id: 'member', displayName: 'Actual returned member' };
    const authoritative = { ...project, members: [member], currentMemberCount: 2 };
    const applications = [
      {
        applicant: member,
        applicantId: member.id,
        createdAt: project.createdAt,
        id: 'application',
        message: null,
        reviewedAt: project.createdAt,
        reviewerId: project.ownerId,
        status: 'ACCEPTED' as const,
      },
    ];
    const calls: string[] = [];
    const result = await refreshProjectReview(
      {
        getProject: (id) => {
          calls.push(id);
          return Promise.resolve(authoritative);
        },
        getApplications: (id) => {
          calls.push(id);
          return Promise.resolve(applications);
        },
      },
      project.id,
    );
    assert.equal(result.project, authoritative);
    assert.equal(result.applications, applications);
    assert.equal(result.project.members?.[0]?.displayName, member.displayName);
    assert.deepEqual(calls, [project.id, project.id]);
  });
  void it('does not return a partial replacement if either authoritative refresh fails', async () => {
    await assert.rejects(
      refreshProjectReview(
        {
          getProject: () => Promise.resolve(project),
          getApplications: () => Promise.reject(new Error('Refresh unavailable')),
        },
        project.id,
      ),
      /Refresh unavailable/,
    );
  });
});
