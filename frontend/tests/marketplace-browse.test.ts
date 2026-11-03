import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  categoryCellWidth,
  categoryScrollState,
  categoryScrollTarget,
} from '../src/features/marketplace/category-carousel';
import { MarketplaceHero } from '../src/features/marketplace/MarketplaceHero';
import { MarketplaceCategoryNav } from '../src/features/marketplace/MarketplaceCategoryNav';
import {
  MarketplaceBrowse,
  type MarketplaceBrowseProps,
} from '../src/features/marketplace/MarketplaceBrowse';
import { MarketplaceProductCard } from '../src/features/marketplace/MarketplaceProductCard';
import { MarketplaceProductImage } from '../src/features/marketplace/MarketplaceProductImage';
import {
  isFailedMarketplaceImage,
  marketplaceImageCandidates,
  selectMarketplaceImage,
} from '../src/features/marketplace/marketplace-images';
import { MarketplaceFilters } from '../src/features/marketplace/MarketplaceFilters';
import { ListingCard } from '../src/features/marketplace/ListingCard';
import {
  defaultMarketplaceDiscovery,
  marketplacePriceRangeError,
  readMarketplaceDiscovery,
  updateMarketplaceDiscovery,
  writeMarketplaceDiscovery,
} from '../src/features/marketplace/marketplace-discovery';
import {
  getListings,
  marketplaceListingQuery,
} from '../src/features/marketplace/marketplace-service';
import { formatPrice } from '../src/features/marketplace/marketplace-format';
import { toggleMarketplaceBookmark } from '../src/features/marketplace/marketplace-bookmark-state';
import type { MarketplaceListing } from '../src/features/marketplace/marketplace.types';

const category = { id: 'electronics', name: 'Electronics', parentId: null, slug: 'electronics' };
const listing: MarketplaceListing = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Student laptop',
  description: 'A useful campus laptop.',
  price: '1000.00',
  currency: 'INR',
  category,
  condition: 'GOOD',
  status: 'ACTIVE',
  createdAt: '2026-10-25T00:00:00Z',
  updatedAt: '2026-10-25T00:00:00Z',
  soldAt: null,
  location: 'Campus library',
  media: [],
  isBookmarked: false,
  sellerId: 'student',
  seller: { id: 'student', displayName: 'Student', avatar: null, department: null },
};
const render = (node: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, node));
const browse = (overrides: Partial<MarketplaceBrowseProps> = {}) =>
  render(
    createElement(MarketplaceBrowse, {
      categories: [category],
      state: defaultMarketplaceDiscovery,
      listings: [listing],
      pagination: { limit: 12, page: 1, total: 1, totalPages: 1 },
      loading: false,
      categoryError: false,
      error: null,
      onUpdate: () => undefined,
      onClear: () => undefined,
      onRetry: () => undefined,
      onCategoryRetry: () => undefined,
      navigate: () => undefined,
      ...overrides,
    }),
  );

