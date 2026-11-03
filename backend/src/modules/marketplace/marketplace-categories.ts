import type { MarketplaceCategoryView } from './marketplace.types.js';

export const marketplaceCategories = [
  {
    id: 'books-study-material',
    name: 'Books & Study Material',
    parentId: null,
    slug: 'books-study-material',
  },
  { id: 'electronics', name: 'Electronics', parentId: null, slug: 'electronics' },
  { id: 'calculators', name: 'Calculators', parentId: null, slug: 'calculators' },
  { id: 'cycles', name: 'Cycles', parentId: null, slug: 'cycles' },
  {
    id: 'clothing-accessories',
    name: 'Clothing & Accessories',
    parentId: null,
    slug: 'clothing-accessories',
  },
  { id: 'furniture', name: 'Furniture', parentId: null, slug: 'furniture' },
  { id: 'hostel-essentials', name: 'Hostel Essentials', parentId: null, slug: 'hostel-essentials' },
  { id: 'lab-equipment', name: 'Lab Equipment', parentId: null, slug: 'lab-equipment' },
  { id: 'gaming', name: 'Gaming', parentId: null, slug: 'gaming' },
  { id: 'automotive', name: 'Automotive', parentId: null, slug: 'automotive' },
  {
    id: 'music-instruments',
    name: 'Music & Instruments',
    parentId: null,
    slug: 'music-instruments',
  },
  { id: 'other', name: 'Other', parentId: null, slug: 'other' },
] as const satisfies readonly MarketplaceCategoryView[];

export const findMarketplaceCategory = (identifier: string): MarketplaceCategoryView | undefined =>
  marketplaceCategories.find(({ id, name }) => id === identifier || name === identifier);
