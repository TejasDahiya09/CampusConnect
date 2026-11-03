import type { ProfileAvatar } from '../profile/profile.types';
export type ListingCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'POOR';
export type ListingStatus = 'ACTIVE' | 'SOLD' | 'ARCHIVED';
export type ListingDiscoveryStatus = 'ACTIVE' | 'SOLD';
export type ListingSort = 'newest' | 'price_asc' | 'price_desc';

export interface MarketplaceCategory {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly slug: string;
}

export interface MarketplaceListing {
  readonly category: MarketplaceCategory;
  readonly condition: ListingCondition;
  readonly createdAt: string;
  readonly currency: string;
  readonly description: string;
  readonly featuredOnLanding?: boolean;
  readonly id: string;
  readonly isBookmarked: boolean;
  readonly location: string | null;
  readonly media: readonly {
    readonly height: number | null;
    readonly id: string;
    readonly mimeType: string;
    readonly sortOrder: number;
    readonly url: string | null;
    readonly width: number | null;
  }[];
  readonly price: string;
  readonly seller: {
    readonly avatar:
      | {
          readonly height: number | null;
          readonly id: string;
          readonly mimeType: string;
          readonly width: number | null;
        }
      | ProfileAvatar
      | null;
    readonly department: { readonly id: string; readonly name: string } | null;
    readonly displayName: string;
    readonly id: string;
  };
  readonly sellerId: string;
  readonly soldAt: string | null;
  readonly status: ListingStatus;
  readonly title: string;
  readonly updatedAt: string;
}

export type ListingMedia = MarketplaceListing['media'][number];

export interface MediaUploadAuthorization {
  readonly expiresAt: string;
  readonly mediaId: string;
  readonly objectKey: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly uploadUrl: string;
}

export interface ListingDraft {
  readonly categoryId: string;
  readonly condition: ListingCondition;
  readonly currency: string;
  readonly description: string;
  readonly featuredOnLanding: boolean;
  readonly location: string | null;
  readonly price: string;
  readonly status: ListingStatus;
  readonly title: string;
}

export interface ListingFilters {
  readonly categoryId?: string;
  readonly condition?: ListingCondition;
  readonly excludeIds?: readonly string[];
  readonly limit: number;
  readonly maxPrice?: string;
  readonly minPrice?: string;
  readonly page: number;
  readonly search?: string;
  readonly sort: ListingSort;
  readonly status?: ListingDiscoveryStatus;
}

export interface ListingPageResult {
  readonly listings: readonly MarketplaceListing[];
  readonly pagination: {
    readonly limit: number;
    readonly page: number;
    readonly total: number;
    readonly totalPages: number;
  };
}
