import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createReadReceipts } from '../src/modules/messaging/messaging-read-receipt.js';

void test('read receipt authenticates the exact fetched set and user/conversation binding', () => {
  const receipt = createReadReceipts(Buffer.alloc(32, 7));
  const ids = [randomUUID(), randomUUID()];
  const token = receipt.issue('student', 'conversation', ids);
  assert.deepEqual(receipt.verify(token, 'student', 'conversation'), ids);
  assert.throws(() => receipt.verify(token, 'other', 'conversation'));
  assert.throws(() => receipt.verify(token, 'student', 'other'));
  assert.throws(() => receipt.verify(token + 'x', 'student', 'conversation'));
  assert.throws(() =>
    createReadReceipts(Buffer.alloc(32, 8)).verify(token, 'student', 'conversation'),
  );
});
void test('receipt expires at fifteen minutes and permits safe replay only within its lifetime', () => {
  let clock = 1000;
  const receipt = createReadReceipts(Buffer.alloc(32, 7), () => clock);
  const token = receipt.issue('student', 'conversation', []);
  assert.deepEqual(receipt.verify(token, 'student', 'conversation'), []);
  clock += 15 * 60_000;
  assert.throws(() => receipt.verify(token, 'student', 'conversation'), {
    code: 'INVALID_READ_RECEIPT',
  });
});
void test('receipt rejects malformed, oversized and over-limit payloads', () => {
  const receipt = createReadReceipts(Buffer.alloc(32, 7));
  for (const token of [undefined, 1, '', 'x.y.z', 'x'.repeat(12001)])
    assert.throws(() => receipt.verify(token, 'student', 'conversation'));
  assert.throws(() =>
    receipt.verify(
      receipt.issue(
        'student',
        'conversation',
        Array.from({ length: 101 }, () => randomUUID()),
      ),
      'student',
      'conversation',
    ),
  );
});
void test('read receipt signing fails closed without valid key material', () => {
  assert.throws(() => createReadReceipts(Buffer.alloc(0)).issue('student', 'conversation', []), {
    code: 'MESSAGE_ENCRYPTION_UNAVAILABLE',
  });
});
