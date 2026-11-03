import { prisma } from '../../database/prisma.js';
import {
  AccountStatus,
  ListingStatus,
  ModerationVisibility,
  Prisma,
} from '../../generated/prisma/client.js';
import { getListingSelect, mapListing } from './marketplace.repository.js';
import { parseBookmarkIds } from './marketplace-json.js';
import type { BookmarkQuery, MarketplaceListingView } from './marketplace.types.js';

const bookmarkableStatuses: ListingStatus[] = [ListingStatus.ACTIVE, ListingStatus.SOLD];
const eligibleListingWhere = {
  moderationVisibility: ModerationVisibility.VISIBLE,
  seller: { status: AccountStatus.ACTIVE },
  status: { in: bookmarkableStatuses },
} satisfies Prisma.MarketplaceWhereInput;

export interface MarketplaceBookmarkRepository {
  getState(userId: string, listingId: string): Promise<boolean | null>;
  list(
    userId: string,
    query: BookmarkQuery,
  ): Promise<{ readonly items: readonly MarketplaceListingView[]; readonly total: number }>;
  remove(userId: string, listingId: string): Promise<boolean>;
  save(userId: string, listingId: string): Promise<boolean>;
}

export const marketplaceBookmarkRepository: MarketplaceBookmarkRepository = {
  getState: async (userId, listingId) => {
    const listing = await prisma.marketplace.findFirst({
      select: { bookmarks: true },
      where: { ...eligibleListingWhere, id: listingId },
    });
    return listing === null ? null : parseBookmarkIds(listing.bookmarks).includes(userId);
  },
  list: async (userId, query) => {
    const where = {
      ...eligibleListingWhere,
      bookmarks: { array_contains: [userId] },
    } satisfies Prisma.MarketplaceWhereInput;
    const [listings, total] = await Promise.all([
      prisma.marketplace.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: getListingSelect(),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        where,
      }),
      prisma.marketplace.count({ where }),
    ]);
    return { items: listings.map((listing) => mapListing(listing, userId)), total };
  },
  remove: (userId, listingId) =>
    prisma.$transaction(
      async (transaction) => {
        const listing = await transaction.marketplace.findUnique({
          select: { bookmarks: true },
          where: { id: listingId },
        });
        if (listing === null) return false;
        const bookmarks = parseBookmarkIds(listing.bookmarks);
        const remaining = bookmarks.filter((id) => id !== userId);
        if (remaining.length === bookmarks.length) return false;
        await transaction.marketplace.update({
          data: { bookmarks: remaining },
          where: { id: listingId },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  save: (userId, listingId) =>
    prisma.$transaction(
      async (transaction) => {
        const listing = await transaction.marketplace.findFirst({
          select: { bookmarks: true },
          where: { ...eligibleListingWhere, id: listingId },
        });
        if (listing === null) return false;
        const bookmarks = parseBookmarkIds(listing.bookmarks);
        if (!bookmarks.includes(userId))
          await transaction.marketplace.update({
            data: { bookmarks: [...bookmarks, userId] },
            where: { id: listingId },
          });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
};
