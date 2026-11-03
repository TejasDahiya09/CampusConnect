import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createMessagingRateLimit } from '../src/modules/messaging/messaging-rate-limit.js';
import { createInboxCursors } from '../src/modules/messaging/messaging-inbox-cursor.js';
import {
  parseInboxQuery,
  parseHistoryQuery,
} from '../src/modules/messaging/messaging.validation.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { withTestServer } from './helpers/test-server.js';

void test('Messaging account/action quotas use deterministic windows, Retry-After, and independent users', async () => {
  let now = 0;
  const app = express(),
    limit = createMessagingRateLimit(() => now);
  app.use((req, _res, next) => {
    if (req.headers.authorization)
      req.auth = { user: { id: req.headers.authorization } } as NonNullable<typeof req.auth>;
    next();
  });
  app.get('/open', limit('open'), (_req, res) => res.json({ ok: true }));
  app.get('/send', limit('send'), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  await withTestServer(app, async (base) => {
    const request = (path = '/open', user = 'a') =>
      fetch(base + path, { headers: { authorization: user } });
    for (let i = 0; i < 30; i++) assert.equal((await request()).status, 200);
    const blocked = await request();
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '60');
    assert.equal((await blocked.text()).includes('private'), false);
    assert.equal((await request('/open', 'b')).status, 200);
    assert.equal((await request('/send')).status, 200);
    assert.equal((await fetch(base + '/open')).status, 401);
    const burst = await Promise.all(Array.from({ length: 119 }, () => request('/send')));
    assert.ok(burst.every((row) => row.status === 200));
    assert.equal((await request('/send')).status, 429);
    assert.equal((await request('/send', 'b')).status, 200);
    now = 60_000;
    assert.equal((await request()).status, 200);
  });
});
void test('Inbox cursor is encrypted, scoped, expiring and tamper-resistant; pagination inputs bounded', () => {
  let now = 0;
  const cursors = createInboxCursors(Buffer.alloc(32, 7), () => now);
  const token = cursors.issue(
    'private-user-search',
    '2026-01-01 00:00:00+00',
    '00000000-0000-4000-8000-000000000001',
  );
  assert.equal(Buffer.from(token, 'base64url').toString().includes('private-user-search'), false);
  assert.equal(
    cursors.verify(token, 'private-user-search').id,
    '00000000-0000-4000-8000-000000000001',
  );
  assert.throws(() => cursors.verify(token, 'another-user'));
  assert.throws(() => cursors.verify(token + 'x', 'private-user-search'));
  now = 900_001;
  assert.throws(() => cursors.verify(token, 'private-user-search'));
  for (const limit of ['0', '51', '1e2', '9'.repeat(400)])
    assert.throws(() => parseInboxQuery({ limit }));
  assert.throws(() => parseInboxQuery({ cursor: 'x'.repeat(2049) }));
  assert.throws(() => parseInboxQuery({ page: '2' }));
  assert.equal(parseInboxQuery({}).limit, 30);
  assert.throws(() => parseHistoryQuery({ page: '1000000', limit: '100' }));
  assert.equal(parseHistoryQuery({ page: '1001', limit: '100' }).page, 1001);
});
