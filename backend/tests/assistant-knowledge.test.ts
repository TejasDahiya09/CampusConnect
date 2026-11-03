import assert from 'node:assert/strict';
import test from 'node:test';
import type { AiClient } from '../src/integrations/ai/ai-client.js';
import { createAssistantAnswerService } from '../src/modules/assistant/assistant-answer.service.js';
import {
  campusConnectSupportEmail,
  findDeterministicAssistantReply,
  platformKnowledgeEntries,
} from '../src/modules/assistant/assistant-knowledge.js';

const expectedAnswers: readonly [string, 'conversation' | 'platform_knowledge'][] = [
  ['Hi', 'conversation'],
  ['Hello', 'conversation'],
  ['Hey', 'conversation'],
  ['Good morning', 'conversation'],
  ['Thanks', 'conversation'],
  ['Goodbye', 'conversation'],
  ['How are you?', 'conversation'],
  ['What is CampusConnect?', 'platform_knowledge'],
  ['Who is CampusConnect for?', 'platform_knowledge'],
  ['Is it connected to university ERP?', 'platform_knowledge'],
  ['What is Marketplace?', 'platform_knowledge'],
  ['How do I sell an item?', 'platform_knowledge'],
  ['What is Lost & Found?', 'platform_knowledge'],
  ['What is TeamUp?', 'platform_knowledge'],
  ['What are Services?', 'platform_knowledge'],
  ['How does messaging work?', 'platform_knowledge'],
  ['How do I edit my profile?', 'platform_knowledge'],
  ['What can Campus Assistant do?', 'platform_knowledge'],
];

void test('recognizes bounded conversation and verified platform knowledge questions', () => {
  for (const [question, responseType] of expectedAnswers) {
    const response = findDeterministicAssistantReply(question);
    assert.ok(response, question);
    assert.equal(response.responseType, responseType, question);
  }
});

void test('support questions return only the verified support contact', () => {
  for (const question of [
    'What is the support email?',
    'How do I contact CampusConnect?',
    'How can I report a bug?',
    'What is your support email?',
    'What is the CampusConnect email?',
    'How do I submit a technical support request?',
  ]) {
    const response = findDeterministicAssistantReply(question);
    assert.ok(response, question);
    assert.equal(response.responseType, 'platform_knowledge');
    assert.equal(response.answer.includes(campusConnectSupportEmail), true);
    assert.equal(/\b(?:phone|office hours|ticket number)\b/iu.test(response.answer), false);
  }
});

void test('mixed and discovery intents are not intercepted by deterministic routing', () => {
  for (const question of [
    'Hi, show me college bags.',
    'Can you help me find a calculator?',
    'What TeamUp projects are available?',
    'Thanks, show me tutoring services.',
    'How do I create a listing, and are any calculators for sale?',
  ]) {
    assert.equal(findDeterministicAssistantReply(question), null, question);
  }
});

void test('deterministic replies bypass retrieval and every AI-service operation', async () => {
  let retrievalCalls = 0;
  let generationCalls = 0;
  const aiClient: AiClient = {
    generateAssistant: () => {
      generationCalls += 1;
      return Promise.resolve({ status: 'DISABLED' });
    },
    getHealth: () => Promise.resolve({ status: 'DISABLED' }),
    getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
    getVersion: () => Promise.resolve({ status: 'DISABLED' }),
    matchLostFound: () => Promise.resolve({ status: 'DISABLED' }),
    rerankAssistant: () => {
      throw new Error('FastAPI must not be called for deterministic replies.');
    },
  };
  const service = createAssistantAnswerService(
    {
      retrieve: () => {
        retrievalCalls += 1;
        throw new Error('Retrieval must not run for deterministic replies.');
      },
    },
    aiClient,
  );

  for (const question of ['Hello', 'What is CampusConnect?', 'What is the support email?']) {
    const response = await service.answer({
      question,
      sourceTypes: ['MARKETPLACE', 'LOST_FOUND', 'TEAMUP', 'SERVICE'],
    });
    assert.equal(response.status, 'answered');
    assert.equal(response.citations.length, 0);
    assert.equal(response.provider, null);
    assert.equal(response.model, null);
  }
  assert.equal(retrievalCalls, 0);
  assert.equal(generationCalls, 0);
});

void test('real record discovery still follows retrieval and generation orchestration', async () => {
  let retrievalCalls = 0;
  let generationCalls = 0;
  const service = createAssistantAnswerService(
    {
      retrieve: () => {
        retrievalCalls += 1;
        return Promise.resolve({
          contractVersion: 'campus-assistant-grounded-v1',
          evidence: [
            {
              relevance: 0.8,
              route: '/marketplace/bag-one',
              snippet: 'A college bag is available for INR 1000.00.',
              sourceId: 'bag-one',
              sourceType: 'MARKETPLACE',
              title: 'College bag',
            },
          ],
          rerankerVersion: 'assistant-minilm-rerank-v1',
          retrievalMode: 'semantic',
        });
      },
    },
    {
      generateAssistant: () => {
        generationCalls += 1;
        return Promise.resolve({
          data: {
            answer: 'A college bag is available for INR 1000.00.',
            citationIds: ['bag-one'],
            contractVersion: 'campus-assistant-grounded-v1',
            errorCode: null,
            model: 'gemini-2.5-flash',
            provider: 'gemini',
            status: 'answered',
          },
          status: 'AVAILABLE',
        });
      },
      getHealth: () => Promise.resolve({ status: 'DISABLED' }),
      getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
      getVersion: () => Promise.resolve({ status: 'DISABLED' }),
      matchLostFound: () => Promise.resolve({ status: 'DISABLED' }),
    },
  );

  const response = await service.answer({
    question: 'Hi, show me college bags.',
    sourceTypes: ['MARKETPLACE'],
  });
  assert.equal(retrievalCalls, 1);
  assert.equal(generationCalls, 1);
  assert.equal(response.responseType, 'grounded');
  assert.equal(response.citations[0]?.route, '/marketplace/bag-one');
});

void test('knowledge entries have stable metadata and repository references', () => {
  assert.equal(platformKnowledgeEntries.length > 0, true);
  assert.equal(
    new Set(platformKnowledgeEntries.map(({ id }) => id)).size,
    platformKnowledgeEntries.length,
  );
  for (const entry of platformKnowledgeEntries) {
    assert.equal(entry.availability, 'implemented');
    assert.equal(entry.patterns.length > 0, true);
    assert.equal(entry.references.length > 0, true);
  }
});
