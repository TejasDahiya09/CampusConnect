import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { apiRequest, apiRequestWithMeta } from '../src/services/api-client.js';
import { createLostFoundApi } from '../src/features/lost-found/lost-found-service.js';
import {
  canEditReport,
  canFindMatches,
  canReviewClaims,
  reportImageUrl,
  type LostFoundReport,
} from '../src/features/lost-found/lost-found.types.js';
import {
  confidenceLabel,
  matchingErrorMessage,
  partitionMatches,
} from '../src/features/lost-found/lost-found-matching.js';
import { ApiClientError } from '../src/services/api-client.js';

const report: LostFoundReport = {
  bookmarkCount: 0,
  category: 'Electronics',
  claimCount: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  description: 'Black calculator lost near the library entrance.',
  id: '33333333-3333-4333-8333-333333333333',
  images: [],
  incidentDate: '2026-10-01',
  isBookmarked: false,
  location: 'Library',
  matchCount: 0,
  reporter: { avatar: null, department: 'CSE', displayName: 'Owner', id: 'owner' },
  reporterId: 'owner',
  resolvedAt: null,
  status: 'OPEN',
  title: 'Lost calculator',
  type: 'LOST',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

interface Call {
  readonly init?: RequestInit;
  readonly path: string;
}

const harness = (responses: unknown[]) => {
  const calls: Call[] = [];
  const request = (<T>(path: string, init?: RequestInit): Promise<T> => {
    calls.push({ ...(init === undefined ? {} : { init }), path });
    return Promise.resolve(responses.shift() as T);
  }) satisfies typeof apiRequest;
  const requestWithMeta = (<T>(path: string, init?: RequestInit) => {
    calls.push({ ...(init === undefined ? {} : { init }), path });
    return Promise.resolve(
      responses.shift() as {
        readonly data: T;
        readonly meta?: Readonly<Record<string, boolean | null | number | string>>;
      },
    );
  }) satisfies typeof apiRequestWithMeta;
  return { api: createLostFoundApi(request, requestWithMeta), calls };
};

void describe('Lost & Found frontend API integration', () => {
  void it('maps discovery filters and pagination metadata', async () => {
    const { api, calls } = harness([
      { data: { reports: [report] }, meta: { limit: 12, page: 2, total: 13, totalPages: 2 } },
    ]);
    const result = await api.getReports({
      category: 'Electronics',
      dateFrom: '',
      dateTo: '',
      keyword: 'calculator',
      limit: 12,
      location: 'Library',
      page: 2,
      sort: 'incident_newest',
      status: 'OPEN',
      type: 'LOST',
    });
    const url = new URL(calls[0]?.path ?? '', 'https://campusconnect.test');
    assert.equal(url.pathname, '/api/lost-found/reports');
    assert.equal(url.searchParams.get('keyword'), 'calculator');
    assert.equal(url.searchParams.get('type'), 'LOST');
    assert.equal(result.pagination.totalPages, 2);
    assert.equal(result.reports[0]?.id, report.id);
  });

  void it('loads a report and maps creation without client ownership', async () => {
    const { api, calls } = harness([{ report }, { report }, { report }]);
    assert.equal((await api.getReport(report.id)).id, report.id);
    await api.createReport({
      category: 'Electronics',
      description: report.description,
      featuredOnLanding: true,
      incidentDate: '2026-10-01',
      location: 'Library',
      title: report.title,
      type: 'LOST',
    });
    await api.updateReport(report.id, {
      category: 'Electronics',
      description: report.description,
      featuredOnLanding: false,
      incidentDate: '2026-10-01',
      location: 'Library',
      title: report.title,
    });
    const requestBody = calls[1]?.init?.body;
    assert.ok(typeof requestBody === 'string');
    const body = JSON.parse(requestBody) as Record<string, unknown>;
    assert.equal(calls[1]?.path, '/api/lost-found/reports');
    assert.equal(body.reporterId, undefined);
    assert.equal(body.type, 'LOST');
    assert.equal(body.featuredOnLanding, true);
    const updateRequestBody = calls[2]?.init?.body;
    assert.ok(typeof updateRequestBody === 'string');
    const updateBody = JSON.parse(updateRequestBody) as Record<string, unknown>;
    assert.equal(updateBody.featuredOnLanding, false);
  });

  void it('connects bookmark and claim actions to scoped report routes', async () => {
    const claim = {
      claimantId: 'claimant',
      createdAt: '2026-10-01T00:00:00.000Z',
      id: 'claim',
      message: 'I can identify the serial number.',
      reviewedAt: null,
      reviewerId: null,
      status: 'PENDING' as const,
    };
    const { api, calls } = harness([
      { bookmarked: true },
      { bookmarked: false, removed: true },
      { claim },
      { claim: { ...claim, status: 'APPROVED' } },
    ]);
    await api.addBookmark(report.id);
    await api.removeBookmark(report.id);
    await api.submitClaim(report.id, claim.message);
    await api.reviewClaim(report.id, claim.id, 'APPROVED');
    assert.deepEqual(
      calls.map(({ init, path }) => [init?.method, path]),
      [
        ['POST', `/api/lost-found/reports/${report.id}/bookmark`],
        ['DELETE', `/api/lost-found/reports/${report.id}/bookmark`],
        ['POST', `/api/lost-found/reports/${report.id}/claims`],
        ['PATCH', `/api/lost-found/reports/${report.id}/claims/claim/review`],
      ],
    );
  });

  void it('connects media deletion and ordering to owner-scoped report routes', async () => {
    const media = {
      height: null,
      id: '44444444-4444-4444-8444-444444444444',
      key: 'lost-found/owner/report/image.jpg',
      mimeType: 'image/jpeg',
      originalName: 'item.jpg',
      position: 0,
      primary: true,
      size: 10,
      uploadedById: 'owner',
      url: 'https://cdn.example.test/lost-found/owner/report/image.jpg',
      width: null,
    };
    const { api, calls } = harness([{ media: [] }, { media: [media] }]);

    await api.deleteMedia(report.id, media.id);
    await api.reorderMedia(report.id, [media.id]);

    assert.deepEqual(
      calls.map(({ init, path }) => [init?.method, path]),
      [
        ['DELETE', `/api/lost-found/reports/${report.id}/media/${media.id}`],
        ['PATCH', `/api/lost-found/reports/${report.id}/media/order`],
      ],
    );
    assert.equal(calls[1]?.init?.body, JSON.stringify({ mediaIds: [media.id] }));
  });

  void it('maps matching and authenticated own-report requests through Express routes', async () => {
    const match = {
      confidence: 'HIGH' as const,
      reasons: ['Same item category'],
      report,
      score: 0.9,
      signals: { category: 1, location: 1, text: 0.8, time: 1 },
    };
    const { api, calls } = harness([
      { matcherVersion: 'lf-baseline-v1', matches: [match] },
      { reports: [report] },
    ]);
    assert.equal((await api.getMatches(report.id)).matches[0]?.report.id, report.id);
    assert.equal((await api.getMyReports())[0]?.reporterId, 'owner');
    assert.deepEqual(
      calls.map(({ init, path }) => [init?.method, path]),
      [
        [undefined, `/api/lost-found/reports/${report.id}/matches`],
        [undefined, '/api/lost-found/my-reports'],
      ],
    );
  });

  void it('propagates API failures for page-level error handling', async () => {
    const failure = new Error('Service unavailable');
    const request = (<T>(): Promise<T> => Promise.reject(failure)) satisfies typeof apiRequest;
    const requestWithMeta = (<T>(): Promise<{
      readonly data: T;
      readonly meta?: Readonly<Record<string, boolean | null | number | string>>;
    }> => Promise.reject(failure)) satisfies typeof apiRequestWithMeta;
    const api = createLostFoundApi(request, requestWithMeta);
    await assert.rejects(api.getReport(report.id), failure);
  });
});

void describe('Lost & Found frontend presentation guards', () => {
  void it('shows edit/review controls only to authorized viewers', () => {
    assert.equal(canEditReport(report, { id: 'owner', role: 'STUDENT' }), true);
    assert.equal(canEditReport(report, { id: 'other', role: 'STUDENT' }), false);
    assert.equal(canReviewClaims(report, { id: 'moderator', role: 'MODERATOR' }), true);
    assert.equal(canReviewClaims(report, { id: 'other', role: 'STUDENT' }), false);
    assert.equal(canFindMatches(report, { id: 'owner', role: 'STUDENT' }), true);
    assert.equal(canFindMatches(report, { id: 'other', role: 'STUDENT' }), false);
    assert.equal(
      canFindMatches({ ...report, status: 'RESOLVED' }, { id: 'owner', role: 'STUDENT' }),
      false,
    );
  });

  void it('shows matching controls symmetrically for owners of eligible LOST and FOUND reports', () => {
    const owner = { id: 'owner', role: 'STUDENT' as const };
    for (const type of ['LOST', 'FOUND'] as const) {
      for (const status of ['OPEN', 'MATCHED', 'CLAIM_PENDING'] as const) {
        assert.equal(canFindMatches({ ...report, status, type }, owner), true);
      }
    }
  });

  void it('hides matching controls from non-owners and for ineligible report statuses', () => {
    const owner = { id: 'owner', role: 'STUDENT' as const };
    const other = { id: 'other', role: 'STUDENT' as const };
    assert.equal(canFindMatches({ ...report, type: 'FOUND' }, other), false);
    assert.equal(canFindMatches({ ...report, type: 'LOST' }, null), false);
    for (const status of ['RESOLVED', 'ARCHIVED', 'REMOVED'] as const) {
      assert.equal(canFindMatches({ ...report, status }, owner), false);
    }
  });

  void it('does not fabricate an image URL when delivery is unavailable', () => {
    assert.equal(
      reportImageUrl({
        height: null,
        id: 'image',
        key: 'private/key',
        mimeType: 'image/jpeg',
        originalName: 'item.jpg',
        position: 0,
        primary: true,
        size: 10,
        uploadedById: 'owner',
        url: null,
        width: null,
      }),
      null,
    );
  });

  void it('partitions confidence labels without presenting a ranking score as probability', () => {
    assert.deepEqual(partitionMatches({ matcherVersion: 'lf-semantic-v1', matches: [] }), {
      low: [],
      primary: [],
    });
    const response = {
      matcherVersion: 'lf-baseline-v1' as const,
      matches: [
        {
          confidence: 'HIGH' as const,
          reasons: ['Same item category'],
          report,
          score: 0.9,
          signals: { category: 1, location: 1, text: 0.8, time: 1 },
        },
        {
          confidence: 'LOW' as const,
          reasons: [],
          report: { ...report, id: 'low-report' },
          score: 0.2,
          signals: { category: 0, location: 0, text: 0.2, time: 0 },
        },
      ],
    };
    const partitioned = partitionMatches(response);
    assert.equal(partitioned.primary.length, 1);
    assert.equal(partitioned.low.length, 1);
    assert.equal(confidenceLabel('HIGH'), 'STRONG POSSIBILITY');
    assert.equal(confidenceLabel('LOW').includes('%'), false);
    assert.equal(
      matchingErrorMessage(new ApiClientError('AI_MATCHING_UNAVAILABLE', 'hidden', 503)),
      'AI matching is temporarily unavailable. Your Lost & Found report is unaffected.',
    );
  });

  void it('keeps LOW-confidence results out of suggestion cards and retains the empty state', () => {
    const source = readFileSync(
      new URL('../src/features/lost-found/LostFoundMatchExperience.tsx', import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(source, /Show .*lower-confidence result/);
    assert.match(source, /No strong matches found yet/);
    assert.match(source, /matches\.primary\.map/);
  });
});
