import { AppError } from '../../errors/app-error.js';
import {
  marketplaceBookmarkRepository,
  type MarketplaceBookmarkRepository,
} from './marketplace-bookmark.repository.js';
import type { BookmarkQuery, PaginatedListings } from './marketplace.types.js';

const unavailableListing = () =>
  new AppError({
    code: 'LISTING_NOT_FOUND',
    message: 'The marketplace listing was not found.',
    statusCode: 404,
  });

export interface MarketplaceBookmarkService {
  getState(userId: string, listingId: string): Promise<boolean>;
  list(userId: string, query: BookmarkQuery): Promise<PaginatedListings>;
  remove(userId: string, listingId: string): Promise<boolean>;
  save(userId: string, listingId: string): Promise<void>;
}

export const createMarketplaceBookmarkService = (
  repository: MarketplaceBookmarkRepository = marketplaceBookmarkRepository,
): MarketplaceBookmarkService => ({
  getState: async (userId, listingId) => {
    const state = await repository.getState(userId, listingId);
    if (state === null) throw unavailableListing();
    return state;
  },

  list: async (userId, query) => {
    const { items, total } = await repository.list(userId, query);
    return {
      items,
      limit: query.limit,
      page: query.page,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  },

  remove: (userId, listingId) => repository.remove(userId, listingId),

  save: async (userId, listingId) => {
    if (!(await repository.save(userId, listingId))) throw unavailableListing();
  },
});

export const marketplaceBookmarkService = createMarketplaceBookmarkService();