void describe('Marketplace B + A browse contracts and rendering', () => {
  void it('selects ordered real delivery URLs even when the first media entry is empty', () => {
    const base = { id: 'image', mimeType: 'image/webp', width: null, height: null };
    const urls = marketplaceImageCandidates([
      { ...base, id: 'later', sortOrder: 2, url: 'https://images.test/second.webp' },
      { ...base, id: 'empty', sortOrder: 0, url: null },
      { ...base, id: 'primary', sortOrder: 1, url: 'https://images.test/primary.webp' },
      { ...base, id: 'duplicate', sortOrder: 3, url: 'https://images.test/primary.webp' },
    ]);
    assert.deepEqual(urls, ['https://images.test/primary.webp', 'https://images.test/second.webp']);
    assert.equal(selectMarketplaceImage(urls, []), urls[0]);
    assert.equal(selectMarketplaceImage(urls, [urls[0]]), urls[1]);
    assert.equal(selectMarketplaceImage(urls, [...urls]), undefined);
  });
  void it('never treats pending lazy loading or a loaded image as a confirmed failure', () => {
    assert.equal(isFailedMarketplaceImage({ complete: false, naturalWidth: 0 }), false);
    assert.equal(isFailedMarketplaceImage({ complete: true, naturalWidth: 1200 }), false);
    assert.equal(isFailedMarketplaceImage({ complete: true, naturalWidth: 0 }), true);
    const html = render(
      createElement(MarketplaceProductImage, {
        title: 'Backpack',
        media: [
          {
            id: 'photo',
            mimeType: 'image/jpeg',
            width: null,
            height: null,
            sortOrder: 0,
            url: 'https://images.test/backpack.jpg',
          },
        ],
      }),
    );
    assert.match(html, /data-image-state="loading"/);
    assert.match(html, /loading="lazy"/);
    assert.match(html, /src="https:\/\/images.test\/backpack.jpg"/);
    assert.doesNotMatch(html, /Photo unavailable|opacity:0|display:none/);
  });
  void it('renders a secondary real photo instead of a placeholder for missing primary delivery', () => {
    const html = render(
      createElement(MarketplaceProductImage, {
        title: 'Backpack',
        media: [
          {
            id: 'empty',
            mimeType: 'image/jpeg',
            width: null,
            height: null,
            sortOrder: 0,
            url: null,
          },
          {
            id: 'photo',
            mimeType: 'image/jpeg',
            width: null,
            height: null,
            sortOrder: 1,
            url: 'https://images.test/backpack.jpg',
          },
        ],
      }),
    );
    assert.match(html, /src="https:\/\/images.test\/backpack.jpg"/);
    assert.doesNotMatch(html, /Photo unavailable/);
  });
  void it('labels the separate WhatsApp share action and preserves sold status in its payload', () => {
    const html = render(
      createElement(MarketplaceProductCard, {
        listing: { ...listing, status: 'SOLD' },
        onOpen: () => undefined,
      }),
    );
    const action = html.match(/<a aria-label="Share Student laptop on WhatsApp"[\s\S]*?<\/a>/)?.[0];
    assert.ok(action);
    assert.match(action, /title="Share on WhatsApp"/);
    assert.match(action, /target="_blank"/);
    assert.match(action, />Share<\/span>/);
    assert.match(action, /href="https:\/\/wa.me\/\?text=/);
    assert.ok(decodeURIComponent(action).includes('*Status:* Sold'));
  });
  void it('reopened filters render current category, price, condition and availability from URL state', () => {
    const state = {
      ...defaultMarketplaceDiscovery,
      categoryId: 'electronics',
      minPrice: '100',
      maxPrice: '900',
      condition: 'GOOD' as const,
      status: 'SOLD' as const,
    };
    const restored = readMarketplaceDiscovery(
      new URL(writeMarketplaceDiscovery(state), 'https://campus.test').search,
      [category],
    );
    const html = render(
      createElement(MarketplaceFilters, {
        categories: [category],
        state: restored,
        onApply: () => undefined,
        onClear: () => undefined,
      }),
    );
    assert.match(html, /value="electronics" selected=""/);
    assert.match(html, /value="GOOD" selected=""/);
    assert.match(html, /value="SOLD" selected=""/);
    assert.match(html, /value="100"/);
    assert.match(html, /value="900"/);
  });
  void it('requests the existing listing endpoint once and forwards cancellation and pagination', async () => {
    let calls = 0;
    const controller = new AbortController();
    const result = await getListings(
      { page: 2, limit: 12, sort: 'newest', categoryId: 'electronics' },
      controller.signal,
      (path, init) => {
        calls++;
        assert.match(path, /^\/api\/marketplace\/listings\?/);
        assert.equal(
          new URL(path, 'https://campus.test').searchParams.get('categoryId'),
          'electronics',
        );
        assert.equal(init?.signal, controller.signal);
        return Promise.resolve({
          data: { listings: [listing] },
          meta: { page: 2, limit: 12, total: 20, totalPages: 2 },
        });
      },
    );
    assert.equal(calls, 1);
    assert.deepEqual(result.pagination, { page: 2, limit: 12, total: 20, totalPages: 2 });
    assert.deepEqual(result.listings, [listing]);
  });
  void it('propagates request failures without retries or fabricated listings', async () => {
    let calls = 0;
    await assert.rejects(
      getListings({ page: 1, limit: 12, sort: 'newest' }, undefined, () => {
        calls++;
        return Promise.reject(new Error('Network unavailable'));
      }),
      /Network unavailable/,
    );
    assert.equal(calls, 1);
  });
  void it('restores real slug IDs only when supplied categories authorize them', () => {
    assert.equal(
      readMarketplaceDiscovery('?categoryId=electronics', [category]).categoryId,
      'electronics',
    );
    assert.equal(readMarketplaceDiscovery('?categoryId=unknown', [category]).categoryId, '');
    assert.equal(readMarketplaceDiscovery('?categoryId=electronics', []).categoryId, '');
    assert.equal(
      readMarketplaceDiscovery('?categoryId=https://bad.test', [category]).categoryId,
      '',
    );
  });
  void it('round trips search/filter/sort/page combinations and restores prior history entries', () => {
    const first = updateMarketplaceDiscovery(defaultMarketplaceDiscovery, {
      categoryId: category.id,
      search: 'laptop',
      condition: 'GOOD',
      minPrice: '100',
      maxPrice: '2000',
      status: 'ACTIVE',
      sort: 'price_asc',
    });
    const second = updateMarketplaceDiscovery(first, { page: 3 });
    const history = [first, second].map(writeMarketplaceDiscovery);
    assert.deepEqual(
      readMarketplaceDiscovery(new URL(history[0], 'https://campus.test').search, [category]),
      first,
    );
    assert.deepEqual(
      readMarketplaceDiscovery(new URL(history[1], 'https://campus.test').search, [category]),
      second,
    );
    assert.equal(updateMarketplaceDiscovery(second, { search: 'book' }).page, 1);
    assert.deepEqual(
      updateMarketplaceDiscovery(second, defaultMarketplaceDiscovery),
      defaultMarketplaceDiscovery,
    );
  });
  void it('validates price ranges before filter submission', () => {
    assert.equal(marketplacePriceRangeError('', ''), null);
    assert.equal(marketplacePriceRangeError('0', '100.25'), null);
    assert.ok(marketplacePriceRangeError('200', '100'));
    assert.ok(marketplacePriceRangeError('-1', '100'));
    assert.ok(marketplacePriceRangeError('1.234', '100'));
  });
  void it('serializes only existing server filters and never hides recent items during search', () => {
    const query = new URLSearchParams(
      marketplaceListingQuery({
        page: 2,
        limit: 12,
        sort: 'price_desc',
        search: 'bag & book',
        categoryId: 'electronics',
        condition: 'GOOD',
        status: 'ACTIVE',
        minPrice: '0',
        maxPrice: '999',
        excludeIds: [listing.id],
      }),
    );
    assert.equal(query.get('search'), 'bag & book');
    assert.equal(query.get('categoryId'), 'electronics');
    assert.equal(query.get('page'), '2');
    assert.equal(query.get('sort'), 'price_desc');
    assert.equal(query.get('minPrice'), '0');
    assert.equal(query.get('excludeIds'), listing.id);
  });
  void it('renders the browse heading, existing destinations, filters and actual listing fields', () => {
    const html = browse();
    for (const text of [
      'Marketplace',
      'Sell an item',
      'Saved listings',
      'Student laptop',
      'Good',
      'Electronics',
    ])
      assert.ok(html.includes(text));
    assert.match(html, /href="\/marketplace\/new"/);
    assert.match(html, /href="\/marketplace\/saved"/);
    assert.match(html, /aria-label="Marketplace filters"/);
    assert.match(html, /aria-haspopup="dialog"/);
    assert.match(html, /aria-label="Search Marketplace"/);
    assert.match(html, /1\s+listing/);
    assert.doesNotMatch(html, /verified seller|shipping|discount|No safety issues detected/i);
  });
  void it('renders supplied photos with stable media classes, lazy loading and no fake product images', () => {
    const media = {
      id: 'media',
      url: 'https://images.test/laptop.webp',
      mimeType: 'image/webp',
      width: null,
      height: null,
      sortOrder: 0,
    };
    const html = render(
      createElement(MarketplaceProductCard, {
        listing: { ...listing, media: [media] },
        onOpen: () => undefined,
      }),
    );
    assert.match(html, /src="https:\/\/images.test\/laptop.webp"/);
    assert.match(html, /alt="Student laptop"/);
    assert.match(html, /loading="lazy"/);
    const headingIndex = html.match(/<h3\b[^>]*>/)?.index;
    assert.ok(headingIndex !== undefined);
    assert.ok(headingIndex < html.indexOf(formatPrice(listing.price, listing.currency)));
    const fallback = render(
      createElement(MarketplaceProductCard, { listing, onOpen: () => undefined }),
    );
    assert.match(fallback, /Photo unavailable/);
    assert.doesNotMatch(fallback, /<img/);
  });
  void it('keeps product navigation separate from save/share controls and exposes bookmark state', () => {
    const html = render(
      createElement(MarketplaceProductCard, {
        listing: { ...listing, isBookmarked: true },
        onOpen: () => undefined,
      }),
    );
    assert.match(html, /href="\/marketplace\/11111111-1111-4111-8111-111111111111"/);
    assert.match(html, /aria-pressed="true"/);
    assert.match(html, /Remove from saved listings/);
    assert.match(html, /role="status"/);
    const productAnchor = html.match(/<a class="cc-market-product-link"[\s\S]*?<\/a>/)?.[0];
    assert.ok(productAnchor);
    assert.doesNotMatch(productAnchor, /<button/);
    assert.match(html, /Share Student laptop on WhatsApp/);
  });
  void it('escapes long titles and displays actual sold status and large price', () => {
    const html = render(
      createElement(MarketplaceProductCard, {
        listing: {
          ...listing,
          title: '<script>bad()</script>' + 'long '.repeat(35),
          price: '9999999999.99',
          status: 'SOLD',
        },
        onOpen: () => undefined,
      }),
    );
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, />Sold</);
    assert.ok(html.includes(formatPrice('9999999999.99', 'INR')));
  });
  void it('does not render private extra fields or raw descriptions on browse cards', () => {
    const unsafe = {
      ...listing,
      description: 'private-extra-description',
      email: 'private@example.test',
      bookmarks: ['other-student'],
    };
    // Share uses the pre-existing authorized listing description; private DTO extras are never rendered.
    const html = render(
      createElement(MarketplaceProductCard, { listing: unsafe, onOpen: () => undefined }),
    );
    assert.doesNotMatch(html, /private@example.test|other-student/);
    assert.doesNotMatch(html, /<p[^>]*>private-extra-description/);
  });
  void it('distinguishes initial loading, query errors, category errors and empty results', () => {
    assert.match(
      browse({ loading: true, listings: [], pagination: null }),
      /Loading Marketplace listings/,
    );
    const error = browse({ error: 'A request failed.', listings: [], pagination: null });
    assert.match(error, /role="alert"/);
    assert.match(error, /Retry listings/);
    assert.doesNotMatch(error, /Make the first listing/);
    assert.match(browse({ categoryError: true, loading: true, listings: [] }), /Retry filters/);
    assert.match(browse({ listings: [] }), /Make the first listing/);
    const filtered = browse({
      listings: [],
      state: { ...defaultMarketplaceDiscovery, search: 'no match' },
    });
    assert.match(filtered, /No finds just yet/);
    assert.match(filtered, /Clear filters/);
  });
  void it('keeps one catalog and pagination bounded during searches', () => {
    const html = browse({
      state: { ...defaultMarketplaceDiscovery, search: 'laptop', page: 2 },
      pagination: { total: 25, page: 2, limit: 12, totalPages: 3 },
    });
    assert.doesNotMatch(html, /Recently listed|More to explore/);
    assert.equal((html.match(/data-listing-id=/g) ?? []).length, 1);
    assert.match(html, /Page 2 of 3/);
    const last = browse({
      state: { ...defaultMarketplaceDiscovery, page: 3 },
      pagination: { total: 25, page: 3, limit: 12, totalPages: 3 },
    });
    assert.match(last, /disabled=""[^>]*>Next/);
  });
  void it('reuses one supported filter form and preserves default Saved-page cards', () => {
    const html = render(
      createElement(MarketplaceFilters, {
        categories: [category],
        state: { ...defaultMarketplaceDiscovery, categoryId: 'electronics' },
        onApply: () => undefined,
        onClear: () => undefined,
      }),
    );
    assert.match(html, /value="electronics" selected=""/);
    assert.match(html, /Apply filters/);
    assert.match(html, /Maximum/);
    const saved = render(createElement(ListingCard, { listing, onOpen: () => undefined }));
    assert.match(saved, /cc-feature-card/);
    assert.doesNotMatch(saved, /cc-market-product-link/);
  });
  void it('optimistically saves/removes once and rolls back failed persistence', async () => {
    const states: boolean[] = [];
    let calls = 0;
    assert.equal(
      await toggleMarketplaceBookmark(
        false,
        () => {
          calls++;
          return Promise.resolve();
        },
        (value) => states.push(value),
      ),
      true,
    );
    assert.deepEqual(states, [true]);
    assert.equal(calls, 1);
    states.length = 0;
    assert.equal(
      await toggleMarketplaceBookmark(
        true,
        () => Promise.resolve(),
        (value) => states.push(value),
      ),
      false,
    );
    assert.deepEqual(states, [false]);
    states.length = 0;
    await assert.rejects(
      toggleMarketplaceBookmark(
        false,
        () => Promise.reject(new Error('Save failed')),
        (value) => states.push(value),
      ),
      /Save failed/,
    );
    assert.deepEqual(states, [true, false]);
  });
});

