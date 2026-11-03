import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addUniqueMessage,
  buildMessagingInboxPath,
  createLatestRequestGate,
  isTransientMessagingError,
  withTransientMessagingRetry,
  messageAttempt,
} from '../src/features/messaging/messaging-service.js';
import { ApiClientError } from '../src/services/api-client.js';
import type { MessageView } from '../src/features/messaging/messaging.types.js';
import {
  clearSentDraft,
  mergeMessages,
  nearLatest,
} from '../src/features/messaging/messaging-state.js';

const message: MessageView = {
  conversationId: 'conversation',
  id: 'message',
  read: false,
  senderId: 'sender',
  sentAt: '2026-10-07T00:00:00.000Z',
  text: 'hello',
};

void test('ambiguous send retries preserve the durable ID, while changed context/payload gets a new ID', () => {
  let ids = 0;
  const next = () => String(++ids);
  const first = messageAttempt(undefined, 'conversation-a', 'text', next);
  assert.equal(messageAttempt(first, 'conversation-a', 'text', next), first);
  assert.equal(ids, 1);
  assert.notEqual(
    messageAttempt(first, 'conversation-a', 'changed', next).clientMessageId,
    first.clientMessageId,
  );
  assert.notEqual(
    messageAttempt(first, 'conversation-b', 'text', next).clientMessageId,
    first.clientMessageId,
  );
});

void test('Messaging inbox filters are URL encoded and optional', () => {
  assert.equal(buildMessagingInboxPath(), '/api/messages');
  assert.equal(
    buildMessagingInboxPath('MARKETPLACE', 'desk & lamp'),
    '/api/messages?contextType=MARKETPLACE&search=desk+%26+lamp',
  );
});

void test('Realtime and HTTP delivery deduplicate by persistent message ID', () => {
  assert.deepEqual(addUniqueMessage([], message), [message]);
  assert.deepEqual(addUniqueMessage([message], { ...message, text: 'duplicate event' }), [message]);
});

void test('Messaging retries one transient failure and returns the successful result', async () => {
  let attempts = 0;
  const result = await withTransientMessagingRetry(
    () => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new TypeError('network')) : Promise.resolve('loaded');
    },
    () => Promise.resolve(),
  );
  assert.equal(result, 'loaded');
  assert.equal(attempts, 2);
});

void test('Messaging does not retry permanent authorization failures', async () => {
  let attempts = 0;
  await assert.rejects(
    withTransientMessagingRetry(
      () => {
        attempts += 1;
        return Promise.reject(new ApiClientError('MESSAGING_NOT_ALLOWED', 'Forbidden', 403));
      },
      () => Promise.resolve(),
    ),
    { code: 'MESSAGING_NOT_ALLOWED', status: 403 },
  );
  assert.equal(attempts, 1);
  assert.equal(
    isTransientMessagingError(new ApiClientError('SERVER_ERROR', 'Unavailable', 503)),
    true,
  );
});

void test('Only the latest conversation or inbox request may update state', () => {
  const gate = createLatestRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
});

void test('Offset pages merge chronologically without losing realtime arrivals or duplicating IDs', () => {
  const old = { ...message, id: 'old', sentAt: '2026-10-06T00:00:00Z' };
  const live = { ...message, id: 'live', sentAt: '2026-10-08T00:00:00Z' };
  assert.deepEqual(
    mergeMessages([old, message], [message, live]).map((item) => item.id),
    ['old', 'message', 'live'],
  );
});
void test('Successful delayed sends clear only matching text; edited drafts survive', () => {
  assert.equal(clearSentDraft(' hello ', 'hello'), '');
  assert.equal(clearSentDraft('new draft', 'hello'), 'new draft');
  assert.equal(clearSentDraft(undefined, 'hello'), '');
});
void test('Near-bottom threshold preserves readers who scrolled upward', () => {
  assert.equal(nearLatest({ scrollHeight: 1200, scrollTop: 800, clientHeight: 350 }), true);
  assert.equal(nearLatest({ scrollHeight: 1200, scrollTop: 200, clientHeight: 350 }), false);
});

void test('paginated inbox path keeps scope, opaque cursor and selected deep link encoded', () => {
  const path = buildMessagingInboxPath(
    'TEAMUP',
    'study & research',
    'opaque+token/',
    'selected-id',
  );
  const url = new URL(path, 'http://fixture');
  assert.equal(url.pathname, '/api/messages');
  assert.equal(url.searchParams.get('cursor'), 'opaque+token/');
  assert.equal(url.searchParams.get('selected'), 'selected-id');
  assert.equal(url.searchParams.get('contextType'), 'TEAMUP');
  assert.equal(url.searchParams.get('search'), 'study & research');
});

void test('rate limits wait for user retry instead of an immediate automatic second request', async () => {
  let calls = 0,
    waits = 0;
  await assert.rejects(() =>
    withTransientMessagingRetry(
      () => {
        calls++;
        throw new ApiClientError('MESSAGING_RATE_LIMITED', 'Please wait', 429);
      },
      () => {
        waits++;
        return Promise.resolve();
      },
    ),
  );
  assert.equal(calls, 1);
  assert.equal(waits, 0);
});
