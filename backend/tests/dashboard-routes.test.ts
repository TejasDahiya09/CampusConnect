import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { withTestServer } from './helpers/test-server.js';

void test('dashboard requires authentication', async () => {
  await withTestServer(createApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dashboard`);
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED');
  });
});
