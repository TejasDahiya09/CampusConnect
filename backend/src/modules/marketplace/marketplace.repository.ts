import { profileAvatarView } from '../profile/profile-avatar-value.js';
import { prisma } from '../../database/prisma.js';
import {
  AccountStatus,
  ListingStatus,
  ModerationVisibility,
  type ListingStatus as ListingStatusValue,
  type Prisma,
} from '../../generated/prisma/client.js';
import { getCloudFrontDeliveryUrl } from '../../services/storage/cloudfront-url.js';
import { findMarketplaceCategory, marketplaceCategories } from './marketplace-categories.js';
import { parseBookmarkIds, parseMarketplaceImages } from './marketplace-json.js';
import type {
  ListingCreateInput,
  ListingQuery,
  ListingSellerView,
  ListingSort,
  ListingUpdateInput,
  MarketplaceCategoryView,
  MarketplaceListingView,
} from './marketplace.types.js';

export const getListingSelect = () =>
  ({
    bookmarks: true,
    category: true,
    condition: true,
    createdAt: true,
    currency: true,
    description: true,
    featuredOnLanding: true,
    id: true,
    images: true,
    location: true,
    price: true,
    seller: {
      select: {
        id: true,
        profile: {
          select: { avatar: true, department: true, fullName: true, moderationVisibility: true },
        },
      },
    },
    sellerId: true,
    soldAt: true,
    status: true,
    title: true,
    updatedAt: true,
  }) satisfies Prisma.MarketplaceSelect;

export type ListingRow = Prisma.MarketplaceGetPayload<{
  select: ReturnType<typeof getListingSelect>;
}>;

const isObject = (value: Prisma.JsonValue): value is Record<string, Prisma.JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const parseAvatar = (value: Prisma.JsonValue | null): ListingSellerView['avatar'] => {
  if (
    value === null ||
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.mimeType !== 'string'
  )
    return null;
  return {
    height: typeof value.height === 'number' ? value.height : null,
    id: value.id,
    mimeType: value.mimeType,
    width: typeof value.width === 'number' ? value.width : null,
  };
};
const fallbackCategory = (name: string): MarketplaceCategoryView => {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'other';
  return { id: slug, name, parentId: null, slug };
};

export const mapListing = (row: ListingRow, viewerId?: string): MarketplaceListingView => ({
  category: findMarketplaceCategory(row.category) ?? fallbackCategory(row.category),
  condition: row.condition,
  createdAt: row.createdAt.toISOString(),
  currency: row.currency.trim(),
  description: row.description ?? '',
  ...(viewerId === row.sellerId ? { featuredOnLanding: row.featuredOnLanding } : {}),
  id: row.id,
  isBookmarked: viewerId !== undefined && parseBookmarkIds(row.bookmarks).includes(viewerId),
  location: row.location,
  media: parseMarketplaceImages(row.images).map((image) => ({
    height: image.height,
    id: image.id,
    mimeType: image.mimeType,
    sortOrder: image.position,
    url: getCloudFrontDeliveryUrl(image.key),
    width: image.width,
  })),
  price: row.price.toFixed(2),
  seller: {
    avatar:
      row.seller.profile?.moderationVisibility === 'VISIBLE' &&
      profileAvatarView(row.seller.profile.avatar)?.type === 'photo'
        ? (profileAvatarView(row.seller.profile.avatar) as Extract<
            ListingSellerView['avatar'],
            { type: 'photo' }
          >)
        : parseAvatar(row.seller.profile?.avatar ?? null),
    department:
      row.seller.profile?.department === null || row.seller.profile?.department === undefined
        ? null
        : { id: row.seller.profile.department, name: row.seller.profile.department },
    displayName: row.seller.profile?.fullName ?? 'CampusConnect student',
    id: row.seller.id,
  },
  sellerId: row.sellerId,
  soldAt: row.soldAt?.toISOString() ?? null,
  status: row.status,
  title: row.title,
  updatedAt: row.updatedAt.toISOString(),
});

interface ListingPersistenceUpdate extends ListingUpdateInput {
  readonly soldAt?: Date | null;
}
export interface MarketplaceRepository {
  create(sellerId: string, input: ListingCreateInput): Promise<MarketplaceListingView>;
  deleteOwned(id: string, sellerId: string): Promise<boolean>;
  findById(id: string, viewerId?: string): Promise<MarketplaceListingView | null>;
  isActiveCategory(categoryId: string): Promise<boolean>;
  list(
    query: ListingQuery,
    viewerId?: string,
    ownerId?: string,
  ): Promise<{ readonly items: readonly MarketplaceListingView[]; readonly total: number }>;
  listCategories(): Promise<readonly MarketplaceCategoryView[]>;
  updateOwned(
    id: string,
    sellerId: string,
    input: ListingPersistenceUpdate,
  ): Promise<MarketplaceListingView | null>;
}

