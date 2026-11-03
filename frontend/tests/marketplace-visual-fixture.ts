/** Isolated browser-layout fixture. No sessions, APIs, real records or writes to the database. */
import { createElement } from 'react';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MarketplaceBrowse } from '../src/features/marketplace/MarketplaceBrowse';
import { defaultMarketplaceDiscovery } from '../src/features/marketplace/marketplace-discovery';
import type { MarketplaceListing } from '../src/features/marketplace/marketplace.types';

const output = process.argv[2];
if (!output) throw new Error('Supply a private temporary output directory.');
const assets = await readdir(resolve('frontend/dist/assets'));
const styles = ['index-', 'MarketplacePage-']
  .map((prefix) => {
    const file = assets.find((name) => name.startsWith(prefix) && name.endsWith('.css'));
    if (!file) throw new Error('Build the frontend before generating layout fixtures.');
    return `<link rel="stylesheet" href="/assets/${file}">`;
  })
  .join('');
const categories = [
  ['books-study-material', 'Books & Study Material'],
  ['electronics', 'Electronics'],
  ['calculators', 'Calculators'],
  ['cycles', 'Cycles'],
  ['clothing-accessories', 'Clothing & Accessories'],
  ['furniture', 'Furniture'],
  ['hostel-essentials', 'Hostel Essentials'],
  ['lab-equipment', 'Lab Equipment'],
  ['gaming', 'Gaming'],
  ['automotive', 'Automotive'],
  ['music-instruments', 'Music & Instruments'],
  ['other', 'Other'],
].map(([id, name]) => ({ id, name, slug: id, parentId: null }));
const listing: MarketplaceListing = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'QA calculator with a deliberately long product title',
  description: 'Isolated layout fixture. Not a real listing.',
  price: '850',
  currency: 'INR',
  category: categories[0],
  condition: 'GOOD',
  status: 'ACTIVE',
  createdAt: '2026-10-25T00:00:00Z',
  updatedAt: '2026-10-25T00:00:00Z',
  soldAt: null,
  location: 'Long academic building and central library location',
  media: [],
  isBookmarked: true,
  sellerId: 'qa',
  seller: { id: 'qa', displayName: 'QA fixture', avatar: null, department: null },
};
await mkdir(output, { recursive: true });
const seed = {
  categories,
  state: { ...defaultMarketplaceDiscovery, page: 2, categoryId: categories[0].id },
  listings: Array.from({ length: 8 }, (_, index) => ({
    ...listing,
    id: `${index + 1}1111111-1111-4111-8111-111111111111`,
    title: index % 2 ? 'QA laptop stand' : listing.title,
    price: index === 3 ? '9999999999.99' : '850',
    isBookmarked: index === 0,
    media:
      index === 0
        ? [
            {
              id: 'failed-test-image',
              url: '/missing-qa-image.png',
              sortOrder: 0,
              mimeType: 'image/png',
              width: null,
              height: null,
            },
            {
              id: 'valid-test-image',
              url: '/qa-photo.svg',
              sortOrder: 1,
              mimeType: 'image/svg+xml',
              width: 640,
              height: 480,
            },
          ]
        : index >= 6
          ? [
              {
                id: `last-photo-${index}`,
                url: `/qa-photo.svg?last=${index}`,
                sortOrder: 0,
                mimeType: 'image/svg+xml',
                width: 640,
                height: 480,
              },
            ]
          : [],
  })),
  pagination: { total: 20, page: 2, limit: 12, totalPages: 2 },
  loading: false,
  categoryError: false,
  error: null,
};
const client = await build({
  stdin: {
    resolveDir: resolve('frontend'),
    sourcefile: 'marketplace-qa-client.tsx',
    loader: 'tsx',
    contents: `
    import { createElement, useState, useEffect } from 'react';
    import { createRoot } from 'react-dom/client';
    import { MemoryRouter } from 'react-router-dom';
    import { MarketplaceBrowse } from './src/features/marketplace/MarketplaceBrowse';
    import { defaultMarketplaceDiscovery, readMarketplaceDiscovery, writeMarketplaceDiscovery } from './src/features/marketplace/marketplace-discovery';
    const seed = ${JSON.stringify(seed)};
    // This fixture cannot contact application services or perform real writes.
    window.__qaRequests = 0;
    window.fetch = async () => { window.__qaRequests++; throw new Error('Application requests are disabled in this isolated fixture.'); };
    function Harness() {
      const [state, setState] = useState(() => location.search ? readMarketplaceDiscovery(location.search, seed.categories) : seed.state);
      const [categories, setCategories] = useState(seed.categories);
      useEffect(() => {
        window.__qaSetCategories = count => setCategories(seed.categories.slice(0, count));
        const restore = () => setState(readMarketplaceDiscovery(location.search, seed.categories));
        window.addEventListener('popstate', restore);
        return () => window.removeEventListener('popstate', restore);
      }, []);
      const update = patch => setState(previous => {
        const next = { ...previous, page: 1, ...patch };
        const search = new URL(writeMarketplaceDiscovery(next), location.origin).search;
        history.pushState(null, '', location.pathname + search);
        return next;
      });
      return createElement(MemoryRouter, null, createElement(MarketplaceBrowse, {
        ...seed, categories, state, onUpdate: update,
        onClear: () => setState(defaultMarketplaceDiscovery), onRetry: () => {}, onCategoryRetry: () => {}, navigate: () => {},
      }));
    }
    createRoot(document.querySelector('main')).render(createElement(Harness));
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__qaHydrated = true; }));
  `,
  },
  bundle: true,
  jsx: 'automatic',
  write: false,
  format: 'esm',
  platform: 'browser',
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
});
await writeFile(resolve(output, 'fixture.js'), client.outputFiles[0].text);
for (const theme of ['light', 'dark']) {
  const markup = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(MarketplaceBrowse, {
        ...seed,
        onUpdate: () => undefined,
        onClear: () => undefined,
        onRetry: () => undefined,
        onCategoryRetry: () => undefined,
        navigate: () => undefined,
      }),
    ),
  );
  await writeFile(
    resolve(output, `${theme}.html`),
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Marketplace layout QA</title>${styles}</head><body><div class="cc-app-shell min-h-screen"><main>${markup}</main></div><script type="module" src="/fixture.js"></script><script>
  document.fonts.ready.then(async () => {
    while (!window.__qaHydrated) await new Promise(requestAnimationFrame);
    const rect = el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
    const sell = [...document.querySelectorAll('a[href="/marketplace/new"]')].filter(el => el.getBoundingClientRect().height > 0);
    const input = document.querySelector('input[type="search"]'); input.focus({preventScroll:true});
    const report = {
      width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
      sell: sell.map(el => ({...rect(el), nowrap: getComputedStyle(el).whiteSpace, icon: rect(el.querySelector('svg'))})),
      categories: [...document.querySelectorAll('.cc-market-category-label')].map(el => rect(el)),
      cards: [...document.querySelectorAll('.cc-market-product')].map(el => rect(el)),
      hero: rect(document.querySelector('.cc-market-hero')),
      catalog: rect(document.querySelector('.cc-market-results')),
      search: rect(input), searchOutline: getComputedStyle(input).outlineStyle,
      searchFocus: getComputedStyle(input.closest('form')).boxShadow,
      share: rect(document.querySelector('.cc-market-share')),
      bookmark: rect(document.querySelector('.cc-bookmark-control')),
      lastNextDisabled: [...document.querySelectorAll('.cc-market-pagination button')].at(-1).disabled,
    };
    const result = document.createElement('pre'); result.id='qa-report'; result.hidden=true; result.textContent=JSON.stringify(report); document.body.append(result);
  });</script></body></html>`,
    'utf8',
  );
}
console.log('Created isolated Light/Dark layout fixtures; no application API requests.');
