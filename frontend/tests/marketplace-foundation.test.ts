import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultMarketplaceDiscovery,
  readMarketplaceDiscovery,
  writeMarketplaceDiscovery,
} from '../src/features/marketplace/marketplace-discovery.js';
import {
  marketplaceRecommendationHeading,
  marketplaceRecommendationSource,
  serializeListingDraft,
} from '../src/features/marketplace/marketplace-service.js';

void describe('Marketplace frontend foundations', () => {
  void it('round-trips valid discovery filters through the URL', () => {
    const state = {
      categoryId: 'electronics',
      condition: 'GOOD' as const,
      maxPrice: '900.00',
      minPrice: '100',
      page: 3,
      search: 'calculator',
      sort: 'price_asc' as const,
      status: 'ACTIVE' as const,
    };
    const url = writeMarketplaceDiscovery(state);
    assert.deepEqual(
      readMarketplaceDiscovery(new URL(url, 'https://campus.test').search, [{ id: 'electronics' }]),
      state,
    );
  });

  void it('rejects unsafe or unsupported discovery parameters', () => {
    assert.deepEqual(
      readMarketplaceDiscovery(
        '?categoryId=not-a-uuid&condition=UNKNOWN&status=ARCHIVED&sort=random&page=-1&minPrice=nope',
        [{ id: 'electronics' }],
      ),
      defaultMarketplaceDiscovery,
    );
  });

  void it('labels personalized AI results separately from recent fallback', () => {
    assert.equal(
      marketplaceRecommendationSource('marketplace-hybrid-v1', 'hybrid'),
      'personalized',
    );
    assert.equal(
      marketplaceRecommendationSource('marketplace-hybrid-v1', 'profile'),
      'personalized',
    );
    assert.equal(marketplaceRecommendationHeading('personalized'), 'Recommended for You');
    assert.equal(marketplaceRecommendationSource('marketplace-hybrid-v1', 'recent'), 'recent');
    assert.equal(marketplaceRecommendationSource(null, 'recent'), 'recent');
    assert.equal(marketplaceRecommendationHeading('recent'), 'Recently listed');
  });

  void it('defaults the unified catalog to newest first without a hidden exclusion parameter', () => {
    assert.equal(defaultMarketplaceDiscovery.sort, 'newest');
    assert.equal(writeMarketplaceDiscovery(defaultMarketplaceDiscovery), '/marketplace');
    assert.deepEqual(readMarketplaceDiscovery('?excludeIds=ignored'), defaultMarketplaceDiscovery);
  });

  void it('does not carry an old exclusion parameter into a restored URL', () => {
    const restored = readMarketplaceDiscovery('?excludeIds=old&search=bag&page=2');
    assert.equal(writeMarketplaceDiscovery(restored), '/marketplace?search=bag&page=2');
  });

  void it('keeps bookmark controls and broken-image fallback behavior on listing cards', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) =>
      readFile(new URL('../src/features/marketplace/ListingCard.tsx', import.meta.url), 'utf8'),
    );
    assert.match(source, /BookmarkButton/);
    assert.match(source, /onError/);
  });

  void it('preserves explicit Featured Posts consent in create and edit payloads', () => {
    const base = {
      categoryId: '11111111-1111-4111-8111-111111111111',
      condition: 'GOOD' as const,
      currency: 'INR',
      description: 'A complete marketplace listing description.',
      location: null,
      price: '1000',
      status: 'ACTIVE' as const,
      title: 'College bag',
    };
    const optedIn = JSON.parse(
      serializeListingDraft({ ...base, featuredOnLanding: true }),
    ) as Record<string, unknown>;
    const optedOut = JSON.parse(
      serializeListingDraft({ ...base, featuredOnLanding: false }),
    ) as Record<string, unknown>;
    assert.equal(optedIn.featuredOnLanding, true);
    assert.equal(optedOut.featuredOnLanding, false);
  });
});
