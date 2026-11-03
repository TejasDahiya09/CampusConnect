import type { MarketplaceListing } from './marketplace.types';

export function listingDetailPermissions(
  listing: MarketplaceListing,
  viewerId: string | null,
  active: boolean,
) {
  const owned = viewerId !== null && viewerId === listing.sellerId;
  return {
    owned,
    canEdit: active && owned && listing.status === 'ACTIVE',
    canArchive: active && owned && listing.status !== 'ARCHIVED',
    canMessage: active && !owned && viewerId !== null && listing.status === 'ACTIVE',
    canReport: active && !owned && viewerId !== null && listing.status !== 'ARCHIVED',
    canSave: active && viewerId !== null,
  };
}
