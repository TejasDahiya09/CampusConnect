import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import { ListingCondition, LostFoundType, Prisma } from '../src/generated/prisma/client.js';
import { errorHandler, notFoundHandler } from '../src/middleware/error-handler.js';
import {
  parseLostFoundCreate,
  parseLostFoundUpdate,
} from '../src/modules/lost-found/lost-found.validation.js';
import {
  parseListingCreate,
  parseListingUpdate,
} from '../src/modules/marketplace/marketplace.validation.js';
import { createLandingHighlightsController } from '../src/modules/public/landing-highlights.controller.js';
import {
  isSafeLandingTitle,
  safeLandingMetadata,
} from '../src/modules/public/landing-highlights.privacy.js';
import { createLandingHighlightsService } from '../src/modules/public/landing-highlights.service.js';
import type { LandingHighlightCandidates } from '../src/modules/public/landing-highlights.types.js';
import { createPublicRouter } from '../src/modules/public/public.routes.js';
import { createPublicHighlightsRateLimit } from '../src/modules/public/public-rate-limit.js';
import {
  parseServiceCreate,
  parseServiceUpdate,
} from '../src/modules/services/services.validation.js';
import { parseTeamUpCreate, parseTeamUpUpdate } from '../src/modules/teamup/teamup.validation.js';
import { withTestServer } from './helpers/test-server.js';

const date = new Date('2026-10-25T00:00:00.000Z');
const ids = {
  lostFound: '22222222-2222-4222-8222-222222222222',
  marketplace: '11111111-1111-4111-8111-111111111111',
  service: '44444444-4444-4444-8444-444444444444',
  teamUp: '33333333-3333-4333-8333-333333333333',
};

const candidates = (): LandingHighlightCandidates => ({
  lostFound: [
    {
      category: 'Electronics',
      createdAt: date,
      id: ids.lostFound,
      title: 'Found wireless earbuds',
      type: LostFoundType.FOUND,
    },
  ],
  marketplace: [
    {
      category: 'Books',
      condition: ListingCondition.GOOD,
      createdAt: date,
      currency: 'INR',
      id: ids.marketplace,
      price: new Prisma.Decimal('500'),
      title: 'Data structures textbook',
    },
  ],
  services: [
    {
      category: 'Tutoring',
      createdAt: date,
      currency: 'INR',
      id: ids.service,
      price: new Prisma.Decimal('750'),
      skills: ['Algorithms'],
      title: 'Algorithms tutoring',
    },
  ],
  teamUp: [
    {
      category: 'Technology',
      createdAt: date,
      id: ids.teamUp,
      requiredSkills: ['React', 'TypeScript'],
      title: 'Campus navigation project',
    },
  ],
});

void describe('Featured Posts consent validation', () => {
  const marketplace = {
    categoryId: 'books-study-material',
    condition: 'GOOD',
    currency: 'INR',
    description: 'A detailed marketplace description.',
    price: '500',
    title: 'Textbook',
  };
  const lostFound = {
    category: 'Electronics',
    description: 'A detailed Lost and Found description.',
    incidentDate: '2026-10-24',
    location: 'Library',
    title: 'Found earbuds',
    type: 'FOUND',
  };
  const teamUp = {
    category: 'Technology',
    deadline: null,
    description: 'A detailed student collaboration project.',
    maxMembers: 4,
    requiredSkills: ['React'],
    title: 'Campus project',
  };
  const service = {
    category: 'Tutoring',
    description: 'Detailed algorithms tutoring for students.',
    location: null,
    price: '500',
    pricingType: 'FIXED',
    skills: ['Algorithms'],
    title: 'Algorithms tutoring',
  };

  void it('defaults omitted creation consent to false and accepts explicit true', () => {
    assert.equal(parseListingCreate(marketplace).featuredOnLanding, false);
    assert.equal(parseLostFoundCreate(lostFound).featuredOnLanding, false);
    assert.equal(parseTeamUpCreate(teamUp).featuredOnLanding, false);
    assert.equal(parseServiceCreate(service).featuredOnLanding, false);
    assert.equal(
      parseListingCreate({ ...marketplace, featuredOnLanding: true }).featuredOnLanding,
      true,
    );
    assert.equal(
      parseLostFoundCreate({ ...lostFound, featuredOnLanding: true }).featuredOnLanding,
      true,
    );
    assert.equal(parseTeamUpCreate({ ...teamUp, featuredOnLanding: true }).featuredOnLanding, true);
    assert.equal(
      parseServiceCreate({ ...service, featuredOnLanding: true }).featuredOnLanding,
      true,
    );
  });

  void it('accepts explicit false, preserves omitted updates, and rejects non-Booleans', () => {
    const parsers = [
      parseListingUpdate,
      parseLostFoundUpdate,
      parseTeamUpUpdate,
      parseServiceUpdate,
    ] as const;
    for (const parse of parsers) {
      assert.equal(parse({ featuredOnLanding: false }).featuredOnLanding, false);
      assert.equal('featuredOnLanding' in parse({ title: 'Updated safe title' }), false);
      for (const invalid of ['true', 1, null])
        assert.throws(() => parse({ featuredOnLanding: invalid }), { code: 'VALIDATION_ERROR' });
    }
  });
});

