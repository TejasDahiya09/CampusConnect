import {
  AccountStatus,
  ListingStatus,
  ModerationVisibility,
} from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';
import { aiClient } from '../../integrations/ai/ai-client.js';
import { mapListing, getListingSelect } from './marketplace.repository.js';
import { parseBookmarkIds } from './marketplace-json.js';
import {
  MARKETPLACE_ENTITY_TYPE,
  MARKETPLACE_VIEW_EVENT,
  MARKETPLACE_VIEW_HALF_LIFE_DAYS,
  MARKETPLACE_VIEW_HISTORY_LIMIT,
} from './marketplace-view.service.js';

const viewStrength = (createdAt: Date, now: Date): number => {
  const ageDays = Math.max(0, (now.getTime() - createdAt.getTime()) / 86_400_000);
  return 0.35 * Math.exp((-Math.log(2) * ageDays) / MARKETPLACE_VIEW_HALF_LIFE_DAYS);
};

export const recommendationCandidateWhere = (userId: string) => ({
  moderationVisibility: ModerationVisibility.VISIBLE,
  seller: { status: AccountStatus.ACTIVE },
  sellerId: { not: userId },
  status: ListingStatus.ACTIVE,
});

export const eligibleViewedListingWhere = (userId: string, viewedIds: readonly string[]) => ({
  moderationVisibility: ModerationVisibility.VISIBLE,
  id: { in: [...viewedIds] },
  seller: { status: AccountStatus.ACTIVE },
  sellerId: { not: userId },
  status: ListingStatus.ACTIVE,
});

export const getMarketplaceRecommendations = async (userId: string, now = new Date()) => {
  const [profile, candidates, viewHistory] = await Promise.all([
    prisma.profile.findUnique({ select: { interests: true }, where: { userId } }),
    prisma.marketplace.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: getListingSelect(),
      take: 100,
      where: recommendationCandidateWhere(userId),
    }),
    prisma.activity.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true, entityId: true },
      take: MARKETPLACE_VIEW_HISTORY_LIMIT,
      where: {
        entityId: { not: null },
        entityType: MARKETPLACE_ENTITY_TYPE,
        event: MARKETPLACE_VIEW_EVENT,
        userId,
      },
    }),
  ]);
  const bookmarkStrength = new Map<string, number>();
  for (const listing of candidates)
    if (parseBookmarkIds(listing.bookmarks).includes(userId))
      bookmarkStrength.set(listing.category, 1);
  const viewedIds = viewHistory.flatMap((activity) =>
    activity.entityId === null ? [] : [activity.entityId],
  );
  const viewedListings =
    viewedIds.length === 0
      ? []
      : await prisma.marketplace.findMany({
          select: { category: true, id: true },
          where: eligibleViewedListingWhere(userId, viewedIds),
        });
  const viewedCategory = new Map(viewedListings.map((listing) => [listing.id, listing.category]));
  const viewCategoryStrength = new Map<string, number>();
  for (const activity of viewHistory) {
    if (activity.entityId === null) continue;
    const category = viewedCategory.get(activity.entityId);
    if (category === undefined) continue;
    viewCategoryStrength.set(
      category,
      Math.max(viewCategoryStrength.get(category) ?? 0, viewStrength(activity.createdAt, now)),
    );
  }
  const fallback = candidates.slice(0, 8).map((listing) => ({
    listing: mapListing(listing, userId),
    reasons: ['Recently listed'] as const,
    score: null,
  }));
  if (aiClient.recommendMarketplace === undefined)
    return { recommenderVersion: null, strategy: 'recent' as const, recommendations: fallback };
  const result = await aiClient.recommendMarketplace({
    userContext: {
      interests: profile?.interests ?? [],
      categorySignals: [
        ...[...bookmarkStrength].map(([category, strength]) => ({
          category,
          source: 'bookmark' as const,
          strength,
        })),
        ...[...viewCategoryStrength].map(([category, strength]) => ({
          category,
          source: 'view' as const,
          strength,
        })),
      ],
    },
    candidates: candidates.map((listing) => ({
      category: listing.category,
      createdAt: listing.createdAt.toISOString(),
      description: listing.description ?? '',
      id: listing.id,
      title: listing.title,
    })),
    limit: 8,
  });
  if (result.status !== 'AVAILABLE')
    return { recommenderVersion: null, strategy: 'recent' as const, recommendations: fallback };
  const byId = new Map(candidates.map((listing) => [listing.id, listing]));
  return {
    recommenderVersion: result.data.recommenderVersion,
    strategy: result.data.strategy,
    recommendations: result.data.results.flatMap((item) => {
      const listing = byId.get(item.listingId);
      return listing
        ? [{ listing: mapListing(listing, userId), reasons: item.reasons, score: item.score }]
        : [];
    }),
  };
};
