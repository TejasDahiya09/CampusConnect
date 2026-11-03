import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseMessage,
  parseOpenConversation,
  parseClientMessageId,
  parseReadReceipt,
} from '../src/modules/messaging/messaging.validation.js';

const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';

void test('conversation validation enforces direct and contextual identities', () => {
  assert.deepEqual(parseOpenConversation({ contextType: 'DIRECT', targetUserId: first }), {
    contextId: null,
    contextType: 'DIRECT',
    targetUserId: first,
  });
  assert.deepEqual(
    parseOpenConversation({ contextId: second, contextType: 'MARKETPLACE', targetUserId: first }),
    { contextId: second, contextType: 'MARKETPLACE', targetUserId: first },
  );
  assert.throws(() => parseOpenConversation({ contextType: 'SERVICE', targetUserId: first }));
  assert.throws(() =>
    parseOpenConversation({ contextId: second, contextType: 'DIRECT', targetUserId: first }),
  );
});

void test('message validation trims content and enforces the encrypted text contract', () => {
  assert.equal(parseMessage({ text: '  hello  ' }), 'hello');
  assert.throws(() => parseMessage({ text: '' }));
  assert.throws(() => parseMessage({ text: 'x'.repeat(4001) }));
  assert.throws(() => parseMessage({ plaintext: 'unsupported', text: 'hello' }));
});

void test('optional durable message IDs validate UUIDs and canonicalize case', () => {
  assert.equal(parseMessage({ text: 'hello', clientMessageId: first }), 'hello');
  assert.equal(
    parseClientMessageId({ text: 'hello', clientMessageId: first.toUpperCase() }),
    first,
  );
  assert.equal(parseClientMessageId({ text: 'hello' }), undefined);
  assert.throws(() => parseMessage({ text: 'hello', clientMessageId: 'invalid' }));
});
void test('read acknowledgment requires the server-issued receipt rather than an arbitrary boundary', () => {
  assert.equal(parseReadReceipt({ readReceipt: 'signed-receipt' }), 'signed-receipt');
  assert.throws(() => parseReadReceipt(undefined));
  assert.throws(() => parseReadReceipt({ readReceipt: 'receipt', timestamp: 'arbitrary' }));
});
