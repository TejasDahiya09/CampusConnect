import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ApiClientError } from '../src/services/api-client.js';
import { askAssistant, parseAssistantAnswer } from '../src/features/ai/assistant-service.js';

const citation = (sourceType: 'LOST_FOUND' | 'MARKETPLACE' | 'SERVICE' | 'TEAMUP') => {
  const routes = {
    LOST_FOUND: '/lost-found/lost-found-one',
    MARKETPLACE: '/marketplace/marketplace-one',
    SERVICE: '/services/service-one',
    TEAMUP: '/teamup/teamup-one',
  } as const;
  return {
    route: routes[sourceType],
    sourceId: `${sourceType.toLowerCase().replace('_', '-')}-one`,
    sourceType,
    title: `${sourceType} result`,
  };
};

const answer = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  answer: 'A grounded answer.',
  citations: [citation('MARKETPLACE')],
  contractVersion: 'campus-assistant-grounded-v1',
  errorCode: null,
  model: 'gemini-2.5-flash',
  provider: 'gemini',
  retrievalMode: 'semantic',
  responseType: 'grounded',
  status: 'answered',
  ...overrides,
});

void test('source details preserve trusted status and location with a bounded optional contract', () => {
  const source = { ...citation('LOST_FOUND'), details: 'Found report | Open | Central Library' };
  assert.equal(
    parseAssistantAnswer(answer({ citations: [source] })).citations[0]?.details,
    source.details,
  );
  assert.equal(parseAssistantAnswer(answer()).citations[0]?.details, undefined);
  for (const details of [42, 'x'.repeat(241), null])
    assert.throws(
      () => parseAssistantAnswer(answer({ citations: [{ ...source, details }] })),
      ApiClientError,
    );
});

void test('context is bounded and cancellation is propagated without sending secrets or signals', async () => {
  const controller = new AbortController();
  const history = ['one', 'two', 'three', 'four', 'five'];
  await askAssistant(
    { question: 'Near the library.', history, signal: controller.signal },
    (_path, init) => {
      assert.deepEqual(JSON.parse(typeof init.body === 'string' ? init.body : ''), {
        question: 'Near the library.',
        history: history.slice(-4),
      });
      assert.ok(init.signal);
      controller.abort();
      assert.equal(init.signal.aborted, true);
      return Promise.resolve(answer());
    },
  );
});

void test('workflow links allow only confirmed campus routes and reject unsafe destinations', () => {
  const good = { label: 'Report found item', route: '/lost-found/new?type=found' };
  assert.equal(parseAssistantAnswer(answer({ actions: [good] })).actions?.[0]?.route, good.route);
  for (const route of [
    'https://evil.example',
    '//evil.example',
    '/admin',
    '/lost-found/new?type=FOUND',
    '/profile?token=private',
  ])
    assert.throws(
      () => parseAssistantAnswer(answer({ actions: [{ ...good, route }] })),
      ApiClientError,
    );
});

void test('authenticated assistant request uses the Express contract once', async () => {
  let calls = 0;
  const result = await askAssistant(
    { question: 'Where is a calculator?', sourceTypes: ['MARKETPLACE', 'LOST_FOUND'] },
    (path, init) => {
      calls += 1;
      assert.equal(path, '/api/assistant/ask');
      assert.equal(init.method, 'POST');
      const requestBody = init.body;
      assert.equal(typeof requestBody, 'string');
      if (typeof requestBody !== 'string') throw new Error('Expected serialized request body.');
      assert.deepEqual(JSON.parse(requestBody), {
        question: 'Where is a calculator?',
        sourceTypes: ['MARKETPLACE', 'LOST_FOUND'],
      });
      assert.ok(init.signal);
      return Promise.resolve(answer());
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.status, 'answered');
});

void test('all normalized statuses are accepted without fabricated citations', () => {
  for (const status of ['insufficient_evidence', 'unsupported'] as const) {
    const parsed = parseAssistantAnswer(
      answer({
        citations: [],
        errorCode: null,
        model: null,
        provider: null,
        responseType: 'system',
        status,
      }),
    );
    assert.equal(parsed.status, status);
    assert.deepEqual(parsed.citations, []);
  }
  const unavailable = parseAssistantAnswer(
    answer({
      answer: 'The Campus Assistant is temporarily unavailable.',
      citations: [],
      errorCode: 'feature_disabled',
      model: null,
      provider: null,
      retrievalMode: 'lexical_fallback',
      responseType: 'system',
      status: 'unavailable',
    }),
  );
  assert.equal(unavailable.status, 'unavailable');
});

void test('citation-free deterministic responses identify their real source', () => {
  for (const responseType of ['conversation', 'platform_knowledge'] as const) {
    const parsed = parseAssistantAnswer(
      answer({
        answer: 'A deterministic response.',
        citations: [],
        model: null,
        provider: null,
        responseType,
        retrievalMode: null,
      }),
    );
    assert.equal(parsed.status, 'answered');
    assert.equal(parsed.responseType, responseType);
    assert.deepEqual(parsed.citations, []);
  }
});

void test('verified internal citations support every public source in backend order', () => {
  const citations = [
    citation('MARKETPLACE'),
    citation('LOST_FOUND'),
    citation('TEAMUP'),
    citation('SERVICE'),
  ];
  assert.deepEqual(parseAssistantAnswer(answer({ citations })).citations, citations);
});

void test('malformed, duplicate, external, mismatched, and status-invalid citations fail closed', () => {
  const marketplace = citation('MARKETPLACE');
  for (const invalid of [
    null,
    answer({ contractVersion: 'future-contract' }),
    answer({ citations: [marketplace, marketplace] }),
    answer({ citations: [{ ...marketplace, route: 'https://example.com/phishing' }] }),
    answer({ citations: [{ ...marketplace, route: '/lost-found/marketplace-one' }] }),
    answer({ citations: [] }),
    answer({ citations: [marketplace], status: 'insufficient_evidence' }),
    answer({ citations: [marketplace], responseType: 'platform_knowledge' }),
    answer({ citations: [], responseType: 'grounded' }),
    answer({ citations: [], responseType: 'conversation' }),
    answer({ unexpected: true }),
  ]) {
    assert.throws(() => parseAssistantAnswer(invalid), ApiClientError);
  }
});

void test('network and session errors propagate without automatic paid retries', async () => {
  for (const error of [
    new TypeError('network unavailable'),
    new ApiClientError('AUTHENTICATION_REQUIRED', 'Authentication is required.', 401),
  ]) {
    let calls = 0;
    await assert.rejects(
      askAssistant({ question: 'Where is a calculator?' }, () => {
        calls += 1;
        return Promise.reject(error);
      }),
      error,
    );
    assert.equal(calls, 1);
  }
});

void test('assistant UI has real submission, accessibility, safe text, and no simulation', async () => {
  const source = await readFile(
    new URL('../src/features/ai/AIAssistantPage.tsx', import.meta.url),
    'utf8',
  );
  for (const required of [
    'askAssistant',
    'requestActive.current',
    'aria-live="polite"',
    'Shift+Enter',
    'panel.scrollTo',
    'whitespace-pre-wrap',
    '<Link',
    'disabled={pending}',
    'mailto:${supportEmail}',
    "const supportEmail = 'campusconnectteams@gmail.com'",
  ]) {
    assert.equal(source.includes(required), true);
  }
  for (const forbidden of [
    'dangerouslySetInnerHTML',
    'demonstration response',
    'Demo sources',
    'window.setTimeout',
    'Vertex',
    'X-CampusConnect-AI-Key',
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
  assert.equal(source.includes('{assistantText(message.text)}'), true);
});
