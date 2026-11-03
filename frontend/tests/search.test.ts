import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupSearchResults,
  internalSearchTarget,
  normalizeSearchQuery,
  searchUrl,
} from '../src/features/search/search-service';
import type { SearchResult } from '../src/features/search/search.types';

const result = (type: SearchResult['type'], id: string): SearchResult => ({
  description: null,
  id,
  image: null,
  metadata: {},
  navigationTarget: `/${type.toLowerCase()}/${id}`,
  subtitle: null,
  title: `${type} result`,
  type,
});

void test('search URL preserves normalized query, type, and pagination', () => {
  assert.equal(normalizeSearchQuery('  python   tutoring  '), 'python tutoring');
  assert.equal(
    searchUrl(' python tutoring ', 'SERVICE', 2, 12),
    '/api/search?limit=12&page=2&q=python+tutoring&type=SERVICE',
  );
});

void test('quick results retain controlled module group labels', () => {
  const groups = groupSearchResults([
    result('STUDENT', '1'),
    result('MARKETPLACE', '2'),
    result('STUDENT', '3'),
  ]);
  assert.equal(groups.STUDENT?.length, 2);
  assert.equal(groups.MARKETPLACE?.length, 1);
});

void test('result navigation rejects arbitrary and external targets', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(internalSearchTarget(`/profile/${id}`), `/profile/${id}`);
  assert.equal(internalSearchTarget('https://example.com'), '/search');
  assert.equal(internalSearchTarget('/messages/private'), '/search');
});
