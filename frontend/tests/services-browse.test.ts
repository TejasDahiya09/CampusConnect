import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  defaultServicesDiscovery as defaults,
  readServicesDiscovery as read,
  writeServicesDiscovery as write,
  serviceFilterErrors as errors,
} from '../src/features/services/services-discovery.js';
import { ServicesBrowseCard } from '../src/features/services/ServicesBrowseCard.js';
import type { StudentService } from '../src/features/services/services.types.js';

void test('Services discovery round-trips only supported state and preserves exact categories', () => {
  const state = {
    ...defaults,
    search: 'React help',
    category: 'Creative & design',
    pricingType: 'FIXED' as const,
    minPrice: '10.50',
    maxPrice: '200',
    page: 4,
    sort: 'price_desc' as const,
  };
  assert.deepEqual(read(write(state)), state);
  assert.equal(write(defaults).toString(), '');
  assert.equal(read(new URLSearchParams('category=Tutoring')).category, 'Tutoring');
});
void test('Services URL normalization bounds malformed inputs and cannot request inactive services', () => {
  const result = read(
    new URLSearchParams(
      'page=-2&sort=popular&status=ARCHIVED&unknown=private&minPrice=NaN&search=' + 'x'.repeat(150),
    ),
  );
  assert.equal(result.page, 1);
  assert.equal(result.sort, 'newest');
  assert.equal(result.minPrice, '');
  assert.equal(result.search.length, 100);
  assert.equal(write(result).has('status'), false);
  assert.equal(write(result).has('unknown'), false);
  assert.equal(read(new URLSearchParams('pricingType=NEGOTIABLE&minPrice=5')).minPrice, '');
  assert.equal(read(new URLSearchParams('minPrice=50&maxPrice=20')).maxPrice, '');
});
void test('Services price validation matches bounded compatible backend combinations', () => {
  assert.deepEqual(
    errors({ ...defaults, pricingType: 'FIXED', minPrice: '5', maxPrice: '10.50' }),
    {},
  );
  for (const minPrice of ['-1', 'Infinity', '1.234', '10000001'])
    assert.ok(errors({ ...defaults, minPrice }).minPrice);
  assert.ok(errors({ ...defaults, minPrice: '10', maxPrice: '5' }).minPrice);
  assert.ok(errors({ ...defaults, pricingType: 'FREE', minPrice: '1' }).minPrice);
  assert.ok(errors({ ...defaults, pricingType: 'NEGOTIABLE', maxPrice: '5' }).pricingType);
  assert.ok(errors({ ...defaults, pricingType: 'FIXED', maxPrice: '0' }).maxPrice);
});
const service: StudentService = {
  id: 'synthetic',
  title: 'Help with <script>alert(1)</script>',
  description: 'Original description',
  category: 'Tutoring',
  createdAt: '',
  updatedAt: '',
  location: 'Library',
  price: '500',
  pricingType: 'FIXED',
  providerId: 'redacted',
  provider: {
    id: 'redacted',
    avatar: null,
    department: null,
    displayName: 'CampusConnect student',
  },
  requestCount: 42,
  skills: ['React', 'Research'],
  status: 'ACTIVE',
  viewerIsProvider: false,
  viewerRequestStatus: null,
};
const render = (overrides: Partial<StudentService> = {}) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(ServicesBrowseCard, { service: { ...service, ...overrides } }),
    ),
  );
void test('Services cards render real public fields, safe text and one detail link', () => {
  const html = render();
  assert.match(html, /₹500.00/);
  assert.match(html, /CampusConnect student/);
  assert.match(html, /href="\/services\/synthetic"/);
  assert.match(html, /&lt;script&gt;/);
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.doesNotMatch(html, /<script|42|Verified|rating|<img/);
});
void test('Services cards distinguish free, negotiable and missing prices without fabricated zero', () => {
  assert.match(render({ pricingType: 'FREE', price: '0' }), /Free/);
  assert.match(render({ pricingType: 'NEGOTIABLE', price: null }), /Negotiable/);
  const html = render({ price: null, skills: [], location: null });
  assert.match(html, /Price unavailable/);
  assert.doesNotMatch(html, /₹0/);
  assert.match(html, /Location not specified/);
});
