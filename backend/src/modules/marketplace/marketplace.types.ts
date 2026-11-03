import type { PhotoAvatar } from '../profile/profile-avatar-value.js';
import type { ListingCondition, ListingStatus } from '../../generated/prisma/client.js';

export interface MarketplaceCategoryView {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly slug: string;
}

export interface ListingSellerView {
  readonly avatar:
    | {
        readonly height: number | null;
        readonly id: string;
        readonly mimeType: string;
        readonly width: number | null;
      }
    | PhotoAvatar
    | null;
  readonly department: { readonly id: string; readonly name: string } | null;
  readonly displayName: string;
  readonly id: string;
}

export interface ListingMediaView {
  readonly height: number | null;
  readonly id: string;
  readonly mimeType: string;
  readonly sortOrder: number;
  readonly url: string | null;
  readonly width: number | null;
}

export interface MarketplaceMediaRecord extends ListingMediaView {
  readonly mimeType: string;
  readonly objectKey: string;
  readonly originalName: string | null;
  readonly uploadedById: string;
}

export interface MediaUploadRequest {
  readonly contentType: string;
  readonly fileName: string;
  readonly size: number;
}

export interface MediaCompletionRequest {
  readonly objectKey: string;
}

export interface MarketplaceListingView {
  readonly category: MarketplaceCategoryView;
  readonly condition: ListingCondition;
  readonly createdAt: string;
  readonly currency: string;
  readonly description: string;
  readonly featuredOnLanding?: boolean;
  readonly id: string;
  readonly isBookmarked: boolean;
  readonly location: string | null;
  readonly media: readonly ListingMediaView[];
  readonly price: string;
  readonly seller: ListingSellerView;
  readonly sellerId: string;
  readonly soldAt: string | null;
  readonly status: ListingStatus;
  readonly title: string;
  readonly updatedAt: string;
}

export interface ListingCreateInput {
  readonly categoryId: string;
  readonly condition: ListingCondition;
  readonly currency: string;
  readonly description: string;
  readonly featuredOnLanding?: boolean;
  readonly location: string | null;
  readonly price: string;
  readonly status: ListingStatus;
  readonly title: string;
}

export interface ListingUpdateInput {
  readonly categoryId?: string;
  readonly condition?: ListingCondition;
  readonly currency?: string;
  readonly description?: string;
  readonly featuredOnLanding?: boolean;
  readonly location?: string | null;
  readonly price?: string;
  readonly status?: ListingStatus;
  readonly title?: string;
}

export interface ListingQuery {
  readonly categoryId?: string;
  readonly condition?: ListingCondition;
  readonly excludeIds?: readonly string[];
  readonly limit: number;
  readonly maxPrice?: string;
  readonly minPrice?: string;
  readonly page: number;
  readonly search?: string;
  readonly sort: ListingSort;
  readonly status?: ListingStatus;
}

export type ListingSort = 'newest' | 'price_asc' | 'price_desc';

export interface BookmarkQuery {
  readonly limit: number;
  readonly page: number;
}

export interface PaginatedListings {
  readonly items: readonly MarketplaceListingView[];
  readonly limit: number;
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
}
