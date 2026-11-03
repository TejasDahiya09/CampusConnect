import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { describe } from 'node:test';
import express, { type RequestHandler } from 'express';
import {
  AccountStatus,
  ListingStatus,
  LostFoundStatus,
  ProjectStatus,
  ServiceStatus,
} from '../src/generated/prisma/client.js';
import {
  buildLostFoundAssistantWhere,
  buildMarketplaceAssistantWhere,
  buildServiceAssistantWhere,
  buildTeamUpAssistantWhere,
  type AssistantRetrievalRepository,
} from '../src/modules/assistant/assistant.repository.js';
import { createAssistantRouter } from '../src/modules/assistant/assistant.routes.js';
import {
  ASSISTANT_DATABASE_CANDIDATE_LIMIT,
  ASSISTANT_PER_SOURCE_LIMIT,
  ASSISTANT_TOTAL_EVIDENCE_LIMIT,
  createAssistantRetrievalService,
  normalizeRetrievalTerms,
} from '../src/modules/assistant/assistant.service.js';
import type {
  AssistantCandidate,
  AssistantSourceType,
} from '../src/modules/assistant/assistant.types.js';
import { parseAssistantRetrievalQuery } from '../src/modules/assistant/assistant.validation.js';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { withTestServer } from './helpers/test-server.js';

const sourceTypes: readonly AssistantSourceType[] = [
  'MARKETPLACE',
  'LOST_FOUND',
  'TEAMUP',
  'SERVICE',
];
const sourceIndex: Readonly<Record<AssistantSourceType, number>> = {
  LOST_FOUND: 2,
  MARKETPLACE: 1,
  SERVICE: 4,
  TEAMUP: 3,
};

