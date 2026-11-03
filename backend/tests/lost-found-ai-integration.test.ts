import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { it } from 'node:test';
import express from 'express';
import { env } from '../src/config/env.js';
import { AppError } from '../src/errors/app-error.js';
import {
  AccountStatus,
  LostFoundStatus,
  LostFoundType,
  UserRole,
} from '../src/generated/prisma/client.js';
import { createAiClient } from '../src/integrations/ai/ai-client.js';
import type { AiClient } from '../src/integrations/ai/ai-client.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createAuthenticationMiddleware } from '../src/modules/auth/auth.middleware.js';
import { createLostFoundController } from '../src/modules/lost-found/lost-found.controller.js';
import type { LostFoundRepository } from '../src/modules/lost-found/lost-found.repository.js';
import { createLostFoundRouter } from '../src/modules/lost-found/lost-found.routes.js';
import { createLostFoundService } from '../src/modules/lost-found/lost-found.service.js';
import type { LostFoundReportView } from '../src/modules/lost-found/lost-found.types.js';
import { withTestServer } from './helpers/test-server.js';

// Synthetic records and an isolated identity/repository boundary. No database or notifications.
const ownerId = '11111111-1111-4111-8111-111111111111';
const sourceId = '33333333-3333-4333-8333-333333333333';
const candidateId = '44444444-4444-4444-8444-444444444444';
const source: LostFoundReportView = {
  id: sourceId,
  reporterId: ownerId,
  type: LostFoundType.LOST,
  status: LostFoundStatus.OPEN,
  title: 'Synthetic lost black scientific calculator',
  description: 'Synthetic QA record: black scientific calculator near the Central Library.',
  category: 'Calculators',
  location: 'Central Library',
  incidentDate: '2026-10-26',
  createdAt: '2026-10-26T09:00:00Z',
  updatedAt: '2026-10-26T09:00:00Z',
  resolvedAt: null,
  reporter: { id: ownerId, displayName: 'Synthetic QA owner', avatar: null, department: null },
  images: [],
  isBookmarked: false,
  bookmarkCount: 0,
  claimCount: 0,
  matchCount: 0,
};
const candidate: LostFoundReportView = {
  ...source,
  id: candidateId,
  reporterId: candidateId,
  type: LostFoundType.FOUND,
  title: 'Synthetic found black scientific calculator',
  reporter: { ...source.reporter, id: candidateId, displayName: 'Synthetic QA finder' },
};
const fixtureApp = (client: AiClient) => {
  let candidates = [candidate];
  let reads = 0;
  const repository = {
    findById: () => Promise.resolve(source),
    listMatchCandidates: () => {
      reads++;
      return Promise.resolve(candidates);
    },
    listClaims: () =>
      Promise.resolve([
        {
          id: 'private-claim',
          claimantId: ownerId,
          message: 'Private evidence must not enter AI payloads.',
        },
      ]),
  } as unknown as LostFoundRepository;
  const service = createLostFoundService(repository, client, {}, false);
  const authentication = createAuthenticationMiddleware({
    verifyAccessToken: (token) => {
      if (!['fixture-owner', 'fixture-student'].includes(token))
        return Promise.reject(
          new AppError({
            code: 'INVALID_ACCESS_TOKEN',
            message: 'Invalid fixture token.',
            statusCode: 401,
          }),
        );
      return Promise.resolve({
        id: token === 'fixture-student' ? candidateId : ownerId,
        email: 'fixture@example.invalid',
        emailVerified: true,
        metadata: {},
      });
    },
    repository: {
      findById: (id) =>
        Promise.resolve({
          id,
          email: 'fixture@example.invalid',
          emailVerifiedAt: new Date('2026-10-26'),
          role: UserRole.STUDENT,
          status: AccountStatus.ACTIVE,
          profile: { id, displayName: 'Synthetic QA owner' },
        }),
    },
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/lost-found',
    createLostFoundRouter({
      controller: createLostFoundController(service),
      requireAuth: authentication.requireAuth,
      optionalAuth: authentication.optionalAuth,
    }),
  );
  app.use(errorHandler);
  return {
    app,
    noCandidates: () => {
      candidates = [];
    },
    reads: () => reads,
  };
};
const config = {
  enabled: true,
  apiKey: 'integration-test-service-key',
  timeoutMs: 1000,
  generationTimeoutMs: 1000,
  url: 'http://127.0.0.1:8001',
};
const matchPath = `/api/lost-found/reports/${sourceId}/matches`;
const ownerHeaders = { authorization: 'Bearer fixture-owner' };

void it('Express matching preserves the internal header, maps success/no-match and excludes private evidence', async () => {
  let callCount = 0;
  const client = createAiClient(config, (_url, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('X-CampusConnect-AI-Key'), config.apiKey);
    assert.equal(headers.has('authorization'), false);
    assert.match(headers.get('X-Request-ID') ?? '', /^[a-f0-9-]{36}$/);
    if (typeof init?.body !== 'string') throw new Error('Expected serialized AI matching payload.');
    assert.ok(!init.body.includes('Private evidence'));
    callCount++;
    const body = JSON.parse(init.body) as { candidates: unknown[] };
    return Promise.resolve(
      Response.json({
        matcher_version: 'lf-semantic-v1',
        matches: body.candidates.length
          ? [
              {
                report_id: candidateId,
                confidence: 'HIGH',
                score: 0.9,
                reasons: ['Same item category'],
                signals: { category: 1, location: 1, text: 0.9, time: 1 },
                scoring_mode: 'semantic',
              },
            ]
          : [],
      }),
    );
  });
  const fixture = fixtureApp(client);
  await withTestServer(fixture.app, async (url) => {
    const response = await fetch(url + matchPath, { headers: ownerHeaders });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { data: { matches: { report: { id: string } }[] } };
    assert.equal(body.data.matches[0]?.report.id, candidateId);
    fixture.noCandidates();
    const empty = await fetch(url + matchPath, { headers: ownerHeaders });
    assert.equal(empty.status, 200);
    assert.deepEqual(((await empty.json()) as { data: { matches: unknown[] } }).data.matches, []);
    assert.equal(callCount, 2);
  });
});

