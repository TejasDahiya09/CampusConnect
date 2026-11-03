import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { withTestServer } from './helpers/test-server.js';

void describe('settings routes', () => {
  for (const path of ['/api/settings', '/api/settings/deactivate']) {
    void it(`requires authentication for ${path}`, async () => {
      await withTestServer(createApp(), async (baseUrl) => {
        const response = await fetch(`${baseUrl}${path}`, {
          method: path.endsWith('deactivate') ? 'POST' : 'GET',
        });
        assert.equal(response.status, 401);
        const body = (await response.json()) as { error: { code: string } };
        assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED');
      });
    });
  }
});
