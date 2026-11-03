import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssistantRetrievalService } from '../src/modules/assistant/assistant.service.js';
import { createAssistantRerankingService } from '../src/modules/assistant/assistant-reranking.service.js';
import { createAssistantAnswerService } from '../src/modules/assistant/assistant-answer.service.js';
import { publicTeamCount } from '../src/modules/assistant/assistant-facts.js';
import type {
  AssistantCandidate,
  AssistantFacts,
} from '../src/modules/assistant/assistant.types.js';
import type { AiClient } from '../src/integrations/ai/ai-client.js';

const row = (id: string, title: string, facts: AssistantFacts): AssistantCandidate => ({
  id,
  title,
  description: title,
  searchText: title + ' library Student Centre',
  attributes: [],
  createdAt: new Date('2026-11-02'),
  sourceType: facts.kind === 'TEAMUP' ? 'TEAMUP' : 'LOST_FOUND',
  facts,
});
const disabled: AiClient = {
  getHealth: () => Promise.resolve({ status: 'DISABLED' }),
  getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
  getVersion: () => Promise.resolve({ status: 'DISABLED' }),
  matchLostFound: () => Promise.resolve({ status: 'DISABLED' }),
  generateAssistant: () => Promise.resolve({ status: 'DISABLED' }),
};
const make = (rows: readonly AssistantCandidate[], client = disabled) => {
  const retrieve = createAssistantRetrievalService({
    retrieve: (source) => Promise.resolve(rows.filter((r) => r.sourceType === source)),
  });
  return createAssistantAnswerService(createAssistantRerankingService(retrieve, client), client);
};
const ask = (question: string) => ({
  question,
  sourceTypes: ['MARKETPLACE', 'LOST_FOUND', 'TEAMUP', 'SERVICE'] as const,
});
const lost = row('lost-bag', 'Grey backpack reported lost', {
  kind: 'LOST_FOUND',
  reportType: 'LOST',
  status: 'OPEN',
  location: 'Student Centre',
});
const bag = row('found-bag', 'Black backpack', {
  kind: 'LOST_FOUND',
  reportType: 'FOUND',
  status: 'OPEN',
  location: 'Library',
});
const bottle = row('found-bottle', 'Found water bottle', {
  kind: 'LOST_FOUND',
  reportType: 'FOUND',
  status: 'OPEN',
  location: 'Student Centre',
});

