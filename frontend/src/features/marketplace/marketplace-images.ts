import type { ListingMedia } from './marketplace.types';

// Only use delivery URLs supplied by the existing authorized media projection.
export const marketplaceImageCandidates = (media: readonly ListingMedia[]): readonly string[] => [
  ...new Set(
    [...media]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .flatMap(({ url }) => (typeof url === 'string' && url.trim().length > 0 ? [url] : [])),
  ),
];

export const selectMarketplaceImage = (
  urls: readonly string[],
  failed: readonly string[],
): string | undefined => urls.find((url) => !failed.includes(url));

export const isFailedMarketplaceImage = (image: {
  readonly complete: boolean;
  readonly naturalWidth: number;
}): boolean => image.complete && image.naturalWidth === 0;
