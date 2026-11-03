import { apiRequest, apiRequestWithMeta } from '../../services/api-client';
import type {
  ListingDraft,
  ListingFilters,
  ListingPageResult,
  ListingMedia,
  MediaUploadAuthorization,
  MarketplaceCategory,
  MarketplaceListing,
} from './marketplace.types';

const listingPath = (id: string) => `/api/marketplace/listings/${encodeURIComponent(id)}`;

export const getMyListings = async (
  page: number,
  signal?: AbortSignal,
): Promise<ListingPageResult> => {
  const response = await apiRequestWithMeta<{ readonly listings: readonly MarketplaceListing[] }>(
    `/api/marketplace/my-listings?page=${page}&limit=12`,
    { signal },
  );
  return {
    listings: response.data.listings,
    pagination: {
      page: Number(response.meta?.page ?? page),
      limit: 12,
      total: Number(response.meta?.total ?? 0),
      totalPages: Number(response.meta?.totalPages ?? 0),
    },
  };
};

export const getMarketplaceCategories = async (): Promise<readonly MarketplaceCategory[]> =>
  (
    await apiRequest<{ readonly categories: readonly MarketplaceCategory[] }>(
      '/api/marketplace/categories',
    )
  ).categories;

export const marketplaceListingQuery = (filters: ListingFilters): string => {
  const query = new URLSearchParams({ limit: String(filters.limit), page: String(filters.page) });
  query.set('sort', filters.sort);
  if (filters.search) query.set('search', filters.search);
  if (filters.categoryId) query.set('categoryId', filters.categoryId);
  if (filters.condition) query.set('condition', filters.condition);
  if (filters.excludeIds?.length) query.set('excludeIds', filters.excludeIds.join(','));
  if (filters.status) query.set('status', filters.status);
  if (filters.minPrice) query.set('minPrice', filters.minPrice);
  if (filters.maxPrice) query.set('maxPrice', filters.maxPrice);
  return query.toString();
};

export const getListings = async (
  filters: ListingFilters,
  signal?: AbortSignal,
  request: (
    path: string,
    init?: RequestInit,
  ) => Promise<{
    data: { readonly listings: readonly MarketplaceListing[] };
    meta?: Readonly<Record<string, boolean | null | number | string>>;
  }> = apiRequestWithMeta,
): Promise<ListingPageResult> => {
  const response = await request(`/api/marketplace/listings?${marketplaceListingQuery(filters)}`, {
    signal,
  });
  return {
    listings: response.data.listings,
    pagination: {
      limit: Number(response.meta?.limit ?? filters.limit),
      page: Number(response.meta?.page ?? filters.page),
      total: Number(response.meta?.total ?? 0),
      totalPages: Number(response.meta?.totalPages ?? 0),
    },
  };
};

export const getListing = async (id: string): Promise<MarketplaceListing> =>
  (await apiRequest<{ readonly listing: MarketplaceListing }>(listingPath(id))).listing;

export const recordListingView = async (id: string): Promise<void> => {
  await apiRequest<{ readonly accepted: true }>(`${listingPath(id)}/view`, { method: 'POST' });
};

export interface MarketplaceRecommendation {
  readonly listing: MarketplaceListing;
  readonly reasons: readonly string[];
  readonly score: number | null;
}

export interface MarketplaceRecommendationResult {
  readonly recommendations: readonly MarketplaceRecommendation[];
  readonly source: 'personalized' | 'recent';
  readonly strategy: MarketplaceRecommendationStrategy;
}

export type MarketplaceRecommendationStrategy = 'hybrid' | 'profile' | 'recent';

export const marketplaceRecommendationSource = (
  recommenderVersion: 'marketplace-hybrid-v1' | null,
  strategy: MarketplaceRecommendationStrategy,
): MarketplaceRecommendationResult['source'] =>
  recommenderVersion === 'marketplace-hybrid-v1' && strategy !== 'recent'
    ? 'personalized'
    : 'recent';

export const marketplaceRecommendationHeading = (
  source: MarketplaceRecommendationResult['source'],
): string => (source === 'personalized' ? 'Recommended for You' : 'Recently listed');

export const serializeListingDraft = (input: Partial<ListingDraft>): string =>
  JSON.stringify(input);

