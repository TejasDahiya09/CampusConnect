import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  fetchLandingHighlights,
  parseLandingHighlightsResponse,
} from '../src/features/landing/landing-highlights.js';

const ids = {
  LOST_FOUND: '22222222-2222-4222-8222-222222222222',
  MARKETPLACE: '11111111-1111-4111-8111-111111111111',
  SERVICE: '44444444-4444-4444-8444-444444444444',
  TEAMUP: '33333333-3333-4333-8333-333333333333',
} as const;

const highlights = [
  {
    createdAt: '2026-10-25T00:00:00.000Z',
    id: ids.MARKETPLACE,
    kind: 'MARKETPLACE',
    metadata: { category: 'Books', condition: 'GOOD', currency: 'INR', price: '500.00' },
    privateEmail: 'must-not-survive@example.test',
    route: `/marketplace/${ids.MARKETPLACE}`,
    summary: 'Books in good condition.',
    title: 'Study textbook',
  },
  {
    createdAt: '2026-10-25T00:00:00.000Z',
    id: ids.LOST_FOUND,
    kind: 'LOST_FOUND',
    metadata: { category: 'Accessories', reportType: 'LOST', status: 'OPEN' },
    route: `/lost-found/${ids.LOST_FOUND}`,
    summary: 'Lost Accessories report currently open.',
    title: 'Lost student bag',
  },
  {
    createdAt: '2026-10-25T00:00:00.000Z',
    id: ids.TEAMUP,
    kind: 'TEAMUP',
    metadata: { category: 'Technology', requiredSkills: ['React'], status: 'OPEN' },
    route: `/teamup/${ids.TEAMUP}`,
    summary: 'Open student project seeking React.',
    title: 'Campus navigation project',
  },
  {
    createdAt: '2026-10-25T00:00:00.000Z',
    id: ids.SERVICE,
    kind: 'SERVICE',
    metadata: {
      category: 'Tutoring',
      currency: 'INR',
      price: null,
      pricingType: 'NEGOTIABLE',
      skills: ['Teaching'],
    },
    route: `/services/${ids.SERVICE}`,
    summary: 'Tutoring service with negotiable pricing.',
    title: 'Exam preparation',
  },
] as const;

void describe('public landing highlights client', () => {
  void it('fetches the anonymous bounded endpoint once and supports all four real kinds', async () => {
    const calls: Array<{ init?: RequestInit; url: string }> = [];
    const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ ...(init ? { init } : {}), url });
      return Promise.resolve(
        new Response(JSON.stringify({ data: { highlights }, success: true }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );
    }) satisfies typeof fetch;
    const result = await fetchLandingHighlights({ fetcher });
    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? '', /\/api\/public\/landing-highlights\?limit=8$/);
    assert.equal(new Headers(calls[0]?.init?.headers).has('authorization'), false);
    assert.equal(calls[0]?.init?.credentials, 'omit');
    assert.equal(calls[0]?.init?.cache, 'no-store');
    assert.deepEqual(
      result.map(({ kind }) => kind),
      ['MARKETPLACE', 'LOST_FOUND', 'TEAMUP', 'SERVICE'],
    );
    assert.equal('privateEmail' in (result[0] ?? {}), false);
  });

  void it('filters malformed kinds and unsafe or mismatched routes without reordering valid data', () => {
    const malformed = { ...highlights[0], kind: 'PROFILE' };
    const unsafe = { ...highlights[1], route: 'https://malicious.example/report' };
    const result = parseLandingHighlightsResponse({
      data: { highlights: [highlights[2], malformed, unsafe, highlights[3]] },
      success: true,
    });
    assert.deepEqual(
      result.map(({ id }) => id),
      [ids.TEAMUP, ids.SERVICE],
    );
    assert.deepEqual(
      parseLandingHighlightsResponse({ success: true, data: { highlights: [] } }),
      [],
    );
    assert.deepEqual(parseLandingHighlightsResponse({ success: true, data: 'invalid' }), []);
  });

  void it('falls back safely on non-200, network failure, and timeout', async () => {
    assert.deepEqual(
      await fetchLandingHighlights({
        fetcher: () => Promise.resolve(new Response(null, { status: 503 })),
      }),
      [],
    );
    assert.deepEqual(
      await fetchLandingHighlights({
        fetcher: () => Promise.reject(new Error('network unavailable')),
      }),
      [],
    );
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      })) satisfies typeof fetch;
    assert.deepEqual(await fetchLandingHighlights({ fetcher: hanging, timeoutMs: 1 }), []);
  });

  void it('keeps live and illustrative scenes separate with bounded in-memory spotlight motion', () => {
    const landing = readFileSync(
      new URL('../src/features/landing/LandingPage.tsx', import.meta.url),
      'utf8',
    );
    const preview = readFileSync(
      new URL('../src/features/landing/ProductPreview.tsx', import.meta.url),
      'utf8',
    );
    const showcase = readFileSync(
      new URL('../src/features/landing/PlatformShowcase.tsx', import.meta.url),
      'utf8',
    );
    assert.equal((landing.match(/fetchLandingHighlights\(\{/g) ?? []).length, 1);
    assert.match(preview, /FEATURED BY ITS OWNER/);
    assert.match(preview, /ILLUSTRATIVE PREVIEW/);
    assert.match(showcase, /Shown independently, not as verified matches/);
    assert.match(showcase, /Illustrative assistant preview/);
    assert.match(preview, /spotlightItems/);
    assert.match(preview, /window\.setTimeout/);
    assert.match(preview, /window\.clearTimeout/);
    assert.match(preview, /createSpotlightController/);
    assert.doesNotMatch(`${landing}\n${preview}\n${showcase}`, /setInterval|Gemini|authorization/);
    assert.doesNotMatch(showcase, /email|phone|enrollment|ownerId|storageKey/i);
  });
});
