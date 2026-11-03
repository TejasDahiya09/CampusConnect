import { performance } from 'node:perf_hooks';
import {
  ASSISTANT_DATABASE_CANDIDATE_LIMIT,
  createAssistantRetrievalService,
} from '../src/modules/assistant/assistant.service.js';
import type { AssistantRetrievalRepository } from '../src/modules/assistant/assistant.repository.js';
import type { AiClient } from '../src/integrations/ai/ai-client.js';
import { createAssistantRerankingService } from '../src/modules/assistant/assistant-reranking.service.js';
import { createAssistantAnswerService } from '../src/modules/assistant/assistant-answer.service.js';
import { assistantEvaluationCases, assistantEvaluationRecords } from './assistant-dataset.js';

const repository: AssistantRetrievalRepository = {
  retrieve(sourceType, terms, limit) {
    return Promise.resolve(
      assistantEvaluationRecords
        .filter(
          (record) =>
            record.sourceType === sourceType &&
            terms.some((term) => record.searchText.toLocaleLowerCase().includes(term)),
        )
        .sort(
          (left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id),
        )
        .slice(0, limit),
    );
  },
};

const service = createAssistantRetrievalService(repository);
let relevantTotal = 0;
let retrievedRelevant = 0;
let precisionAtFiveTotal = 0;
let reciprocalRankTotal = 0;
let noResultCorrect = 0;
let noResultTotal = 0;
const latencies: number[] = [];
let maximumEvidenceBytes = 0;

for (const evaluationCase of assistantEvaluationCases) {
  const started = performance.now();
  const result = await service.retrieve({
    question: evaluationCase.question,
    sourceTypes: evaluationCase.sourceTypes,
  });
  latencies.push(performance.now() - started);
  maximumEvidenceBytes = Math.max(
    maximumEvidenceBytes,
    Buffer.byteLength(JSON.stringify(result), 'utf8'),
  );
  const ids = result.evidence.map(({ sourceId }) => sourceId);
  if (evaluationCase.relevantIds.length === 0) {
    noResultTotal += 1;
    if (ids.length === 0) noResultCorrect += 1;
    continue;
  }
  const relevant = new Set(evaluationCase.relevantIds);
  relevantTotal += relevant.size;
  retrievedRelevant += ids.slice(0, 10).filter((id) => relevant.has(id)).length;
  precisionAtFiveTotal += ids.slice(0, 5).filter((id) => relevant.has(id)).length / 5;
  const firstRelevant = ids.findIndex((id) => relevant.has(id));
  reciprocalRankTotal += firstRelevant < 0 ? 0 : 1 / (firstRelevant + 1);
}

latencies.sort((left, right) => left - right);
const answerable = assistantEvaluationCases.filter(
  ({ relevantIds }) => relevantIds.length > 0,
).length;

const olderTarget = {
  ...assistantEvaluationRecords[0]!,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  id: 'older-scientific-calculator',
};
const newest = Array.from({ length: ASSISTANT_DATABASE_CANDIDATE_LIMIT }, (_, index) => ({
  ...assistantEvaluationRecords[2]!,
  createdAt: new Date(`2026-10-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
  id: `newer-calculator-${String(index + 1).padStart(2, '0')}`,
  searchText: 'scientific calculator case accessory',
  title: `Scientific calculator accessory ${index + 1}`,
}));
const boundedRepository: AssistantRetrievalRepository = {
  retrieve: (_sourceType, _terms, limit) =>
    Promise.resolve([...newest, olderTarget].slice(0, limit)),
};
const bounded = await createAssistantRetrievalService(boundedRepository).retrieve({
  question: 'scientific calculator',
  sourceTypes: ['MARKETPLACE'],
});

const mockedAiClient: AiClient = {
  generateAssistant: (request) =>
    Promise.resolve({
      data: {
        answer: 'A grounded mocked answer for local orchestration measurement.',
        citationIds: request.evidence.slice(0, 1).map(({ sourceId }) => sourceId),
        contractVersion: 'campus-assistant-grounded-v1',
        errorCode: null,
        model: 'gemini-2.5-flash',
        provider: 'gemini',
        status: 'answered',
      },
      status: 'AVAILABLE',
    }),
  getHealth: () => Promise.resolve({ status: 'DISABLED' }),
  getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
  getVersion: () => Promise.resolve({ status: 'DISABLED' }),
  matchLostFound: () => Promise.resolve({ status: 'DISABLED' }),
  rerankAssistant: (request) =>
    Promise.resolve({
      data: {
        contractVersion: 'campus-assistant-grounded-v1',
        embeddingModel: 'evaluation-deterministic-reranker',
        rankings: request.evidence.slice(0, request.limit).map(({ relevance, sourceId }) => ({
          score: relevance,
          sourceId,
        })),
        rerankerVersion: 'assistant-minilm-rerank-v1',
        status: request.evidence.length === 0 ? 'empty' : 'ranked',
      },
      status: 'AVAILABLE',
    }),
};
const mockedReranking = createAssistantRerankingService(service, mockedAiClient);
const mockedAnswer = createAssistantAnswerService(mockedReranking, mockedAiClient);
const orchestrationLatencies: number[] = [];
let orchestrationResponseBytes = 0;
for (let repetition = 0; repetition < 50; repetition += 1) {
  const started = performance.now();
  const response = await mockedAnswer.answer({
    question: assistantEvaluationCases[0]!.question,
    sourceTypes: assistantEvaluationCases[0]!.sourceTypes,
  });
  orchestrationLatencies.push(performance.now() - started);
  orchestrationResponseBytes = Buffer.byteLength(JSON.stringify(response), 'utf8');
}
orchestrationLatencies.sort((left, right) => left - right);

const report = {
  dataset: 'campus-assistant-evaluation-v1',
  records: assistantEvaluationRecords.length,
  cases: assistantEvaluationCases.length,
  candidateRetrievalRecall: relevantTotal === 0 ? 0 : retrievedRelevant / relevantTotal,
  recallAt10: relevantTotal === 0 ? 0 : retrievedRelevant / relevantTotal,
  meanPrecisionAt5: answerable === 0 ? 0 : precisionAtFiveTotal / answerable,
  meanReciprocalRank: answerable === 0 ? 0 : reciprocalRankTotal / answerable,
  noResultAccuracy: noResultTotal === 0 ? 0 : noResultCorrect / noResultTotal,
  retrievalMedianMs: latencies[Math.floor(latencies.length / 2)] ?? 0,
  retrievalMaximumMs: latencies.at(-1) ?? 0,
  maximumEvidenceBytes,
  mockedEndToEndMedianMs:
    orchestrationLatencies[Math.floor(orchestrationLatencies.length / 2)] ?? 0,
  mockedEndToEndMaximumMs: orchestrationLatencies.at(-1) ?? 0,
  mockedResponseBytes: orchestrationResponseBytes,
  newest20Limitation: {
    targetIncluded: bounded.evidence.some(({ sourceId }) => sourceId === olderTarget.id),
    candidateLimit: ASSISTANT_DATABASE_CANDIDATE_LIMIT,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
