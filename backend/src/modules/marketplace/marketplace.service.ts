import { AppError } from '../../errors/app-error.js';
import {
  ListingStatus,
  type ListingStatus as ListingStatusValue,
} from '../../generated/prisma/client.js';
import { marketplaceRepository, type MarketplaceRepository } from './marketplace.repository.js';
import type {
  ListingCreateInput,
  ListingQuery,
  ListingUpdateInput,
  MarketplaceCategoryView,
  MarketplaceListingView,
  PaginatedListings,
} from './marketplace.types.js';

const notFound = () =>
  new AppError({
    code: 'LISTING_NOT_FOUND',
    message: 'The marketplace listing was not found.',
    statusCode: 404,
  });

const forbidden = () =>
  new AppError({
    code: 'LISTING_FORBIDDEN',
    message: "You cannot modify another student's listing.",
    statusCode: 403,
  });

const assertActiveCategory = async (
  repository: MarketplaceRepository,
  categoryId: string,
): Promise<void> => {
  if (!(await repository.isActiveCategory(categoryId))) {
    throw new AppError({
      code: 'INVALID_MARKETPLACE_CATEGORY',
      message: 'Select an active marketplace category.',
      statusCode: 400,
    });
  }
};

const allowedTransitions = {
  ACTIVE: [ListingStatus.ACTIVE, ListingStatus.SOLD, ListingStatus.ARCHIVED],
  ARCHIVED: [ListingStatus.ARCHIVED],
  SOLD: [ListingStatus.SOLD, ListingStatus.ARCHIVED],
} as const;

const publiclyVisibleStatuses: readonly ListingStatusValue[] = [
  ListingStatus.ACTIVE,
  ListingStatus.SOLD,
];

const assertTransition = (listing: MarketplaceListingView, input: ListingUpdateInput): void => {
  if (!(listing.status in allowedTransitions)) throw notFound();
  const nextStatus = input.status ?? listing.status;
  const permitted = allowedTransitions[listing.status];
  if (!permitted.includes(nextStatus as never)) {
    throw new AppError({
      code: 'INVALID_LISTING_STATUS_TRANSITION',
      message: `A ${listing.status.toLowerCase()} listing cannot transition to ${nextStatus.toLowerCase()}.`,
      statusCode: 409,
    });
  }

  const contentFields = Object.keys(input).filter((field) => field !== 'status');
  if (listing.status !== ListingStatus.ACTIVE && contentFields.length > 0) {
    throw new AppError({
      code: 'LISTING_NOT_EDITABLE',
      message: 'Only active listings can have their content edited.',
      statusCode: 409,
    });
  }
};

export interface MarketplaceService {
  createListing(sellerId: string, input: ListingCreateInput): Promise<MarketplaceListingView>;
  deleteListing(sellerId: string, id: string): Promise<void>;
  getListing(id: string, viewerId?: string): Promise<MarketplaceListingView>;
  listCategories(): Promise<readonly MarketplaceCategoryView[]>;
  listListings(query: ListingQuery, viewerId?: string): Promise<PaginatedListings>;
  updateListing(
    sellerId: string,
    id: string,
    input: ListingUpdateInput,
  ): Promise<MarketplaceListingView>;
}

export const createMarketplaceService = (
  repository: MarketplaceRepository = marketplaceRepository,
): MarketplaceService => ({
  createListing: async (sellerId, input) => {
    await assertActiveCategory(repository, input.categoryId);
    return repository.create(sellerId, input);
  },

  deleteListing: async (sellerId, id) => {
    const listing = await repository.findById(id);
    if (listing === null) throw notFound();
    if (listing.sellerId !== sellerId) throw forbidden();
    if (!(await repository.deleteOwned(id, sellerId))) throw notFound();
  },

  getListing: async (id, viewerId) => {
    const listing = await repository.findById(id, viewerId);
    if (listing === null || !publiclyVisibleStatuses.includes(listing.status)) {
      throw notFound();
    }
    return listing;
  },

  listCategories: () => repository.listCategories(),

  listListings: async (query, viewerId) => {
    if (query.categoryId !== undefined) await assertActiveCategory(repository, query.categoryId);
    const { items, total } = await repository.list(query, viewerId);
    return {
      items,
      limit: query.limit,
      page: query.page,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  },

  updateListing: async (sellerId, id, input) => {
    const listing = await repository.findById(id);
    if (listing === null) throw notFound();
    if (listing.sellerId !== sellerId) throw forbidden();
    assertTransition(listing, input);
    if (input.categoryId !== undefined) await assertActiveCategory(repository, input.categoryId);

    const soldAt =
      input.status === ListingStatus.SOLD && listing.status !== ListingStatus.SOLD
        ? new Date()
        : input.status === ListingStatus.ARCHIVED && listing.soldAt !== null
          ? null
          : undefined;
    const updated = await repository.updateOwned(id, sellerId, {
      ...input,
      ...(soldAt === undefined ? {} : { soldAt }),
    });
    if (updated === null) throw notFound();
    return updated;
  },
});

export const marketplaceService = createMarketplaceService();
