import type { MarketplaceListing } from '../src/features/marketplace/marketplace.types';

export const detailFixture: MarketplaceListing = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'QA lightweight laptop for campus study',
  description:
    'Isolated visual test data — not a real student listing.\n\nA compact laptop for studying and coursework. Inspect condition and arrange collection with the seller.',
  price: '42000.00',
  currency: 'INR',
  condition: 'GOOD',
  status: 'ACTIVE',
  isBookmarked: false,
  category: { id: 'electronics', name: 'Electronics', slug: 'electronics', parentId: null },
  location: 'Central Library',
  createdAt: '2026-10-25T00:00:00Z',
  updatedAt: '2026-10-25T00:00:00Z',
  soldAt: null,
  sellerId: '22222222-2222-4222-8222-222222222222',
  seller: {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'QA Student',
    avatar: null,
    department: { id: 'computing', name: 'Computing' },
  },
  media: [
    {
      id: 'landscape',
      url: '/qa-landscape.svg',
      sortOrder: 1,
      width: 960,
      height: 640,
      mimeType: 'image/svg+xml',
    },
    {
      id: 'portrait',
      url: '/qa-portrait.svg',
      sortOrder: 2,
      width: 640,
      height: 960,
      mimeType: 'image/svg+xml',
    },
    {
      id: 'square',
      url: '/qa-square.svg',
      sortOrder: 3,
      width: 800,
      height: 800,
      mimeType: 'image/svg+xml',
    },
  ],
};