void it('temporary AI failure is recoverable on the next existing matching request', async () => {
  let failed = true;
  const client = createAiClient(config, () => {
    if (failed) {
      failed = false;
      return Promise.reject(new Error('startup connection refused'));
    }
    return Promise.resolve(Response.json({ matcher_version: 'lf-semantic-v1', matches: [] }));
  });
  await withTestServer(fixtureApp(client).app, async (url) => {
    const first = await fetch(url + matchPath, { headers: ownerHeaders });
    assert.equal(first.status, 503);
    assert.equal(
      ((await first.json()) as { error: { code: string } }).error.code,
      'AI_MATCHING_UNAVAILABLE',
    );
    assert.equal((await fetch(url + matchPath, { headers: ownerHeaders })).status, 200);
  });
});

void it('missing or incorrect AI credentials remain controlled failures, with no transport details in Express', async () => {
  for (const apiKey of [undefined, 'wrong-service-test-key']) {
    const client = createAiClient({ ...config, apiKey }, (_url, init) => {
      assert.notEqual(new Headers(init?.headers).get('X-CampusConnect-AI-Key'), config.apiKey);
      return Promise.resolve(
        Response.json({ detail: 'invalid internal service credential' }, { status: 401 }),
      );
    });
    await withTestServer(fixtureApp(client).app, async (url) => {
      const response = await fetch(url + matchPath, { headers: ownerHeaders });
      assert.equal(response.status, 503);
      const text = await response.text();
      assert.ok(text.includes('AI_MATCHING_UNAVAILABLE'));
      assert.ok(
        !text.includes('wrong-service-test-key') && !text.includes('internal service credential'),
      );
    });
  }
});

void it('unauthenticated and unrelated students cannot reach matching or inspect other claims', async () => {
  const client = createAiClient(config, () => {
    throw new Error('AI must not be reached');
  });
  const fixture = fixtureApp(client);
  await withTestServer(fixture.app, async (url) => {
    assert.equal((await fetch(url + matchPath)).status, 401);
    assert.equal(
      (await fetch(url + matchPath, { headers: { authorization: 'Bearer fixture-student' } }))
        .status,
      403,
    );
    assert.equal(fixture.reads(), 0);
    const claims = await fetch(`${url}/api/lost-found/reports/${sourceId}/claims`, {
      headers: { authorization: 'Bearer fixture-student' },
    });
    assert.equal(claims.status, 200);
    assert.deepEqual(((await claims.json()) as { data: { claims: unknown[] } }).data.claims, []);
  });
});

void it(
  'live Express controller and service authenticate to the local FastAPI semantic matcher',
  { skip: process.env.RUN_LOST_FOUND_LIVE_AI !== '1' },
  async () => {
    assert.ok(env.aiServiceApiKey);
    const serviceUrl = new URL(env.aiServiceUrl ?? '');
    assert.ok(
      ['127.0.0.1', 'localhost'].includes(serviceUrl.hostname),
      'Live QA must target loopback only.',
    );
    const client = createAiClient({
      ...config,
      apiKey: env.aiServiceApiKey,
      url: env.aiServiceUrl,
      timeoutMs: env.aiServiceTimeoutMs,
    });
    assert.equal((await client.getReadiness()).status, 'AVAILABLE');
    const fixture = fixtureApp(client);
    await withTestServer(fixture.app, async (url) => {
      const matched = await fetch(url + matchPath, { headers: ownerHeaders });
      assert.equal(matched.status, 200);
      const body = (await matched.json()) as {
        data: { matcherVersion: string; matches: { report: { id: string } }[] };
      };
      assert.equal(body.data.matcherVersion, 'lf-semantic-v1');
      assert.equal(body.data.matches[0]?.report.id, candidateId);
      fixture.noCandidates();
      const empty = await fetch(url + matchPath, { headers: ownerHeaders });
      assert.equal(empty.status, 200);
      const emptyBody = (await empty.json()) as { data: { matches: unknown[] } };
      assert.deepEqual(emptyBody.data.matches, []);
      if (process.env.LOST_FOUND_AI_QA_OUTPUT)
        await writeFile(
          process.env.LOST_FOUND_AI_QA_OUTPUT,
          JSON.stringify({ source, matched: body.data, empty: emptyBody.data }, null, 2),
        );
    });
  },
);
