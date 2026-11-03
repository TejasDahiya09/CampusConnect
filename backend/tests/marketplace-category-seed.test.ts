import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { marketplaceCategorySeedData } from '../src/database/marketplace-category-seed.js';
import { findMarketplaceCategory } from '../src/modules/marketplace/marketplace-categories.js';

void describe('Marketplace category configuration', () => {
  void it('contains the deterministic production taxonomy in the required order', () => {
    assert.deepEqual(
      marketplaceCategorySeedData.map(({ name }) => name),
      [
        'Books & Study Material',
        'Electronics',
        'Calculators',
        'Cycles',
        'Clothing & Accessories',
        'Furniture',
        'Hostel Essentials',
        'Lab Equipment',
        'Gaming',
        'Automotive',
        'Music & Instruments',
        'Other',
      ],
    );
    assert.equal(new Set(marketplaceCategorySeedData.map(({ slug }) => slug)).size, 12);
  });

  void it('resolves both stable slugs and stored category names without database writes', () => {
    assert.equal(findMarketplaceCategory('books-study-material')?.name, 'Books & Study Material');
    assert.equal(findMarketplaceCategory('Books & Study Material')?.id, 'books-study-material');
    assert.equal(findMarketplaceCategory('unknown'), undefined);
  });
});