const publiclyVisibleStatuses: ListingStatusValue[] = [ListingStatus.ACTIVE, ListingStatus.SOLD];
export const buildListingWhere = (
  query: ListingQuery,
  ownerId?: string,
): Prisma.MarketplaceWhereInput => ({
  ...(ownerId === undefined ? {} : { sellerId: ownerId }),
  moderationVisibility: ModerationVisibility.VISIBLE,
  ...(query.categoryId === undefined
    ? {}
    : { category: findMarketplaceCategory(query.categoryId)?.name ?? query.categoryId }),
  ...(query.condition === undefined ? {} : { condition: query.condition }),
  ...(query.excludeIds === undefined ? {} : { id: { notIn: [...query.excludeIds] } }),
  ...(query.search === undefined
    ? {}
    : {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
  ...(query.maxPrice === undefined && query.minPrice === undefined
    ? {}
    : {
        price: {
          ...(query.maxPrice === undefined ? {} : { lte: query.maxPrice }),
          ...(query.minPrice === undefined ? {} : { gte: query.minPrice }),
        },
      }),
  status: query.status ?? { in: publiclyVisibleStatuses },
  seller: { status: AccountStatus.ACTIVE },
});

export const getListingOrderBy = (
  sort: ListingSort,
): Prisma.MarketplaceOrderByWithRelationInput[] => {
  switch (sort) {
    case 'price_asc':
      return [{ price: 'asc' }, { id: 'desc' }];
    case 'price_desc':
      return [{ price: 'desc' }, { id: 'desc' }];
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
};

const persistenceData = (
  input: ListingCreateInput | ListingPersistenceUpdate,
): Prisma.MarketplaceUncheckedUpdateInput => {
  const { categoryId, ...fields } = input;
  return {
    ...fields,
    ...(categoryId === undefined
      ? {}
      : { category: findMarketplaceCategory(categoryId)?.name ?? categoryId }),
  };
};

export const marketplaceRepository: MarketplaceRepository = {
  create: async (sellerId, input) => {
    const category = findMarketplaceCategory(input.categoryId);
    if (category === undefined) throw new Error('Validated marketplace category was not found.');
    const row = await prisma.marketplace.create({
      data: {
        category: category.name,
        condition: input.condition,
        currency: input.currency,
        description: input.description,
        featuredOnLanding: input.featuredOnLanding ?? false,
        location: input.location,
        price: input.price,
        sellerId,
        status: input.status,
        title: input.title,
      },
      select: getListingSelect(),
    });
    return mapListing(row, sellerId);
  },
  deleteOwned: async (id, sellerId) =>
    (
      await prisma.marketplace.updateMany({
        data: { status: ListingStatus.ARCHIVED },
        where: { id, moderationVisibility: ModerationVisibility.VISIBLE, sellerId },
      })
    ).count > 0,
  findById: async (id, viewerId) => {
    const row = await prisma.marketplace.findFirst({
      select: getListingSelect(),
      where: {
        id,
        moderationVisibility: ModerationVisibility.VISIBLE,
        seller: { status: AccountStatus.ACTIVE },
      },
    });
    return row === null ? null : mapListing(row, viewerId);
  },
  isActiveCategory: (categoryId) =>
    Promise.resolve(findMarketplaceCategory(categoryId) !== undefined),
  list: async (query, viewerId, ownerId) => {
    const where = buildListingWhere(query, ownerId);
    const [rows, total] = await Promise.all([
      prisma.marketplace.findMany({
        orderBy: getListingOrderBy(query.sort),
        select: getListingSelect(),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        where,
      }),
      prisma.marketplace.count({ where }),
    ]);
    return { items: rows.map((row) => mapListing(row, viewerId)), total };
  },
  listCategories: () => Promise.resolve(marketplaceCategories),
  updateOwned: async (id, sellerId, input) => {
    const result = await prisma.marketplace.updateMany({
      data: persistenceData(input),
      where: { id, moderationVisibility: ModerationVisibility.VISIBLE, sellerId },
    });
    if (result.count === 0) return null;
    const row = await prisma.marketplace.findFirst({
      select: getListingSelect(),
      where: {
        id,
        moderationVisibility: ModerationVisibility.VISIBLE,
        seller: { status: AccountStatus.ACTIVE },
      },
    });
    return row === null ? null : mapListing(row, sellerId);
  },
};
