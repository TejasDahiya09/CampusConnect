import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { withTestServer } from './helpers/test-server.js';

void describe('global search routes', () => {
  void it('requires authentication before searching any source', async () => {
    await withTestServer(createApp(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/search?q=python`);
      assert.equal(response.status, 401);
      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED');
    });
  });
});