void describe('Marketplace reference composition', () => {
  void it('renders the complete editorial message without actions, records or preview data', () => {
    const html = render(createElement(MarketplaceHero));
    assert.match(html, /The campus exchange/);
    assert.match(html, /Campus essentials/);
    assert.match(html, /Buy and sell useful things with students across campus/);
    assert.match(html, /aria-hidden="true"/);
    assert.doesNotMatch(
      html,
      /<a |<button|<img|Inside the exchange|From this catalog|Sell an item|Browse listings|Student laptop/,
    );
    const page = browse();
    assert.equal((page.match(/href="\/marketplace\/new"/g) ?? []).length, 1);
    assert.match(page, /href="\/marketplace\/saved"/);
  });
  void it('calculates fractional boundaries and bounded viewport-relative scrolling', () => {
    assert.deepEqual(categoryScrollState(0, 1200, 300), {
      overflow: true,
      previous: false,
      next: true,
    });
    assert.deepEqual(categoryScrollState(899.5, 1200, 300), {
      overflow: true,
      previous: true,
      next: false,
    });
    assert.deepEqual(categoryScrollState(0, 250, 300), {
      overflow: false,
      previous: false,
      next: false,
    });
    assert.equal(categoryScrollTarget(0, 1200, 300, 1), 255);
    assert.equal(categoryScrollTarget(850, 1200, 300, 1), 900);
    assert.equal(categoryScrollTarget(100, 1200, 300, -1), 0);
  });
  void it('fits whole readable category cells and advances on their boundaries', () => {
    assert.equal(categoryCellWidth(254, 84, 8), 123);
    assert.equal(categoryCellWidth(184, 84, 8), 88);
    assert.equal(categoryScrollTarget(0, 1700, 258, 1, 131, 8), 262);
    assert.equal(categoryScrollTarget(262, 1700, 258, -1, 131, 8), 0);
    assert.equal(categoryScrollTarget(1400, 1700, 258, 1, 131, 8), 1442);
  });
  void it('provides a full accessible title and an honest missing-condition label', () => {
    const title = 'Very long campus equipment title '.repeat(8);
    const html = render(
      createElement(MarketplaceProductCard, {
        listing: { ...listing, title, condition: '' as MarketplaceListing['condition'] },
        onOpen: () => undefined,
      }),
    );
    assert.ok(html.includes(`aria-label="${title}"`));
    assert.ok(html.includes(`<h3 title="${title}">${title}</h3>`));
    assert.match(html, /Condition not specified/);
    assert.match(html, /class="cc-market-share"/);
    assert.doesNotMatch(html, /bg-slate-950\/80|hover:border-emerald/);
  });
  void it('distinguishes a pending real URL from a confirmed no-media fallback', () => {
    const pending = render(
      createElement(MarketplaceProductImage, {
        title: 'Pending photo',
        media: [
          {
            id: 'pending',
            url: 'https://images.test/pending.webp',
            sortOrder: 0,
            mimeType: 'image/webp',
            width: null,
            height: null,
          },
        ],
      }),
    );
    assert.match(pending, /data-image-state="loading"/);
    assert.match(pending, /Photo loading/);
    assert.match(pending, /loading="lazy"/);
    assert.doesNotMatch(pending, /Photo unavailable/);
    const missing = render(
      createElement(MarketplaceProductImage, { title: 'Missing photo', media: [] }),
    );
    assert.match(missing, /Photo unavailable/);
    assert.doesNotMatch(missing, /Photo loading|<img/);
  });
  void it('renders actual categories, an All option and synchronized accessible selection', () => {
    const html = render(
      createElement(MarketplaceCategoryNav, {
        categories: [category],
        selected: category.id,
        onSelect: () => undefined,
      }),
    );
    assert.match(html, /Browse Marketplace categories/);
    assert.match(html, />All<\/span>/);
    assert.match(html, /aria-pressed="true"[\s\S]*?Electronics/);
    assert.equal((html.match(/class="cc-market-category-option"/g) ?? []).length, 2);
    assert.match(html, /Previous categories/);
    assert.match(html, /Next categories/);
    assert.doesNotMatch(html, /Housing|Tickets|Services/);
    const state = updateMarketplaceDiscovery(
      { ...defaultMarketplaceDiscovery, page: 4 },
      { categoryId: category.id },
    );
    assert.equal(state.page, 1);
    assert.equal(
      readMarketplaceDiscovery(
        new URL(writeMarketplaceDiscovery(state), 'https://campus.test').search,
        [category],
      ).categoryId,
      category.id,
    );
  });
  void it('uses one listing request pipeline without preview requests or catalog exclusions', async () => {
    const source = await readFile(
      new URL('../src/features/marketplace/MarketplacePage.tsx', import.meta.url),
      'utf8',
    );
    assert.equal((source.match(/void getListings\(/g) ?? []).length, 1);
    assert.doesNotMatch(source, /excludeIds|setRecent|limit: 4/);
    assert.equal(defaultMarketplaceDiscovery.sort, 'newest');
    const html = browse();
    assert.equal((html.match(/id="market-results-title"/g) ?? []).length, 1);
    assert.equal((html.match(/data-listing-id=/g) ?? []).length, 1);
    assert.match(html, /1 listing/);
    assert.doesNotMatch(html, /Recently listed|More to explore/);
  });
});
