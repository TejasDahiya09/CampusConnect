import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAiClient } from '../src/integrations/ai/ai-client.js';
import type { AiFetch, AiServiceConfig } from '../src/integrations/ai/ai.types.js';

const enabledConfig: AiServiceConfig = {
  apiKey: 'test-only-internal-key',
  enabled: true,
  generationTimeoutMs: 25,
  timeoutMs: 20,
  url: 'http://127.0.0.1:8001',
};

const response = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });

void describe('AI integration client', () => {
  void it('returns DISABLED without making an HTTP request', async () => {
    let requests = 0;
    const client = createAiClient({ ...enabledConfig, enabled: false, url: undefined }, () => {
      requests += 1;
      return Promise.resolve(response({}));
    });

    assert.deepEqual(await client.getHealth(), { status: 'DISABLED' });
    assert.equal(requests, 0);
  });

  void it('returns validated health data from an available service', async () => {
    const client = createAiClient(enabledConfig, (input) => {
      assert.equal(input, 'http://127.0.0.1:8001/health');
      return Promise.resolve(
        response({ service: 'CampusConnect AI Service', status: 'ok', version: '0.1.0' }),
      );
    });

    assert.deepEqual(await client.getHealth(), {
      data: { service: 'CampusConnect AI Service', status: 'ok', version: '0.1.0' },
      status: 'AVAILABLE',
    });
  });

  void it('maps a network failure to a controlled unavailable result', async () => {
    const client = createAiClient(enabledConfig, () =>
      Promise.reject(new Error('connection refused')),
    );

    assert.deepEqual(await client.getHealth(), {
      code: 'AI_SERVICE_NETWORK_ERROR',
      status: 'UNAVAILABLE',
    });
  });

  void it('maps timeouts to a controlled unavailable result', async () => {
    const timeoutFetch: AiFetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const client = createAiClient(enabledConfig, timeoutFetch);

    assert.deepEqual(await client.getHealth(), {
      code: 'AI_SERVICE_TIMEOUT',
      status: 'UNAVAILABLE',
    });
  });

  void it('maps non-success and malformed responses without exposing transport details', async () => {
    const unavailableClient = createAiClient(enabledConfig, () =>
      Promise.resolve(response({}, 503)),
    );
    const malformedClient = createAiClient(enabledConfig, () =>
      Promise.resolve(response({ status: 'ok' })),
    );

    assert.deepEqual(await unavailableClient.getHealth(), {
      code: 'AI_SERVICE_HTTP_ERROR',
      status: 'UNAVAILABLE',
    });
    assert.deepEqual(await malformedClient.getHealth(), {
      code: 'AI_SERVICE_INVALID_RESPONSE',
      status: 'UNAVAILABLE',
    });
  });

  void it('maps the FastAPI version contract to backend naming', async () => {
    const client = createAiClient(enabledConfig, () =>
      Promise.resolve(
        response({
          api_version: 'v1',
          capabilities: [],
          service: 'CampusConnect AI Service',
          version: '0.1.0',
        }),
      ),
    );

    assert.deepEqual(await client.getVersion(), {
      data: {
        apiVersion: 'v1',
        capabilities: [],
        service: 'CampusConnect AI Service',
        version: '0.1.0',
      },
      status: 'AVAILABLE',
    });
  });

  void it('preserves the validated Lost & Found matcher version in backend naming', async () => {
    const client = createAiClient(enabledConfig, (input, init) => {
      assert.equal(input, 'http://127.0.0.1:8001/api/v1/lost-found/match');
      assert.equal(init?.method, 'POST');
      assert.equal(
        new Headers(init?.headers).get('X-CampusConnect-AI-Key'),
        'test-only-internal-key',
      );
      return Promise.resolve(
        response({
          matcher_version: 'lf-semantic-v1',
          matches: [
            {
              confidence: 'HIGH',
              reasons: ['Same item category'],
              report_id: 'found-1',
              score: 0.9,
              scoring_mode: 'semantic',
              signals: { category: 1, image: null, location: 1, text: 0.8, time: 1 },
            },
          ],
        }),
      );
    });

    assert.deepEqual(
      await client.matchLostFound({
        candidates: [
          {
            category: 'Calculators',
            description: 'Found near the library.',
            id: 'found-1',
            incidentAt: '2026-10-01',
            location: 'Library',
            title: 'Black calculator',
            type: 'FOUND',
          },
        ],
        query: {
          category: 'Calculators',
          description: 'Lost near the library.',
          id: 'lost-1',
          incidentAt: '2026-10-01',
          location: 'Library',
          title: 'Black calculator',
          type: 'LOST',
        },
        topK: 1,
      }),
      {
        data: {
          matcherVersion: 'lf-semantic-v1',
          matches: [
            {
              confidence: 'HIGH',
              reasons: ['Same item category'],
              reportId: 'found-1',
              score: 0.9,
              scoringMode: 'semantic',
              signals: { category: 1, image: null, location: 1, text: 0.8, time: 1 },
            },
          ],
        },
        status: 'AVAILABLE',
      },
    );
  });
  void it('sends image bytes without forwarding storage URLs', async () => {
    const client = createAiClient(enabledConfig, (_input, init) => {
      const body = init?.body;
      assert.equal(typeof body, 'string');
      if (typeof body !== 'string') throw new Error('expected serialized AI request');
      const serialized = body;
      assert.match(serialized, /content_base64/);
      assert.doesNotMatch(serialized, /cloudfront|https?:\/\//);
      return Promise.resolve(response({ matcher_version: 'lf-semantic-v1', matches: [] }));
    });
    const image = { contentBase64: 'aW1hZ2U=', mimeType: 'image/png' as const };
    const query = {
      category: 'Other',
      description: 'item',
      id: 'lost',
      images: [image],
      incidentAt: null,
      location: null,
      title: 'item',
      type: 'LOST' as const,
    };
    const result = await client.matchLostFound({
      candidates: [{ ...query, id: 'found', type: 'FOUND' }],
      query,
      topK: 1,
    });
    assert.equal(result.status, 'AVAILABLE');
  });

  void it('accepts public readiness without exposing the internal credential', async () => {
    const client = createAiClient(enabledConfig, (input, init) => {
      assert.equal(input, 'http://127.0.0.1:8001/ready');
      assert.equal(new Headers(init?.headers).has('X-CampusConnect-AI-Key'), false);
      return Promise.resolve(
        response({ ready: true, service: 'CampusConnect AI Service', version: '0.1.0' }),
      );
    });
    assert.equal((await client.getReadiness()).status, 'AVAILABLE');
  });

  void it('rejects untrusted recommendation result fields and reasons', async () => {
    const input = {
      candidates: [
        {
          category: 'Books',
          createdAt: '2026-10-07T00:00:00Z',
          description: 'Textbook',
          id: 'known',
          title: 'Book',
        },
      ],
      limit: 1,
      userContext: { categorySignals: [], interests: ['books'] },
    };
    const bodies = [
      {
        recommender_version: 'marketplace-hybrid-v1',
        strategy: 'profile',
        results: [
          { listing_id: 'known', reasons: [], score: 0.5 },
          { listing_id: 'known', reasons: [], score: 0.4 },
        ],
      },
      {
        recommender_version: 'marketplace-hybrid-v1',
        strategy: 'profile',
        results: [{ listing_id: 'unknown', reasons: [], score: 0.5 }],
      },
      {
        recommender_version: 'marketplace-hybrid-v1',
        strategy: 'profile',
        results: [{ listing_id: 'known', reasons: [], score: Number.NaN }],
      },
      {
        recommender_version: 'marketplace-hybrid-v1',
        strategy: 'profile',
        results: [{ listing_id: 'known', reasons: [], score: 1.1 }],
      },
      {
        recommender_version: 'unsupported-version',
        strategy: 'profile',
        results: [{ listing_id: 'known', reasons: [], score: 0.5 }],
      },
      {
        recommender_version: 'marketplace-hybrid-v1',
        strategy: 'unsupported-strategy',
        results: [{ listing_id: 'known', reasons: [], score: 0.5 }],
      },
      {
        recommender_version: 'marketplace-hybrid-v1',
        strategy: 'profile',
        results: [{ listing_id: 'known', reasons: ['Untrusted explanation'], score: 0.5 }],
      },
      {
        recommender_version: 'marketplace-hybrid-v1',
        strategy: 'profile',
        results: [{ listing_id: 'known', reasons: ['x'.repeat(1_000)], score: 0.5 }],
      },
      {
        recommender_version: 'marketplace-hybrid-v1',
        strategy: 'profile',
        results: [{ listing_id: 'known', reasons: 'Recently listed', score: 0.5 }],
      },
      {
        recommender_version: 'marketplace-hybrid-v1',
        strategy: 'profile',
        results: [
          {
            listing_id: 'known',
            reasons: ['Recently listed', 'Recently listed'],
            score: 0.5,
          },
        ],
      },
      {
        recommender_version: 'marketplace-hybrid-v1',
        strategy: 'profile',
        results: [
          {
            listing_id: 'known',
            reasons: [
              'Matches your interests',
              'Similar to items you saved',
              "Based on items you've viewed",
              'Recently listed',
              'Recently listed',
            ],
            score: 0.5,
          },
        ],
      },
      {
        recommender_version: 'marketplace-hybrid-v1',
        strategy: 'profile',
        results: [{ listing_id: 'known', reasons: [42], score: 0.5 }],
      },
    ];
    for (const body of bodies) {
      const client = createAiClient(enabledConfig, () => Promise.resolve(response(body)));
      assert.deepEqual(await client.recommendMarketplace?.(input), {
        code: 'AI_SERVICE_INVALID_RESPONSE',
        status: 'UNAVAILABLE',
      });
    }
  });

  void it('accepts only the bounded marketplace recommendation reason vocabulary', async () => {
    const input = {
      candidates: [
        {
          category: 'Books',
          createdAt: '2026-10-07T00:00:00Z',
          description: 'Textbook',
          id: 'known',
          title: 'Book',
        },
      ],
      limit: 1,
      userContext: { categorySignals: [], interests: ['books'] },
    };
    const client = createAiClient(enabledConfig, () =>
      Promise.resolve(
        response({
          recommender_version: 'marketplace-hybrid-v1',
          strategy: 'profile',
          results: [
            {
              listing_id: 'known',
              reasons: [
                'Matches your interests',
                'Similar to items you saved',
                "Based on items you've viewed",
                'Recently listed',
              ],
              score: 0.5,
            },
          ],
        }),
      ),
    );

    assert.equal((await client.recommendMarketplace?.(input))?.status, 'AVAILABLE');
  });
});
