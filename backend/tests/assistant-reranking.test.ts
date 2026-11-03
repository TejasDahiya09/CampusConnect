import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiClient, type AiClient } from '../src/integrations/ai/ai-client.js';
import type {
  AiAssistantRerankResponse,
  AiAssistantRerankRequest,
  AiClientResult,
  AiServiceConfig,
} from '../src/integrations/ai/ai.types.js';
import {
  ASSISTANT_RERANK_LIMIT,
  createAssistantRerankingService,
} from '../src/modules/assistant/assistant-reranking.service.js';
import type { AssistantEvidence } from '../src/modules/assistant/assistant.types.js';

const enabledConfig: AiServiceConfig = {
  apiKey: 'test-only-internal-key',
  enabled: true,
  generationTimeoutMs: 25,
  timeoutMs: 20,
  url: 'http://127.0.0.1:8001',
};

const evidence = (index: number): AssistantEvidence => ({
  relevance: 0.25,
  route: `/marketplace/11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
  snippet: `Public calculator listing ${index}`,
  sourceId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
  sourceType: 'MARKETPLACE',
  title: `Calculator ${index}`,
});

const lexicalService = (records: readonly AssistantEvidence[]) => ({
  retrieve: () =>
    Promise.resolve({
      contractVersion: 'campus-assistant-grounded-v1' as const,
      evidence: records,
      retrievalStatus:
        records.length > 0 ? ('candidates' as const) : ('insufficient_evidence' as const),
    }),
});

const aiClient = (
  rerank: (request: AiAssistantRerankRequest) => Promise<AiClientResult<AiAssistantRerankResponse>>,
): AiClient => ({
  getHealth: () => Promise.resolve({ status: 'DISABLED' }),
  getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
  getVersion: () => Promise.resolve({ status: 'DISABLED' }),
  matchLostFound: () => Promise.resolve({ status: 'DISABLED' }),
  rerankAssistant: rerank,
});

const available = (
  rankings: readonly { readonly score: number; readonly sourceId: string }[],
): AiClientResult<AiAssistantRerankResponse> => ({
  data: {
    contractVersion: 'campus-assistant-grounded-v1',
    embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
    rankings,
    rerankerVersion: 'assistant-minilm-rerank-v1',
    status: 'ranked',
  },
  status: 'AVAILABLE',
});

void test('Express reconstructs semantic order only from authorized lexical evidence', async () => {
  const first = evidence(1);
  const second = evidence(2);
  let requestEvidence: readonly AssistantEvidence[] = [];
  const client = aiClient((request) => {
    requestEvidence = request.evidence;
    return Promise.resolve(
      available([
        { score: 0.9, sourceId: second.sourceId },
        { score: 0.4, sourceId: first.sourceId },
      ]),
    );
  });
  const result = await createAssistantRerankingService(
    lexicalService([first, second]),
    client,
  ).retrieve({ question: 'calculator', sourceTypes: ['MARKETPLACE'] });

  assert.equal(result.retrievalMode, 'semantic');
  assert.deepEqual(
    result.evidence.map((item) => item.sourceId),
    [second.sourceId, first.sourceId],
  );
  assert.equal(result.evidence[0]?.title, second.title);
  assert.deepEqual(requestEvidence, [first, second]);
});

void test('unknown IDs, duplicate IDs, invalid scores, and excessive output fall back safely', async () => {
  const records = Array.from({ length: 12 }, (_, index) => evidence(index + 1));
  const invalidRankings = [
    [{ sourceId: 'unauthorized-id', score: 0.9 }],
    [
      { sourceId: records[0]!.sourceId, score: 0.9 },
      { sourceId: records[0]!.sourceId, score: 0.8 },
    ],
    [{ sourceId: records[0]!.sourceId, score: Number.NaN }],
    records.slice(0, 11).map((item) => ({ sourceId: item.sourceId, score: 0.5 })),
  ];
  for (const rankings of invalidRankings) {
    const result = await createAssistantRerankingService(
      lexicalService(records),
      aiClient((_request) => Promise.resolve(available(rankings))),
    ).retrieve({ question: 'calculator', sourceTypes: ['MARKETPLACE'] });
    assert.equal(result.retrievalMode, 'lexical_fallback');
    assert.deepEqual(result.evidence, records.slice(0, ASSISTANT_RERANK_LIMIT));
  }
});

void test('disabled, unavailable, and malformed AI results preserve lexical retrieval', async () => {
  const records = [evidence(1), evidence(2)];
  for (const result of [
    { status: 'DISABLED' as const },
    { code: 'AI_SERVICE_TIMEOUT' as const, status: 'UNAVAILABLE' as const },
  ]) {
    const response = await createAssistantRerankingService(
      lexicalService(records),
      aiClient((_request) => Promise.resolve(result)),
    ).retrieve({ question: 'calculator', sourceTypes: ['MARKETPLACE'] });
    assert.equal(response.retrievalMode, 'lexical_fallback');
    assert.deepEqual(response.evidence, records);
  }
});

void test('no authorized evidence skips the AI service', async () => {
  let calls = 0;
  const result = await createAssistantRerankingService(
    lexicalService([]),
    aiClient((_request) => {
      calls += 1;
      return Promise.resolve(available([]));
    }),
  ).retrieve({ question: 'calculator', sourceTypes: ['MARKETPLACE'] });
  assert.equal(result.retrievalMode, 'insufficient_evidence');
  assert.deepEqual(result.evidence, []);
  assert.equal(calls, 0);
});

void test('AI client sends the protected bounded contract and validates returned IDs', async () => {
  const authorized = evidence(1);
  const client = createAiClient(enabledConfig, (input, init) => {
    assert.equal(input, 'http://127.0.0.1:8001/api/v1/assistant/rerank');
    assert.equal(new Headers(init?.headers).get('X-CampusConnect-AI-Key'), enabledConfig.apiKey);
    const requestBody = init?.body;
    assert.equal(typeof requestBody, 'string');
    if (typeof requestBody !== 'string') throw new Error('expected serialized AI request');
    const body = JSON.parse(requestBody) as Record<string, unknown>;
    assert.equal(body.contract_version, 'campus-assistant-grounded-v1');
    assert.equal(JSON.stringify(body).includes('sellerId'), false);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          contract_version: 'campus-assistant-grounded-v1',
          embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
          rankings: [{ score: 0.75, source_id: authorized.sourceId }],
          reranker_version: 'assistant-minilm-rerank-v1',
          status: 'ranked',
        }),
        { status: 200 },
      ),
    );
  });
  const result = await client.rerankAssistant?.({
    contractVersion: 'campus-assistant-grounded-v1',
    evidence: [authorized],
    limit: 10,
    question: 'calculator',
  });
  assert.equal(result?.status, 'AVAILABLE');
});

void test('AI client rejects unknown, duplicate, unsorted, nonfinite, or extra response data', async () => {
  const authorized = evidence(1);
  const invalidBodies = [
    [{ score: 0.8, source_id: 'unknown' }],
    [
      { score: 0.8, source_id: authorized.sourceId },
      { score: 0.7, source_id: authorized.sourceId },
    ],
    [{ score: null, source_id: authorized.sourceId }],
    [{ score: 0.8, source_id: authorized.sourceId, private: true }],
  ];
  for (const rankings of invalidBodies) {
    const client = createAiClient(enabledConfig, () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            contract_version: 'campus-assistant-grounded-v1',
            embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
            rankings,
            reranker_version: 'assistant-minilm-rerank-v1',
            status: 'ranked',
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await client.rerankAssistant?.({
      contractVersion: 'campus-assistant-grounded-v1',
      evidence: [authorized],
      limit: 10,
      question: 'calculator',
    });
    assert.equal(result?.status, 'UNAVAILABLE');
  }
});