void describe('Public landing highlights privacy and rotation', () => {
  void it('builds only allowlisted DTOs without private or media fields', async () => {
    const service = createLandingHighlightsService(
      { findCandidates: () => Promise.resolve(candidates()) },
      () => Date.parse('2026-10-25T00:01:00.000Z'),
    );
    const highlights = await service.list(8);
    assert.equal(highlights.length, 4);
    const serialized = JSON.stringify(highlights);
    for (const forbidden of [
      'description',
      'email',
      'images',
      'incidentDate',
      'location',
      'ownerId',
      'providerId',
      'reporterId',
      'sellerId',
      'storage',
    ])
      assert.equal(serialized.includes(`"${forbidden}"`), false, forbidden);
    assert.ok(Buffer.byteLength(serialized) < 32 * 1024);
    assert.ok(highlights.every(({ route }) => route.startsWith('/')));
  });

  void it('withholds contact-bearing and sensitive Lost and Found titles', async () => {
    const data = candidates();
    const service = createLandingHighlightsService(
      {
        findCandidates: () =>
          Promise.resolve({
            ...data,
            lostFound: [
              ...data.lostFound,
              {
                ...data.lostFound[0]!,
                id: '55555555-5555-4555-8555-555555555555',
                title: 'Wallet belonging to Alex',
              },
            ],
            marketplace: [
              ...data.marketplace,
              {
                ...data.marketplace[0]!,
                id: '66666666-6666-4666-8666-666666666666',
                title: 'Call +91 98765 43210',
              },
            ],
          }),
      },
      () => 0,
    );
    const result = await service.list(8);
    assert.equal(
      result.some(({ id }) => id.startsWith('5') || id.startsWith('6')),
      false,
    );
    assert.equal(isSafeLandingTitle('Contact me on WhatsApp'), false);
    assert.equal(isSafeLandingTitle('Room 204 identity card', true), false);
    assert.equal(safeLandingMetadata('Call 9876543210'), null);
  });

  void it('is stable within a time bucket and enforces total and per-module limits', async () => {
    const data = candidates();
    const expanded: LandingHighlightCandidates = {
      lostFound: Array.from({ length: 5 }, (_, index) => ({
        ...data.lostFound[0]!,
        id: `20000000-0000-4000-8000-00000000000${index}`,
      })),
      marketplace: Array.from({ length: 5 }, (_, index) => ({
        ...data.marketplace[0]!,
        id: `10000000-0000-4000-8000-00000000000${index}`,
      })),
      services: Array.from({ length: 5 }, (_, index) => ({
        ...data.services[0]!,
        id: `40000000-0000-4000-8000-00000000000${index}`,
      })),
      teamUp: Array.from({ length: 5 }, (_, index) => ({
        ...data.teamUp[0]!,
        id: `30000000-0000-4000-8000-00000000000${index}`,
      })),
    };
    const service = createLandingHighlightsService(
      { findCandidates: () => Promise.resolve(expanded) },
      () => 123_000,
    );
    const first = await service.list(7);
    const second = await service.list(7);
    assert.deepEqual(first, second);
    assert.equal(first.length, 7);
    for (const kind of ['LOST_FOUND', 'MARKETPLACE', 'SERVICE', 'TEAMUP'])
      assert.ok(first.filter((item) => item.kind === kind).length <= 2);
  });

  void it('reflects opt-out on the next uncached service call and supports an empty feed', async () => {
    let enabled = true;
    const service = createLandingHighlightsService({
      findCandidates: () =>
        Promise.resolve(
          enabled ? candidates() : { lostFound: [], marketplace: [], services: [], teamUp: [] },
        ),
    });
    assert.equal((await service.list(8)).length, 4);
    enabled = false;
    assert.deepEqual(await service.list(8), []);
  });
});

void describe('Public landing highlights endpoint', () => {
  const app = (maximum = 60) => {
    const server = express();
    server.use(
      '/api/public',
      createPublicRouter({
        landingHighlights: createLandingHighlightsController(
          createLandingHighlightsService(
            { findCandidates: () => Promise.resolve(candidates()) },
            () => 0,
          ),
        ),
        rateLimit: createPublicHighlightsRateLimit({ maximum, now: () => 0 }),
      }),
    );
    server.use(notFoundHandler);
    server.use(errorHandler);
    return server;
  };

  void it('defaults and bounds limit, rejects unknown queries, and disables caching', async () => {
    await withTestServer(app(), async (baseUrl) => {
      const success = await fetch(`${baseUrl}/api/public/landing-highlights?limit=2`);
      const body = (await success.json()) as { data: { highlights: readonly unknown[] } };
      assert.equal(success.status, 200);
      assert.equal(success.headers.get('cache-control'), 'no-store');
      assert.equal(body.data.highlights.length, 2);
      for (const query of ['limit=0', 'limit=9', 'limit=2&limit=3', 'page=1']) {
        const invalid = await fetch(`${baseUrl}/api/public/landing-highlights?${query}`);
        assert.equal(invalid.status, 400, query);
        assert.equal(invalid.headers.get('cache-control'), 'no-store');
      }
    });
  });

  void it('rate limits anonymous requests and does not expose a non-GET endpoint', async () => {
    await withTestServer(app(1), async (baseUrl) => {
      assert.equal((await fetch(`${baseUrl}/api/public/landing-highlights`)).status, 200);
      const limited = await fetch(`${baseUrl}/api/public/landing-highlights`);
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get('cache-control'), 'no-store');
      assert.equal(limited.headers.has('retry-after'), true);
      assert.equal(
        (await fetch(`${baseUrl}/api/public/landing-highlights`, { method: 'POST' })).status,
        404,
      );
    });
  });
});
