import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assistantEvaluationCases,
  assistantEvaluationRecords,
} from '../evaluation/assistant-dataset.js';
import { createAssistantRetrievalService } from '../src/modules/assistant/assistant.service.js';
import type { AssistantRetrievalRepository } from '../src/modules/assistant/assistant.repository.js';

void test('RAG-5 dataset is deterministic, fictional, cross-domain, and adversarial', () => {
  assert.equal(
    new Set(assistantEvaluationRecords.map(({ id }) => id)).size,
    assistantEvaluationRecords.length,
  );
  assert.deepEqual(
    [...new Set(assistantEvaluationRecords.map(({ sourceType }) => sourceType))].sort(),
    ['LOST_FOUND', 'MARKETPLACE', 'SERVICE', 'TEAMUP'],
  );
  assert.ok(assistantEvaluationCases.some(({ relevantIds }) => relevantIds.length === 0));
  assert.ok(
    assistantEvaluationRecords.some(({ description }) =>
      description.includes('Ignore all previous instructions'),
    ),
  );
  assert.equal(JSON.stringify(assistantEvaluationRecords).includes('@campusconnect'), false);
});

void test('newest-20 retrieval boundary can exclude a relevant older record', async () => {
  const target = assistantEvaluationRecords[0]!;
  const newer = Array.from({ length: 20 }, (_, index) => ({
    ...assistantEvaluationRecords[2]!,
    createdAt: new Date(`2026-10-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
    id: `newer-${index}`,
    searchText: 'scientific calculator accessory',
    title: `Calculator accessory ${index}`,
  }));
  const repository: AssistantRetrievalRepository = {
    retrieve: (_sourceType, _terms, limit) => Promise.resolve([...newer, target].slice(0, limit)),
  };
  const result = await createAssistantRetrievalService(repository).retrieve({
    question: 'scientific calculator',
    sourceTypes: ['MARKETPLACE'],
  });
  assert.equal(
    result.evidence.some(({ sourceId }) => sourceId === target.id),
    false,
  );
});