export const getMarketplaceRecommendations = async (): Promise<MarketplaceRecommendationResult> => {
  const response = await apiRequest<{
    readonly recommendations: readonly MarketplaceRecommendation[];
    readonly recommenderVersion: 'marketplace-hybrid-v1' | null;
    readonly strategy: MarketplaceRecommendationStrategy;
  }>('/api/marketplace/recommendations');
  return {
    recommendations: response.recommendations,
    source: marketplaceRecommendationSource(response.recommenderVersion, response.strategy),
    strategy: response.strategy,
  };
};

export const createListing = async (input: ListingDraft): Promise<MarketplaceListing> =>
  (
    await apiRequest<{ readonly listing: MarketplaceListing }>('/api/marketplace/listings', {
      body: serializeListingDraft(input),
      method: 'POST',
    })
  ).listing;

export const updateListing = async (
  id: string,
  input: Partial<ListingDraft>,
): Promise<MarketplaceListing> =>
  (
    await apiRequest<{ readonly listing: MarketplaceListing }>(listingPath(id), {
      body: serializeListingDraft(input),
      method: 'PATCH',
    })
  ).listing;

export const deleteListing = async (id: string): Promise<void> => {
  await apiRequest<{ readonly deleted: true }>(listingPath(id), { method: 'DELETE' });
};

export const getBookmarkState = async (listingId: string): Promise<boolean> =>
  (await apiRequest<{ readonly bookmarked: boolean }>(`${listingPath(listingId)}/bookmark`))
    .bookmarked;

export const saveListingBookmark = async (listingId: string): Promise<void> => {
  await apiRequest<{ readonly bookmarked: true }>(`${listingPath(listingId)}/bookmark`, {
    method: 'POST',
  });
};

export const removeListingBookmark = async (listingId: string): Promise<void> => {
  await apiRequest<{ readonly bookmarked: false; readonly removed: boolean }>(
    `${listingPath(listingId)}/bookmark`,
    { method: 'DELETE' },
  );
};

export const getSavedListings = async (page: number, limit: number): Promise<ListingPageResult> => {
  const response = await apiRequestWithMeta<{
    readonly listings: readonly MarketplaceListing[];
  }>(`/api/marketplace/bookmarks?page=${page}&limit=${limit}`);
  return {
    listings: response.data.listings,
    pagination: {
      limit: Number(response.meta?.limit ?? limit),
      page: Number(response.meta?.page ?? page),
      total: Number(response.meta?.total ?? 0),
      totalPages: Number(response.meta?.totalPages ?? 0),
    },
  };
};

const uploadWithProgress = (
  file: File,
  authorization: MediaUploadAuthorization,
  onProgress: (percentage: number) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', authorization.uploadUrl);
    for (const [name, value] of Object.entries(authorization.requiredHeaders)) {
      request.setRequestHeader(name, value);
    }
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error('S3 rejected the image upload. Request a new upload URL and retry.'));
    });
    request.addEventListener('error', () =>
      reject(new Error('The direct image upload failed. Check the S3 CORS configuration.')),
    );
    request.addEventListener('abort', () => reject(new Error('The image upload was cancelled.')));
    request.send(file);
  });

export const uploadListingImage = async (
  listingId: string,
  file: File,
  onProgress: (percentage: number) => void,
): Promise<ListingMedia> => {
  const authorization = await apiRequest<MediaUploadAuthorization>(
    `${listingPath(listingId)}/media/upload-url`,
    {
      body: JSON.stringify({ contentType: file.type, fileName: file.name, size: file.size }),
      method: 'POST',
    },
  );
  await uploadWithProgress(file, authorization, onProgress);
  return (
    await apiRequest<{ readonly media: ListingMedia }>(
      `${listingPath(listingId)}/media/${encodeURIComponent(authorization.mediaId)}/complete`,
      { body: JSON.stringify({ objectKey: authorization.objectKey }), method: 'POST' },
    )
  ).media;
};

export const deleteListingImage = async (listingId: string, mediaId: string): Promise<void> => {
  await apiRequest<{ readonly deleted: true }>(
    `${listingPath(listingId)}/media/${encodeURIComponent(mediaId)}`,
    { method: 'DELETE' },
  );
};

export const reorderListingImages = async (
  listingId: string,
  mediaIds: readonly string[],
): Promise<readonly ListingMedia[]> =>
  (
    await apiRequest<{ readonly media: readonly ListingMedia[] }>(
      `${listingPath(listingId)}/media/order`,
      { body: JSON.stringify({ mediaIds }), method: 'PATCH' },
    )
  ).media;
