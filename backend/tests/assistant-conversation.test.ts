import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantHelpPlan } from '../src/modules/assistant/assistant-help.js';
import { createAssistantRetrievalService } from '../src/modules/assistant/assistant.service.js';
import { createAssistantAnswerService } from '../src/modules/assistant/assistant-answer.service.js';
import type { AssistantCandidate } from '../src/modules/assistant/assistant.types.js';
import type { AiClient } from '../src/integrations/ai/ai-client.js';

for (const question of [
  'I lost my bag.',
  'My bag got lost.',
  'I misplaced my bag.',
  'Someone stole my bag.',
  "I can't find my backpack.",
  'My backpack is missing.',
]) {
  void test(`lost paraphrase uses workflow guidance, not unrelated discovery: ${question}`, () => {
    const plan = assistantHelpPlan(question);
    assert.ok(plan?.guidance);
    assert.equal(plan.source, 'LOST_FOUND');
    assert.equal(plan.reportType, 'FOUND');
    assert.ok(plan.actions.some((a) => a.route === '/lost-found/new?type=lost'));
    assert.match(plan.guidance, /No report has been created/);
    if (question.includes('stole')) assert.match(plan.guidance, /campus security/);
  });
}
for (const question of ['I found an ID card.', 'Someone left a calculator in class.']) {
  void test(`found paraphrase has the correct report action: ${question}`, () => {
    const plan = assistantHelpPlan(question);
    assert.ok(plan?.answer);
    assert.ok(plan.actions.some((a) => a.route.endsWith('type=found')));
    assert.equal(plan.source, undefined);
  });
}
void test('four-turn context preserves item, colour and location and searches opposite report type', () => {
  const history = ['I lost my bag.', 'It was black.', 'Near the library.'];
  assert.match(assistantHelpPlan(history[1]!, history.slice(0, 1))?.answer ?? '', /your bag/);
  assert.match(assistantHelpPlan(history[2]!, history.slice(0, 2))?.answer ?? '', /your bag/);
  const plan = assistantHelpPlan('Can you find similar reports?', history);
  assert.equal(plan?.source, 'LOST_FOUND');
  assert.equal(plan.reportType, 'FOUND');
  assert.ok(plan.requiredTerms?.includes('backpack'));
  assert.match(plan.search ?? '', /black/);
  assert.match(plan.search ?? '', /library/);
  const reset = assistantHelpPlan('Can you find similar reports?');
  assert.ok(reset?.answer);
  assert.equal(reset.source, undefined);
  const switched = assistantHelpPlan('Can you find similar reports?', [
    ...history,
    'How do I edit my profile?',
  ]);
  assert.equal(switched?.source, undefined);
});
void test('required item relevance excludes calculator before reranking; colour ranks matching bags', async () => {
  const candidate = (id: string, title: string, text: string): AssistantCandidate => ({
    id,
    title,
    searchText: text,
    description: text,
    attributes: [],
    createdAt: new Date('2026-11-02T00:00:00Z'),
    sourceType: 'LOST_FOUND',
    facts: { kind: 'LOST_FOUND', reportType: 'FOUND', status: 'OPEN', location: 'Library' },
  });
  const rows = [
    candidate('calculator', 'Found calculator', 'black calculator in a bag near library'),
    candidate('blue-bag', 'Blue backpack', 'blue backpack library'),
    candidate('black-bag', 'Black bag', 'black bag library'),
  ];
  const plan = assistantHelpPlan('Can you find similar reports?', [
    'I lost my bag.',
    'It was black.',
    'Near the library.',
  ])!;
  const retrieval = createAssistantRetrievalService({
    retrieve: (_source, _terms, _limit, _active, type, required) => {
      assert.equal(type, 'FOUND');
      assert.ok(required?.includes('bag'));
      return Promise.resolve(rows);
    },
  });
  const result = await retrieval.retrieve({
    question: plan.search!,
    sourceTypes: ['LOST_FOUND'],
    reportType: plan.reportType!,
    requiredTerms: plan.requiredTerms!,
  });
  assert.equal(
    result.evidence.some((e) => e.sourceId === 'calculator'),
    false,
  );
  assert.equal(result.evidence[0]?.sourceId, 'black-bag');
  assert.equal(result.evidence.length, 2);
});
void test('retrieval deadline is distinct from empty results and never leaks late data', async () => {
  const client: AiClient = {
    getHealth: () => Promise.resolve({ status: 'DISABLED' }),
    getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
    getVersion: () => Promise.resolve({ status: 'DISABLED' }),
    matchLostFound: () => Promise.resolve({ status: 'DISABLED' }),
  };
  const service = createAssistantAnswerService({ retrieve: () => new Promise(() => {}) }, client, {
    retrievalTimeoutMs: 1,
  });
  const answer = await service.answer({
    question: 'Show calculators',
    sourceTypes: ['MARKETPLACE'],
  });
  assert.equal(answer.status, 'unavailable');
  assert.equal(answer.errorCode, 'retrieval_timeout');
  assert.match(answer.answer, /took too long/);
  assert.deepEqual(answer.citations, []);
});

void test('a source restriction is preserved instead of searching a different module', async () => {
  const client: AiClient = {
    getHealth: () => Promise.resolve({ status: 'DISABLED' }),
    getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
    getVersion: () => Promise.resolve({ status: 'DISABLED' }),
    matchLostFound: () => Promise.resolve({ status: 'DISABLED' }),
  };
  const service = createAssistantAnswerService(
    {
      retrieve: () => {
        throw Error('Must not search another module');
      },
    },
    client,
  );
  const answer = await service.answer({
    question: 'Show calculators in Marketplace',
    sourceTypes: ['LOST_FOUND'],
  });
  assert.equal(answer.status, 'unsupported');
  assert.deepEqual(answer.citations, []);
});

void test('expired workflow context asks for an item instead of guessing', () => {
  const plan = assistantHelpPlan('Can you find similar reports?', [
    'I lost my bag.',
    'It was black.',
    'Near the library.',
    'Thank you.',
    'How do I edit my profile?',
  ]);
  assert.equal(plan?.source, undefined);
  assert.match(plan?.answer ?? '', /What item/);
});

void test('the module name Lost & Found alone does not discard either report type', async () => {
  let calls = 0;
  const retrieve = createAssistantRetrievalService({
    retrieve: (_source, _terms, _limit, _active, type) => {
      calls += 1;
      assert.equal(type, undefined);
      return Promise.resolve([]);
    },
  });
  await retrieve.retrieve({ question: 'Lost & Found bag reports', sourceTypes: ['LOST_FOUND'] });
  assert.equal(calls, 1);
});
