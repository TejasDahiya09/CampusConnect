import { ModerationVisibility, Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';

export const MARKETPLACE_VIEW_EVENT = 'marketplace_listing_view';
export const MARKETPLACE_ENTITY_TYPE = 'marketplace_listing';
export const MARKETPLACE_VIEW_DEDUP_MINUTES = 30;
export const MARKETPLACE_VIEW_HISTORY_LIMIT = 100;
export const MARKETPLACE_VIEW_HALF_LIFE_DAYS = 14;

export interface MarketplaceViewRepository {
  recordIfEligible(userId: string, listingId: string, cutoff: Date): Promise<boolean>;
}

export const isPersonalizedViewEligible = (sellerId: string | undefined, userId: string): boolean =>
  sellerId !== undefined && sellerId !== userId;

export const marketplaceViewRepository: MarketplaceViewRepository = {
  recordIfEligible: (userId, listingId, cutoff) =>
    prisma.$transaction(
      async (transaction) => {
        const listing = await transaction.marketplace.findFirst({
          select: { sellerId: true },
          where: {
            id: listingId,
            moderationVisibility: ModerationVisibility.VISIBLE,
            status: { in: ['ACTIVE', 'SOLD'] },
          },
        });
        if (!isPersonalizedViewEligible(listing?.sellerId, userId)) return false;
        const duplicate = await transaction.activity.findFirst({
          select: { id: true },
          where: {
            createdAt: { gte: cutoff },
            entityId: listingId,
            entityType: MARKETPLACE_ENTITY_TYPE,
            event: MARKETPLACE_VIEW_EVENT,
            userId,
          },
        });
        if (duplicate !== null) return false;
        await transaction.activity.create({
          data: {
            entityId: listingId,
            entityType: MARKETPLACE_ENTITY_TYPE,
            event: MARKETPLACE_VIEW_EVENT,
            userId,
          },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
};

export interface MarketplaceViewService {
  record(userId: string, listingId: string, now?: Date): Promise<boolean>;
}

export const createMarketplaceViewService = (
  repository: MarketplaceViewRepository = marketplaceViewRepository,
): MarketplaceViewService => ({
  record: (userId, listingId, now = new Date()) => {
    const cutoff = new Date(now.getTime() - MARKETPLACE_VIEW_DEDUP_MINUTES * 60_000);
    return repository.recordIfEligible(userId, listingId, cutoff);
  },
});

export const marketplaceViewService = createMarketplaceViewService();
