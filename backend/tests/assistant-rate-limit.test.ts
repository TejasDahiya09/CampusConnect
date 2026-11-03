import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createAssistantRateLimit } from '../src/modules/assistant/assistant-rate-limit.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { withTestServer } from './helpers/test-server.js';

void test('assistant budget returns 429 with no-store and recovers at the next window', async () => {
  let now = 0;
  const app = express();
  app.use(createAssistantRateLimit(() => now, 2));
  app.get('/', (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  await withTestServer(app, async (url) => {
    for (let i = 0; i < 2; i++) assert.equal((await fetch(url)).status, 200);
    const limited = await fetch(url);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('Retry-After'), '60');
    assert.equal(limited.headers.get('Cache-Control'), 'no-store');
    now = 60_001;
    assert.equal((await fetch(url)).status, 200);
  });
});
