import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ClaimStatus,
  LostFoundStatus,
  LostFoundType,
  UserRole,
} from '../src/generated/prisma/client.js';
import type { LostFoundRepository } from '../src/modules/lost-found/lost-found.repository.js';
import { aiMatchCandidateStatuses } from '../src/modules/lost-found/lost-found.repository.js';
import type { AiClient } from '../src/integrations/ai/ai-client.js';
import { createLostFoundService } from '../src/modules/lost-found/lost-found.service.js';
import type { NotificationCreateInput } from '../src/modules/notifications/notifications.types.js';
import type {
  LostFoundClaim,
  LostFoundReportView,
} from '../src/modules/lost-found/lost-found.types.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const claimantId = '22222222-2222-4222-8222-222222222222';
const reportId = '33333333-3333-4333-8333-333333333333';
const claimId = '44444444-4444-4444-8444-444444444444';
const viewer = { id: claimantId, role: UserRole.STUDENT } as const;
const ownerViewer = { id: ownerId, role: UserRole.STUDENT } as const;

const report = (overrides: Partial<LostFoundReportView> = {}): LostFoundReportView => ({
  bookmarkCount: 0,
  category: 'Electronics',
  claimCount: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  description: 'Black calculator lost near the library entrance.',
  id: reportId,
  images: [],
  incidentDate: '2026-10-01',
  isBookmarked: false,
  location: 'Library',
  matchCount: 0,
  reporter: { avatar: null, department: 'CSE', displayName: 'Owner', id: ownerId },
  reporterId: ownerId,
  resolvedAt: null,
  status: LostFoundStatus.OPEN,
  title: 'Lost calculator',
  type: LostFoundType.LOST,
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const claim: LostFoundClaim = {
  claimantId,
  createdAt: '2026-10-01T00:00:00.000Z',
  id: claimId,
  message: 'I can identify the serial number.',
  reviewedAt: null,
  reviewerId: null,
  status: ClaimStatus.PENDING,
};

const repository = (overrides: Partial<LostFoundRepository> = {}): LostFoundRepository => ({
  addBookmark: () => Promise.resolve(true),
  cancelClaim: () =>
    Promise.resolve({ claim: { ...claim, status: ClaimStatus.CANCELLED }, kind: 'claim' }),
  create: (_id, input) => Promise.resolve(report({ type: input.type })),
  findById: () => Promise.resolve(report()),
  list: () => Promise.resolve({ items: [report()], total: 1 }),
  listBookmarks: () => Promise.resolve({ items: [report({ isBookmarked: true })], total: 1 }),
  listClaims: () => Promise.resolve([claim]),
  listMatchCandidates: () =>
    Promise.resolve([report({ id: 'candidate', type: LostFoundType.FOUND })]),
  listMyReports: () => Promise.resolve([report()]),
  removeBookmark: () => Promise.resolve(true),
  reviewClaim: (_reviewer, _moderate, _report, _claim, status) =>
    Promise.resolve({ claim: { ...claim, status }, kind: 'claim' }),
  submitClaim: () => Promise.resolve({ claim, kind: 'claim' }),
  transitionOwned: (_id, _owner, status, resolvedAt) =>
    Promise.resolve(report({ resolvedAt: resolvedAt?.toISOString() ?? null, status })),
  updateOwned: (_id, _owner, input) =>
    Promise.resolve(
      report({
        ...(input.category === undefined ? {} : { category: input.category }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.incidentDate === undefined
          ? {}
          : { incidentDate: input.incidentDate?.toISOString().slice(0, 10) ?? null }),
        ...(input.location === undefined ? {} : { location: input.location }),
        ...(input.title === undefined ? {} : { title: input.title }),
      }),
    ),
  ...overrides,
});

const createInput = (type: LostFoundType) => ({
  category: 'Electronics',
  description: 'Black calculator lost near the library entrance.',
  incidentDate: new Date('2026-10-01T00:00:00.000Z'),
  location: 'Library',
  title: 'Calculator report',
  type,
});

void describe('Lost & Found service', () => {
  void it('retrieves only reports supplied by the authenticated ownership query', async () => {
    let queriedUserId: string | undefined;
    const service = createLostFoundService(
      repository({
        listMyReports: (userId) => {
          queriedUserId = userId;
          return Promise.resolve([report({ reporterId: userId })]);
        },
      }),
    );

    assert.equal((await service.listMyReports(ownerId))[0]?.reporterId, ownerId);
    assert.equal(queriedUserId, ownerId);
  });

  void it('retrieves opposite public candidates and preserves validated AI ranking', async () => {
    let requestedCandidates = 0;
    const matchingClient: AiClient = {
      getHealth: () => Promise.resolve({ status: 'DISABLED' }),
      getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
      getVersion: () => Promise.resolve({ status: 'DISABLED' }),
      matchLostFound: (input) => {
        requestedCandidates = input.candidates.length;
        return Promise.resolve({
          data: {
            matcherVersion: 'lf-baseline-v1',
            matches: [
              {
                confidence: 'MEDIUM',
                reasons: ['Same item category'],
                reportId: 'candidate',
                score: 0.6,
                signals: { category: 1, location: 0, text: 0.5, time: 0 },
              },
            ],
          },
          status: 'AVAILABLE',
        });
      },
    };
    const service = createLostFoundService(repository(), matchingClient);
    const result = await service.getMatches(ownerViewer, reportId);
    assert.equal(requestedCandidates, 1);
    assert.equal(result.matches[0]?.report.id, 'candidate');
    assert.equal(result.matches[0]?.score, 0.6);
  });

  void it('returns a controlled unavailable error when AI is disabled or unavailable', async () => {
    const unavailableClient: AiClient = {
      getHealth: () => Promise.resolve({ status: 'DISABLED' }),
      getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
      getVersion: () => Promise.resolve({ status: 'DISABLED' }),
      matchLostFound: () => Promise.resolve({ status: 'DISABLED' }),
    };
    const service = createLostFoundService(repository(), unavailableClient);
    await assert.rejects(service.getMatches(ownerViewer, reportId), {
      code: 'AI_MATCHING_UNAVAILABLE',
    });
  });

  void it('retrieves authorized media and tolerates partial storage failure', async () => {
    const sourceImage = {
      height: 10,
      id: 'source-image',
      key: 'lost-found/source',
      mimeType: 'image/png',
      originalName: null,
      position: 0,
      primary: true,
      size: 4,
      uploadedById: ownerId,
      url: 'https://cdn.invalid/source',
      width: 10,
    } as const;
    const candidateImage = { ...sourceImage, id: 'candidate-image', key: 'lost-found/candidate' };
    let captured = '';
    const matchingClient: AiClient = {
      getHealth: () => Promise.resolve({ status: 'DISABLED' }),
      getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
      getVersion: () => Promise.resolve({ status: 'DISABLED' }),
      matchLostFound: (input) => {
        captured = JSON.stringify(input);
        return Promise.resolve({
          data: { matcherVersion: 'lf-semantic-v1', matches: [] },
          status: 'AVAILABLE',
        });
      },
    };
    const service = createLostFoundService(
      repository({
        findById: () => Promise.resolve(report({ images: [sourceImage] })),
        listMatchCandidates: () =>
          Promise.resolve([
            report({ id: 'candidate', images: [candidateImage], type: LostFoundType.FOUND }),
          ]),
      }),
      matchingClient,
      {
        readObject: (key) =>
          key.endsWith('source')
            ? Promise.resolve(Uint8Array.from([1, 2, 3, 4]))
            : Promise.reject(new Error('controlled failure')),
      },
      true,
    );
    await service.getMatches(ownerViewer, reportId);
    assert.match(captured, /AQIDBA==/);
    assert.doesNotMatch(captured, /cdn\.invalid|AWS_/);
  });

  for (const type of [LostFoundType.LOST, LostFoundType.FOUND]) {
    void it(`creates a ${type} report using authenticated ownership`, async () => {
      let reporter: string | undefined;
      const service = createLostFoundService(
        repository({
          create: (id, input) => {
            reporter = id;
            return Promise.resolve(report({ type: input.type }));
          },
        }),
      );
      assert.equal((await service.createReport(ownerId, createInput(type))).type, type);
      assert.equal(reporter, ownerId);
    });
  }

  void it('rejects non-owner matching before candidate retrieval or AI inference', async () => {
    let candidatesRequested = false;
    let aiInvoked = false;
    const matchingClient: AiClient = {
      getHealth: () => Promise.resolve({ status: 'DISABLED' }),
      getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
      getVersion: () => Promise.resolve({ status: 'DISABLED' }),
      matchLostFound: () => {
        aiInvoked = true;
        return Promise.resolve({ status: 'DISABLED' });
      },
    };
    const service = createLostFoundService(
      repository({
        listMatchCandidates: () => {
          candidatesRequested = true;
          return Promise.resolve([]);
        },
      }),
      matchingClient,
    );

    await assert.rejects(service.getMatches(viewer, reportId), {
      code: 'LOST_FOUND_FORBIDDEN',
    });
    assert.equal(candidatesRequested, false);
    assert.equal(aiInvoked, false);
  });

  void it('allows existing moderator RBAC to request active-report matches', async () => {
    const service = createLostFoundService(repository(), {
      getHealth: () => Promise.resolve({ status: 'DISABLED' }),
      getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
      getVersion: () => Promise.resolve({ status: 'DISABLED' }),
      matchLostFound: () =>
        Promise.resolve({
          data: { matcherVersion: 'lf-semantic-v1', matches: [] },
          status: 'AVAILABLE',
        }),
    });
    const result = await service.getMatches({ id: claimantId, role: UserRole.MODERATOR }, reportId);
    assert.deepEqual(result.matches, []);
  });

  for (const [sourceType, expectedCandidateType] of [
    [LostFoundType.LOST, LostFoundType.FOUND],
    [LostFoundType.FOUND, LostFoundType.LOST],
  ] as const) {
    void it(`matches an owned ${sourceType} report against ${expectedCandidateType} reports`, async () => {
      let requestedType: LostFoundType | undefined;
      const service = createLostFoundService(
        repository({
          findById: () => Promise.resolve(report({ type: sourceType })),
          listMatchCandidates: (_sourceId, type) => {
            requestedType = type;
            return Promise.resolve([]);
          },
        }),
        {
          getHealth: () => Promise.resolve({ status: 'DISABLED' }),
          getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
          getVersion: () => Promise.resolve({ status: 'DISABLED' }),
          matchLostFound: () =>
            Promise.resolve({
              data: { matcherVersion: 'lf-semantic-v1', matches: [] },
              status: 'AVAILABLE',
            }),
        },
      );

      const result = await service.getMatches(ownerViewer, reportId);
      assert.equal(requestedType, expectedCandidateType);
      assert.deepEqual(result.matches, []);
    });
  }

  void it('rejects ineligible source lifecycles before invoking AI', async () => {
    let aiInvoked = false;
    const service = createLostFoundService(
      repository({
        findById: () => Promise.resolve(report({ status: LostFoundStatus.RESOLVED })),
      }),
      {
        getHealth: () => Promise.resolve({ status: 'DISABLED' }),
        getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
        getVersion: () => Promise.resolve({ status: 'DISABLED' }),
        matchLostFound: () => {
          aiInvoked = true;
          return Promise.resolve({ status: 'DISABLED' });
        },
      },
    );

    await assert.rejects(service.getMatches(ownerViewer, reportId), {
      code: 'LOST_FOUND_NOT_MATCHABLE',
    });
    assert.equal(aiInvoked, false);
  });

  void it('uses only active lifecycle statuses for AI candidates', () => {
    assert.deepEqual(aiMatchCandidateStatuses, [
      LostFoundStatus.OPEN,
      LostFoundStatus.MATCHED,
      LostFoundStatus.CLAIM_PENDING,
    ]);
    const statuses = new Set<LostFoundStatus>(aiMatchCandidateStatuses);
    assert.equal(statuses.has(LostFoundStatus.RESOLVED), false);
    assert.equal(statuses.has(LostFoundStatus.ARCHIVED), false);
    assert.equal(statuses.has(LostFoundStatus.REMOVED), false);
  });

  void it('automatically matches after persistence and notifies both owners for meaningful results', async () => {
    const notifications: NotificationCreateInput[] = [];
    const order: string[] = [];
    let requestedType = '';
    let requestedLimit = 0;
    const candidate = report({
      id: 'candidate',
      reporterId: claimantId,
      reporter: { avatar: null, department: null, displayName: 'Finder', id: claimantId },
      type: LostFoundType.FOUND,
    });
    const service = createLostFoundService(
      repository({
        create: (_id, input) => {
          order.push('persist');
          return Promise.resolve(report({ type: input.type }));
        },
        listMatchCandidates: (_source, type, limit) => {
          order.push('candidates');
          requestedType = type;
          requestedLimit = limit;
          return Promise.resolve([candidate]);
        },
      }),
      {
        getHealth: () => Promise.resolve({ status: 'DISABLED' }),
        getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
        getVersion: () => Promise.resolve({ status: 'DISABLED' }),
        matchLostFound: () => {
          order.push('ai');
          return Promise.resolve({
            data: {
              matcherVersion: 'lf-semantic-v1',
              matches: [
                {
                  confidence: 'HIGH',
                  reasons: ['Similar report description'],
                  reportId: candidate.id,
                  score: 0.8,
                  signals: { category: 1, location: 0.5, text: 0.8, time: 1 },
                },
              ],
            },
            status: 'AVAILABLE',
          });
        },
      },
      {},
      false,
      {
        createSafely: (input) => {
          notifications.push(input);
          return Promise.resolve(null);
        },
      },
    );

    await service.createReport(ownerId, createInput(LostFoundType.LOST));
    assert.deepEqual(order, ['persist', 'candidates', 'ai']);
    assert.equal(requestedType, LostFoundType.FOUND);
    assert.equal(requestedLimit, 100);
    assert.deepEqual(
      notifications.map(({ recipientId }) => recipientId).sort(),
      [claimantId, ownerId].sort(),
    );
    assert.equal(new Set(notifications.map(({ eventId }) => eventId)).size, 1);
    assert.match(notifications[0]?.description ?? '', /possible match/i);

    await service.getMatches(ownerViewer, reportId);
    assert.equal(notifications.length, 4);
    assert.equal(
      new Set(notifications.map(({ eventId, recipientId }) => `${recipientId}:${eventId}`)).size,
      2,
    );
  });

  void it('automatically matches a new FOUND report against LOST candidates', async () => {
    let requestedType = '';
    const service = createLostFoundService(
      repository({
        create: (_id, input) => Promise.resolve(report({ type: input.type })),
        listMatchCandidates: (_source, type) => {
          requestedType = type;
          return Promise.resolve([]);
        },
      }),
      {
        getHealth: () => Promise.resolve({ status: 'DISABLED' }),
        getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
        getVersion: () => Promise.resolve({ status: 'DISABLED' }),
        matchLostFound: () =>
          Promise.resolve({
            data: { matcherVersion: 'lf-semantic-v1', matches: [] },
            status: 'AVAILABLE',
          }),
      },
    );

    await service.createReport(ownerId, createInput(LostFoundType.FOUND));
    assert.equal(requestedType, LostFoundType.LOST);
  });

  void it('notifies HIGH and MEDIUM matches but never LOW matches', async () => {
    const notifications: NotificationCreateInput[] = [];
    const candidates = (['HIGH', 'MEDIUM', 'LOW'] as const).map((confidence, index) =>
      report({
        id: `candidate-${index}`,
        reporterId: `${index + 4}1111111-1111-4111-8111-111111111111`,
        reporter: {
          avatar: null,
          department: null,
          displayName: confidence,
          id: `${index + 4}1111111-1111-4111-8111-111111111111`,
        },
        type: LostFoundType.FOUND,
      }),
    );
    const service = createLostFoundService(
      repository({ listMatchCandidates: () => Promise.resolve(candidates) }),
      {
        getHealth: () => Promise.resolve({ status: 'DISABLED' }),
        getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
        getVersion: () => Promise.resolve({ status: 'DISABLED' }),
        matchLostFound: () =>
          Promise.resolve({
            data: {
              matcherVersion: 'lf-semantic-v1',
              matches: candidates.map((candidate, index) => ({
                confidence: (['HIGH', 'MEDIUM', 'LOW'] as const)[index] ?? 'LOW',
                reasons: [],
                reportId: candidate.id,
                score: [0.8, 0.5, 0.2][index] ?? 0,
                signals: { category: 0, location: 0, text: 0, time: 0 },
              })),
            },
            status: 'AVAILABLE',
          }),
      },
      {},
      false,
      {
        createSafely: (input) => {
          notifications.push(input);
          return Promise.resolve(null);
        },
      },
    );

    await service.createReport(ownerId, createInput(LostFoundType.LOST));
    assert.equal(notifications.length, 4);
    assert.equal(
      notifications.some(({ eventId }) => eventId.includes('candidate-2')),
      false,
    );
  });

  void it('keeps report creation successful when automatic AI matching is unavailable', async () => {
    const service = createLostFoundService(repository(), {
      getHealth: () => Promise.resolve({ status: 'DISABLED' }),
      getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
      getVersion: () => Promise.resolve({ status: 'DISABLED' }),
      matchLostFound: () => Promise.resolve({ code: 'AI_SERVICE_TIMEOUT', status: 'UNAVAILABLE' }),
    });
    const created = await service.createReport(ownerId, createInput(LostFoundType.LOST));
    assert.equal(created.id, reportId);
  });

  void it('retrieves and updates an owned report', async () => {
    const service = createLostFoundService(repository());
    assert.equal((await service.getReport(reportId)).id, reportId);
    assert.equal(
      (await service.updateReport(ownerId, reportId, { title: 'Updated report' })).title,
      'Updated report',
    );
  });

  void it('rejects another user updating a report', async () => {
    const service = createLostFoundService(repository());
    await assert.rejects(service.updateReport(claimantId, reportId, { title: 'Changed' }), {
      code: 'LOST_FOUND_FORBIDDEN',
    });
  });

  void it('enforces lifecycle transitions and resolvedAt', async () => {
    const service = createLostFoundService(
      repository({
        findById: () => Promise.resolve(report({ status: LostFoundStatus.CLAIM_PENDING })),
      }),
    );
    const resolved = await service.transitionReport(ownerId, reportId, LostFoundStatus.RESOLVED);
    assert.equal(resolved.status, LostFoundStatus.RESOLVED);
    assert.notEqual(resolved.resolvedAt, null);
  });

  void it('clears resolvedAt when a report leaves a non-resolved state', async () => {
    let receivedResolvedAt: Date | null | undefined;
    const service = createLostFoundService(
      repository({
        findById: () =>
          Promise.resolve(
            report({
              resolvedAt: '2026-10-02T00:00:00.000Z',
              status: LostFoundStatus.OPEN,
            }),
          ),
        transitionOwned: (_id, _owner, status, resolvedAt) => {
          receivedResolvedAt = resolvedAt;
          return Promise.resolve(report({ resolvedAt: null, status }));
        },
      }),
    );

    await service.transitionReport(ownerId, reportId, LostFoundStatus.MATCHED);
    assert.equal(receivedResolvedAt, null);
  });

  void it('rejects invalid lifecycle transitions', async () => {
    const service = createLostFoundService(repository());
    await assert.rejects(service.transitionReport(ownerId, reportId, LostFoundStatus.RESOLVED), {
      code: 'INVALID_LOST_FOUND_STATUS_TRANSITION',
    });
  });

  void it('submits, reviews, and cancels claims with actor identity', async () => {
    const service = createLostFoundService(repository());
    assert.equal(
      (await service.submitClaim(viewer, reportId, claim.message)).claimantId,
      claimantId,
    );
    assert.equal(
      (
        await service.reviewClaim(
          { id: ownerId, role: UserRole.STUDENT },
          reportId,
          claimId,
          ClaimStatus.APPROVED,
        )
      ).status,
      ClaimStatus.APPROVED,
    );
    assert.equal(
      (
        await service.reviewClaim(
          { id: ownerId, role: UserRole.STUDENT },
          reportId,
          claimId,
          ClaimStatus.REJECTED,
        )
      ).status,
      ClaimStatus.REJECTED,
    );
    assert.equal(
      (await service.cancelClaim(viewer, reportId, claimId)).status,
      ClaimStatus.CANCELLED,
    );
  });

  void it('rejects unauthorized claim review', async () => {
    const service = createLostFoundService(
      repository({ reviewClaim: () => Promise.resolve({ kind: 'forbidden' }) }),
    );
    await assert.rejects(service.reviewClaim(viewer, reportId, claimId, ClaimStatus.REJECTED), {
      code: 'CLAIM_FORBIDDEN',
    });
  });

  void it('supports idempotent bookmarks and pagination', async () => {
    const service = createLostFoundService(repository());
    await service.addBookmark(claimantId, reportId);
    await service.addBookmark(claimantId, reportId);
    assert.equal(await service.removeBookmark(claimantId, reportId), true);
    const saved = await service.listBookmarks(claimantId, { limit: 12, page: 1 });
    assert.equal(saved.totalPages, 1);
    assert.equal(saved.items[0]?.isBookmarked, true);
  });

  void it('filters private claims for unrelated users', async () => {
    const otherClaim = {
      ...claim,
      claimantId: ownerId,
      id: '55555555-5555-4555-8555-555555555555',
    };
    const service = createLostFoundService(
      repository({ listClaims: () => Promise.resolve([claim, otherClaim]) }),
    );
    assert.deepEqual(await service.listClaims(viewer, reportId), [claim]);
  });
});