const candidate = (
  sourceType: AssistantSourceType,
  index = 1,
  overrides: Partial<AssistantCandidate> = {},
): AssistantCandidate => ({
  attributes: ['Library', 'Books'],
  createdAt: new Date(`2026-01-${String(index).padStart(2, '0')}T00:00:00.000Z`),
  description: 'A calculator available for students near the library.',
  id: `${sourceIndex[sourceType]}1111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
  searchText: 'calculator students library books',
  sourceType,
  title: `Calculator ${String(index).padStart(2, '0')}`,
  ...overrides,
});

const createRepository = (
  records: Readonly<Partial<Record<AssistantSourceType, readonly AssistantCandidate[]>>>,
) => {
  const calls: { limit: number; sourceType: AssistantSourceType; terms: readonly string[] }[] = [];
  const repository: AssistantRetrievalRepository = {
    retrieve: (sourceType, terms, limit) => {
      calls.push({ limit, sourceType, terms });
      return Promise.resolve(records[sourceType] ?? []);
    },
  };
  return { calls, repository };
};

void test('assistant retrieval validation normalizes input and rejects malformed queries', () => {
  assert.deepEqual(
    parseAssistantRetrievalQuery({ q: '  Find   calculators ', types: 'service,teamup' }),
    {
      question: 'Find calculators',
      sourceTypes: ['SERVICE', 'TEAMUP'],
    },
  );
  for (const input of [
    {},
    { q: ' ' },
    { q: 'x'.repeat(301) },
    { q: 'valid', types: '' },
    { q: 'valid', types: 'MESSAGE' },
    { q: 'valid', private: 'true' },
  ]) {
    assert.throws(() => parseAssistantRetrievalQuery(input), /Invalid assistant retrieval request/);
  }
});

void test('natural-language normalization is bounded and returns insufficient evidence safely', async () => {
  assert.deepEqual(normalizeRetrievalTerms('Where can you please help me find THE calculator?'), [
    'calculator',
  ]);
  assert.deepEqual(normalizeRetrievalTerms('Is anyone offering pottery kiln repair?'), [
    'pottery',
    'kiln',
    'repair',
  ]);
  assert.equal(normalizeRetrievalTerms('one two three four five six seven eight nine').length, 8);
  const { calls, repository } = createRepository({});
  const result = await createAssistantRetrievalService(repository).retrieve({
    question: 'where can I find this',
    sourceTypes,
  });
  assert.equal(result.retrievalStatus, 'insufficient_evidence');
  assert.deepEqual(result.evidence, []);
  assert.equal(calls.length, 0);
});

void test('retrieval emits deterministic bounded evidence for all four public sources', async () => {
  const records: Readonly<Record<AssistantSourceType, readonly AssistantCandidate[]>> = {
    LOST_FOUND: Array.from({ length: 7 }, (_, index) => candidate('LOST_FOUND', index + 1)),
    MARKETPLACE: Array.from({ length: 7 }, (_, index) => candidate('MARKETPLACE', index + 1)),
    SERVICE: Array.from({ length: 7 }, (_, index) => candidate('SERVICE', index + 1)),
    TEAMUP: Array.from({ length: 7 }, (_, index) => candidate('TEAMUP', index + 1)),
  };
  const snapshot = JSON.stringify(records);
  const { calls, repository } = createRepository(records);
  const service = createAssistantRetrievalService(repository);
  const input = { question: 'calculator library', sourceTypes } as const;
  const first = await service.retrieve(input);
  const second = await service.retrieve(input);

  assert.deepEqual(first, second);
  assert.equal(first.contractVersion, 'campus-assistant-grounded-v1');
  assert.equal(first.retrievalStatus, 'candidates');
  assert.equal(first.evidence.length, ASSISTANT_TOTAL_EVIDENCE_LIMIT);
  for (const sourceType of sourceTypes) {
    assert.equal(
      first.evidence.filter((item) => item.sourceType === sourceType).length,
      ASSISTANT_PER_SOURCE_LIMIT,
    );
  }
  assert.equal(calls.length, 8);
  assert.ok(calls.every((call) => call.limit === ASSISTANT_DATABASE_CANDIDATE_LIMIT));
  assert.equal(JSON.stringify(records), snapshot);
});

void test('evidence uses real internal routes and redacts public contact information', async () => {
  const unsafe = candidate('MARKETPLACE', 1, {
    attributes: ['Contact @seller', 'https://signed.example/object?token=secret'],
    description: 'Email seller@example.edu or call +91 98765 43210 for calculator details.',
    searchText: 'calculator seller@example.edu +91 98765 43210',
    title: 'Calculator from @seller',
  });
  const { repository } = createRepository({ MARKETPLACE: [unsafe] });
  const result = await createAssistantRetrievalService(repository).retrieve({
    question: 'calculator',
    sourceTypes: ['MARKETPLACE'],
  });
  const item = result.evidence[0];
  assert.ok(item);
  assert.equal(item.route, `/marketplace/${unsafe.id}`);
  assert.equal(item.sourceId, unsafe.id);
  const serialized = JSON.stringify(result);
  for (const privateValue of [
    'seller@example.edu',
    '98765',
    '@seller',
    'signed.example',
    'token=secret',
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

void test('repository visibility builders preserve existing public lifecycle rules', () => {
  const marketplace = buildMarketplaceAssistantWhere(['calculator']);
  const lostFound = buildLostFoundAssistantWhere(['calculator']);
  const teamUp = buildTeamUpAssistantWhere(['calculator']);
  const services = buildServiceAssistantWhere(['calculator']);

  assert.deepEqual(marketplace.status, { in: [ListingStatus.ACTIVE, ListingStatus.SOLD] });
  assert.deepEqual(marketplace.seller, { status: AccountStatus.ACTIVE });
  assert.deepEqual(lostFound.status, {
    in: [LostFoundStatus.OPEN, LostFoundStatus.MATCHED, LostFoundStatus.CLAIM_PENDING],
  });
  assert.deepEqual(lostFound.reporter, { status: AccountStatus.ACTIVE });
  assert.deepEqual(teamUp.status, { in: [ProjectStatus.OPEN, ProjectStatus.FULL] });
  assert.deepEqual(teamUp.owner, { status: AccountStatus.ACTIVE });
  assert.equal(services.status, ServiceStatus.ACTIVE);
  assert.deepEqual(services.provider, { status: AccountStatus.ACTIVE });
});

void describe('assistant retrieval route', () => {
  void test('rejects unauthenticated requests before retrieval', async () => {
    await withTestServer(createApp(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/assistant/retrieval?q=calculator`);
      assert.equal(response.status, 401);
      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED');

      const reranked = await fetch(`${baseUrl}/api/assistant/reranked-retrieval?q=calculator`);
      assert.equal(reranked.status, 401);

      const generated = await fetch(`${baseUrl}/api/assistant/ask`, {
        body: JSON.stringify({ question: 'Where is a calculator?' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      assert.equal(generated.status, 401);
    });
  });

  void test('returns candidates only after the authentication boundary', async () => {
    let authenticated = false;
    const requireAuth: RequestHandler = (_request, _response, next) => {
      authenticated = true;
      next();
    };
    const { repository } = createRepository({ MARKETPLACE: [candidate('MARKETPLACE')] });
    const app = express();
    app.use(
      '/api/assistant',
      createAssistantRouter({
        requireAuth,
        service: createAssistantRetrievalService(repository),
      }),
    );
    app.use(errorHandler);

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/assistant/retrieval?q=calculator&types=MARKETPLACE`,
      );
      assert.equal(response.status, 200);
      assert.equal(authenticated, true);
      const body = (await response.json()) as {
        data: { evidence: readonly unknown[] };
        success: boolean;
      };
      assert.equal(body.success, true);
      assert.equal(body.data.evidence.length, 1);
    });
  });

  void test('database failures use the existing safe error response', async () => {
    const repository: AssistantRetrievalRepository = {
      retrieve: () => Promise.reject(new Error('database-host-private-detail')),
    };
    const app = express();
    app.use(
      '/api/assistant',
      createAssistantRouter({
        requireAuth: (_request, _response, next) => next(),
        service: createAssistantRetrievalService(repository),
      }),
    );
    app.use(errorHandler);

    await withTestServer(app, async (baseUrl) => {
      const originalError = console.error;
      console.error = () => undefined;
      try {
        const response = await fetch(`${baseUrl}/api/assistant/retrieval?q=calculator`);
        assert.equal(response.status, 500);
        const serialized = JSON.stringify(await response.json());
        assert.equal(serialized.includes('database-host-private-detail'), false);
        assert.ok(serialized.includes('INTERNAL_SERVER_ERROR'));
      } finally {
        console.error = originalError;
      }
    });
  });
});

void test('retrieval implementation has no FastAPI, Gemini, or mutation integration', async () => {
  const files = [
    'src/modules/assistant/assistant.controller.ts',
    'src/modules/assistant/assistant.repository.ts',
    'src/modules/assistant/assistant.service.ts',
  ];
  const source = (
    await Promise.all(files.map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))
  ).join('\n');
  for (const forbidden of [
    'ai-service.client',
    'gemini',
    '.create(',
    '.update(',
    '.delete(',
    '$transaction',
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});
