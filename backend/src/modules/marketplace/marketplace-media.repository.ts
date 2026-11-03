import { prisma } from '../../database/prisma.js';
import {
  ListingStatus,
  ModerationVisibility,
  Prisma,
  type ListingStatus as ListingStatusValue,
} from '../../generated/prisma/client.js';
import { getCloudFrontDeliveryUrl } from '../../services/storage/cloudfront-url.js';
import {
  marketplaceImagesToJson,
  normalizeMarketplaceImages,
  parseMarketplaceImages,
  type MarketplaceImageMetadata,
} from './marketplace-json.js';
import type { MarketplaceMediaRecord } from './marketplace.types.js';

export interface ListingMediaContext {
  readonly imageCount: number;
  readonly sellerId: string;
  readonly status: ListingStatusValue;
  readonly moderationVisibility: ModerationVisibility;
}
export type FinalizeMediaResult =
  | { readonly kind: 'created'; readonly media: MarketplaceMediaRecord }
  | { readonly kind: 'limit' }
  | { readonly kind: 'listing-unavailable' };
export interface FinalizeMediaInput {
  readonly byteSize: number;
  readonly contentType: string;
  readonly listingId: string;
  readonly mediaId: string;
  readonly objectKey: string;
  readonly originalName: string;
  readonly uploaderId: string;
}
export interface MarketplaceMediaRepository {
  deleteLinkedMedia(listingId: string, mediaId: string): Promise<MarketplaceMediaRecord | null>;
  finalizeMedia(input: FinalizeMediaInput, maximumImages: number): Promise<FinalizeMediaResult>;
  findLinkedMedia(listingId: string, mediaId: string): Promise<MarketplaceMediaRecord | null>;
  getListingContext(listingId: string): Promise<ListingMediaContext | null>;
  listLinkedMedia(listingId: string): Promise<readonly MarketplaceMediaRecord[]>;
  reorder(listingId: string, mediaIds: readonly string[]): Promise<boolean>;
}

const toRecord = (image: MarketplaceImageMetadata): MarketplaceMediaRecord => ({
  height: image.height,
  id: image.id,
  mimeType: image.mimeType,
  objectKey: image.key,
  originalName: image.originalName,
  sortOrder: image.position,
  uploadedById: image.uploadedById,
  url: getCloudFrontDeliveryUrl(image.key),
  width: image.width,
});

export const marketplaceMediaRepository: MarketplaceMediaRepository = {
  deleteLinkedMedia: (listingId, mediaId) =>
    prisma.$transaction(
      async (transaction) => {
        const listing = await transaction.marketplace.findUnique({
          select: { images: true },
          where: { id: listingId },
        });
        if (listing === null) return null;
        const images = parseMarketplaceImages(listing.images);
        const removed = images.find((image) => image.id === mediaId);
        if (removed === undefined) return null;
        await transaction.marketplace.update({
          data: {
            images: marketplaceImagesToJson(
              normalizeMarketplaceImages(images.filter((image) => image.id !== mediaId)),
            ),
          },
          where: { id: listingId },
        });
        return toRecord(removed);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  finalizeMedia: (input, maximumImages) =>
    prisma.$transaction(
      async (transaction) => {
        const listing = await transaction.marketplace.findUnique({
          select: { images: true, moderationVisibility: true, sellerId: true, status: true },
          where: { id: input.listingId },
        });
        if (
          listing === null ||
          listing.sellerId !== input.uploaderId ||
          listing.status !== ListingStatus.ACTIVE ||
          listing.moderationVisibility !== ModerationVisibility.VISIBLE
        )
          return { kind: 'listing-unavailable' } as const;
        const images = parseMarketplaceImages(listing.images);
        const existing = images.find((image) => image.id === input.mediaId);
        if (existing !== undefined) return { kind: 'created', media: toRecord(existing) } as const;
        if (images.length >= maximumImages) return { kind: 'limit' } as const;
        const image: MarketplaceImageMetadata = {
          height: null,
          id: input.mediaId,
          key: input.objectKey,
          mimeType: input.contentType,
          originalName: input.originalName,
          position: images.length,
          primary: images.length === 0,
          size: input.byteSize,
          uploadedById: input.uploaderId,
          url: getCloudFrontDeliveryUrl(input.objectKey),
          width: null,
        };
        await transaction.marketplace.update({
          data: { images: marketplaceImagesToJson([...images, image]) },
          where: { id: input.listingId },
        });
        return { kind: 'created', media: toRecord(image) } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  findLinkedMedia: async (listingId, mediaId) => {
    const listing = await prisma.marketplace.findUnique({
      select: { images: true },
      where: { id: listingId },
    });
    const image =
      listing === null
        ? undefined
        : parseMarketplaceImages(listing.images).find((item) => item.id === mediaId);
    return image === undefined ? null : toRecord(image);
  },

  getListingContext: async (listingId) => {
    const listing = await prisma.marketplace.findUnique({
      select: { images: true, moderationVisibility: true, sellerId: true, status: true },
      where: { id: listingId },
    });
    return listing === null
      ? null
      : {
          imageCount: parseMarketplaceImages(listing.images).length,
          sellerId: listing.sellerId,
          status: listing.status,
          moderationVisibility: listing.moderationVisibility,
        };
  },

  listLinkedMedia: async (listingId) => {
    const listing = await prisma.marketplace.findUnique({
      select: { images: true },
      where: { id: listingId },
    });
    return listing === null ? [] : parseMarketplaceImages(listing.images).map(toRecord);
  },

  reorder: (listingId, mediaIds) =>
    prisma.$transaction(
      async (transaction) => {
        const listing = await transaction.marketplace.findUnique({
          select: { images: true },
          where: { id: listingId },
        });
        if (listing === null) return false;
        const images = parseMarketplaceImages(listing.images);
        if (
          images.length !== mediaIds.length ||
          new Set(mediaIds).size !== mediaIds.length ||
          images.some(({ id }) => !mediaIds.includes(id))
        )
          return false;
        const byId = new Map(images.map((image) => [image.id, image]));
        const ordered = mediaIds
          .map((id) => byId.get(id))
          .filter((image): image is MarketplaceImageMetadata => image !== undefined);
        await transaction.marketplace.update({
          data: { images: marketplaceImagesToJson(normalizeMarketplaceImages(ordered)) },
          where: { id: listingId },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
};
