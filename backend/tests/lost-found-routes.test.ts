import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { withTestServer } from './helpers/test-server.js';

void describe('Lost & Found routes', () => {
  void it('rejects unauthenticated report creation', async () => {
    await withTestServer(createApp(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/lost-found/reports`, {
        body: JSON.stringify({
          category: 'Electronics',
          description: 'A sufficiently detailed report.',
          incidentDate: '2026-10-01',
          location: 'Library',
          title: 'Lost calculator',
          type: 'LOST',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(response.status, 401);
      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED');
    });
  });

  void it('rejects unauthenticated matching requests', async () => {
    await withTestServer(createApp(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/lost-found/reports/report-1/matches`);
      assert.equal(response.status, 401);
      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED');
    });
  });

  void it('rejects unauthenticated own-report requests', async () => {
    await withTestServer(createApp(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/lost-found/my-reports`);
      assert.equal(response.status, 401);
      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED');
    });
  });
});