void test('personal lost-bag request searches FOUND only and never calls LOST a recovery', async () => {
  const answer = await make([lost, bag, bottle]).answer(ask('lost my bag'));
  assert.equal(answer.citations.length, 1);
  assert.equal(answer.citations[0]?.sourceId, 'found-bag');
  assert.match(answer.citations[0]?.details ?? '', /Found report/);
  assert.match(answer.answer, /Similarity does not prove ownership/);
  assert.equal(answer.answer.includes('Grey backpack'), false);
  assert.ok(answer.actions?.some((a) => a.route.includes('type=lost')));
});
void test('a LOST bag alone is not evidence of a matching FOUND item', async () => {
  const answer = await make([lost, bottle]).answer(ask('I lost my bag'));
  assert.equal(answer.status, 'insufficient_evidence');
  assert.match(answer.answer, /No matching eligible FOUND reports/);
  assert.deepEqual(answer.citations, []);
});
void test('forgotten bottle uses real FOUND title, location and status as a possible match', async () => {
  const answer = await make([lost, bag, bottle]).answer(ask('forgot my bottle'));
  assert.equal(answer.citations[0]?.sourceId, 'found-bottle');
  assert.match(answer.answer, /Found water bottle/);
  assert.match(answer.answer, /Open/);
  assert.match(answer.answer, /Student Centre/);
  assert.match(answer.answer, /Potentially relevant FOUND/);
});
for (const phrase of [
  'project of 3 members',
  'project of 4 teammates',
  'project of three members',
]) {
  void test(`ambiguous size gets the same clarification without querying: ${phrase}`, async () => {
    const service = createAssistantAnswerService(
      {
        retrieve: () => {
          throw Error('Must clarify first');
        },
      },
      disabled,
    );
    const answer = await service.answer(ask(phrase));
    assert.equal(answer.status, 'answered');
    assert.match(answer.answer, /maximum total/);
    assert.match(answer.answer, /current members/);
    assert.match(answer.answer, /additional teammates/);
    assert.deepEqual(answer.citations, []);
  });
}
void test('total capacity, current membership and additional openings are distinct', async () => {
  const projects = [
    row('four', 'Four-capacity project', {
      kind: 'TEAMUP',
      status: 'OPEN',
      maxMembers: 4,
      currentMembers: 2,
    }),
    row('five', 'Five-capacity project', {
      kind: 'TEAMUP',
      status: 'OPEN',
      maxMembers: 5,
      currentMembers: 3,
    }),
    row('unknown', 'Unknown capacity project', {
      kind: 'TEAMUP',
      status: 'OPEN',
      maxMembers: null,
      currentMembers: null,
    }),
  ];
  const service = make(projects);
  assert.equal(
    (await service.answer(ask('project with total team size 4'))).citations[0]?.sourceId,
    'four',
  );
  assert.equal(
    (await service.answer(ask('project with 3 current members'))).citations[0]?.sourceId,
    'five',
  );
  assert.equal(
    (await service.answer(ask('project needing 2 additional teammates'))).citations.length,
    2,
  );
  assert.equal(
    (await service.answer(ask('project needing 3 additional teammates'))).citations.length,
    0,
  );
});
void test('absent metadata is not an exact match or a fabricated zero-result certainty', async () => {
  const answer = await make([
    row('unknown', 'Unknown project', {
      kind: 'TEAMUP',
      status: 'OPEN',
      maxMembers: null,
      currentMembers: null,
    }),
  ]).answer(ask('project with total team size 4'));
  assert.match(answer.answer, /do not establish/);
  assert.equal(answer.citations.length, 0);
  assert.equal(answer.provider, null);
  assert.ok(answer.actions?.some((a) => a.route === '/teamup'));
});
void test('malformed/duplicate member JSON yields unknown rather than made-up counts', () => {
  assert.equal(publicTeamCount([], 4), 1);
  const member = {
    userId: 'private-member-id',
    joinedAt: '2026-11-02',
    applicationId: 'private-application-id',
  };
  assert.equal(publicTeamCount([member], 4), 2);
  assert.equal(publicTeamCount([member, member], 4), null);
  assert.equal(publicTeamCount([{}], 4), null);
});
void test('incorrect generated recovery claims are replaced with truthful typed records', async () => {
  const client: AiClient = {
    ...disabled,
    generateAssistant: () =>
      Promise.resolve({
        status: 'AVAILABLE',
        data: {
          contractVersion: 'campus-assistant-grounded-v1',
          answer: 'We definitely recovered your bag. It was reported lost.',
          citationIds: ['found-bag'],
          provider: 'gemini',
          model: 'synthetic-only',
          status: 'answered',
          errorCode: null,
        },
      }),
  };
  const answer = await make([lost, bag], client).answer(ask('I lost my bag'));
  assert.equal(answer.provider, null);
  assert.equal(answer.answer.includes('definitely recovered'), false);
  assert.equal(answer.citations[0]?.sourceId, 'found-bag');
});
void test('search failure retains reporting guidance without claiming zero found reports', async () => {
  const answer = await createAssistantAnswerService(
    { retrieve: () => Promise.reject(Error('private-db-error')) },
    disabled,
  ).answer(ask('I lost my bag'));
  assert.equal(answer.errorCode, 'retrieval_unavailable');
  assert.match(answer.answer, /Report lost/);
  assert.match(answer.answer, /could not retrieve/);
  assert.equal(answer.answer.includes('No matching'), false);
  assert.equal(answer.answer.includes('private-db-error'), false);
});

void test('model refusal does not discard an eligible typed found-bottle record', async () => {
  const client: AiClient = {
    ...disabled,
    generateAssistant: () =>
      Promise.resolve({
        status: 'AVAILABLE',
        data: {
          contractVersion: 'campus-assistant-grounded-v1',
          answer: 'No records can be summarized.',
          citationIds: [],
          provider: 'gemini',
          model: 'synthetic-only',
          status: 'insufficient_evidence',
          errorCode: null,
        },
      }),
  };
  const answer = await make([bottle], client).answer(ask('forgot my bottle'));
  assert.equal(answer.status, 'answered');
  assert.equal(answer.provider, null);
  assert.equal(answer.citations[0]?.sourceId, 'found-bottle');
  assert.match(answer.citations[0]?.details ?? '', /Found report \| Open \| Student Centre/);
  assert.match(answer.answer, /does not prove ownership/);
});
