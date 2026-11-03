import { randomUUID } from 'node:crypto';
import { AppError } from '../../errors/app-error.js';
import { ListingStatus, ModerationVisibility } from '../../generated/prisma/client.js';
import { s3StorageService } from '../../services/storage/s3-storage.service.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import {
  marketplaceMediaRepository,
  type ListingMediaContext,
  type MarketplaceMediaRepository,
} from './marketplace-media.repository.js';
import {
  canonicalExtension,
  isMarketplaceContentType,
  marketplaceImageExtensions,
  MAX_MARKETPLACE_IMAGES,
  MAX_MARKETPLACE_IMAGE_SIZE,
  type MarketplaceImageContentType,
} from './marketplace-media.validation.js';
import type {
  ListingMediaView,
  MarketplaceMediaRecord,
  MediaCompletionRequest,
  MediaUploadRequest,
} from './marketplace.types.js';

export interface MediaUploadAuthorizationView {
  readonly expiresAt: string;
  readonly mediaId: string;
  readonly objectKey: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly uploadUrl: string;
}

export interface MarketplaceMediaService {
  authorizeUpload(
    userId: string,
    listingId: string,
    input: MediaUploadRequest,
  ): Promise<MediaUploadAuthorizationView>;
  completeUpload(
    userId: string,
    listingId: string,
    mediaId: string,
    input: MediaCompletionRequest,
  ): Promise<ListingMediaView>;
  deleteMedia(userId: string, listingId: string, mediaId: string): Promise<void>;
  reorderMedia(
    userId: string,
    listingId: string,
    mediaIds: readonly string[],
  ): Promise<readonly ListingMediaView[]>;
}

const toMediaView = ({
  objectKey: _objectKey,
  originalName: _originalName,
  uploadedById: _uploadedById,
  ...view
}: MarketplaceMediaRecord): ListingMediaView => view;

const listingNotFound = () =>
  new AppError({
    code: 'LISTING_NOT_FOUND',
    message: 'The marketplace listing was not found.',
    statusCode: 404,
  });

const assertEditableOwner = (
  context: ListingMediaContext | null,
  userId: string,
): ListingMediaContext => {
  if (context === null) throw listingNotFound();
  if (context.sellerId !== userId) {
    throw new AppError({
      code: 'LISTING_FORBIDDEN',
      message: "You cannot modify another student's listing media.",
      statusCode: 403,
    });
  }
  if (context.status !== ListingStatus.ACTIVE) {
    throw new AppError({
      code: 'LISTING_MEDIA_NOT_EDITABLE',
      message: 'Media can only be changed while the listing is active.',
      statusCode: 409,
    });
  }
  if (context.moderationVisibility !== ModerationVisibility.VISIBLE) throw listingNotFound();
  return context;
};

const imageLimitError = () =>
  new AppError({
    code: 'MARKETPLACE_IMAGE_LIMIT_REACHED',
    message: `A listing can contain at most ${MAX_MARKETPLACE_IMAGES} images.`,
    statusCode: 409,
  });

const storageError = () =>
  new AppError({
    code: 'MEDIA_STORAGE_UNAVAILABLE',
    expose: true,
    message: 'Image storage is temporarily unavailable. Please try again.',
    statusCode: 502,
  });

const withStorageError = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw storageError();
  }
};

const bestEffortDelete = async (storage: StorageService, objectKey: string): Promise<void> => {
  try {
    await storage.deleteObject(objectKey);
  } catch {
    console.error('Marketplace media object cleanup failed.');
  }
};

const expectedObjectKey = (
  userId: string,
  listingId: string,
  mediaId: string,
  contentType: MarketplaceImageContentType,
): string => `marketplace/${userId}/${listingId}/${mediaId}.${canonicalExtension(contentType)}`;

const expectedPendingObjectKey = (
  userId: string,
  listingId: string,
  mediaId: string,
  contentType: MarketplaceImageContentType,
): string =>
  `marketplace-pending/${userId}/${listingId}/${mediaId}.${canonicalExtension(contentType)}`;

const readOriginalName = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 && decoded.length <= 255 ? decoded : null;
  } catch {
    return null;
  }
};

export const createMarketplaceMediaService = (
  repository: MarketplaceMediaRepository = marketplaceMediaRepository,
  storage: StorageService = s3StorageService,
): MarketplaceMediaService => ({
  authorizeUpload: async (userId, listingId, input) => {
    const context = assertEditableOwner(await repository.getListingContext(listingId), userId);
    if (context.imageCount >= MAX_MARKETPLACE_IMAGES) throw imageLimitError();
    const mediaId = randomUUID();
    const contentType = input.contentType as MarketplaceImageContentType;
    const objectKey = expectedPendingObjectKey(userId, listingId, mediaId, contentType);
    const authorization = await withStorageError(() =>
      storage.createUploadAuthorization({
        contentType,
        expectedSize: input.size,
        listingId,
        mediaId,
        objectKey,
        originalName: input.fileName,
        uploaderId: userId,
      }),
    );
    return { ...authorization, mediaId };
  },

  completeUpload: async (userId, listingId, mediaId, input) => {
    const context = assertEditableOwner(await repository.getListingContext(listingId), userId);
    const keyPattern = new RegExp(
      `^marketplace-pending/${userId}/${listingId}/${mediaId}\\.(jpg|png|webp)$`,
    );
    if (!keyPattern.test(input.objectKey)) {
      throw new AppError({
        code: 'INVALID_MEDIA_OBJECT_KEY',
        message: 'The uploaded object key does not match this authorization.',
        statusCode: 400,
      });
    }
    const existing = await repository.findLinkedMedia(listingId, mediaId);
    if (existing !== null) {
      if (existing.uploadedById !== userId) throw listingNotFound();
      return toMediaView(existing);
    }
    if (context.imageCount >= MAX_MARKETPLACE_IMAGES) {
      await bestEffortDelete(storage, input.objectKey);
      throw imageLimitError();
    }
    const object = await withStorageError(() => storage.headObject(input.objectKey));
    if (object === null) {
      throw new AppError({
        code: 'MEDIA_OBJECT_NOT_FOUND',
        message: 'The uploaded image was not found. Upload it before completing.',
        statusCode: 409,
      });
    }
    const contentType = object.contentType;
    const originalName = readOriginalName(object.metadata['original-name']);
    const expectedSize = Number(object.metadata['expected-size']);
    const metadataMatches =
      isMarketplaceContentType(contentType) &&
      input.objectKey === expectedPendingObjectKey(userId, listingId, mediaId, contentType) &&
      object.metadata['listing-id'] === listingId &&
      object.metadata['media-id'] === mediaId &&
      object.metadata['uploader-id'] === userId &&
      Number.isInteger(expectedSize) &&
      expectedSize > 0 &&
      expectedSize <= MAX_MARKETPLACE_IMAGE_SIZE &&
      object.byteSize === expectedSize &&
      originalName !== null &&
      (marketplaceImageExtensions[contentType] as readonly string[]).some((extension) =>
        originalName.toLowerCase().endsWith(`.${extension}`),
      );
    if (!metadataMatches || !isMarketplaceContentType(contentType) || originalName === null) {
      await bestEffortDelete(storage, input.objectKey);
      throw new AppError({
        code: 'MEDIA_UPLOAD_VERIFICATION_FAILED',
        message: 'The uploaded image does not match its authorization.',
        statusCode: 400,
      });
    }

    const finalObjectKey = expectedObjectKey(userId, listingId, mediaId, contentType);
    try {
      await withStorageError(() => storage.promoteObject(input.objectKey, finalObjectKey));
      const result = await repository.finalizeMedia(
        {
          byteSize: object.byteSize,
          contentType,
          listingId,
          mediaId,
          objectKey: finalObjectKey,
          originalName,
          uploaderId: userId,
        },
        MAX_MARKETPLACE_IMAGES,
      );
      if (result.kind === 'limit') throw imageLimitError();
      if (result.kind === 'listing-unavailable') throw listingNotFound();
      return toMediaView(result.media);
    } catch (error) {
      await bestEffortDelete(storage, input.objectKey);
      // Do not delete the immutable key here: a concurrent completion may have
      // committed it successfully. Unlinked final objects are reconciled out of band.
      throw error;
    }
  },

  deleteMedia: async (userId, listingId, mediaId) => {
    assertEditableOwner(await repository.getListingContext(listingId), userId);
    const media = await repository.findLinkedMedia(listingId, mediaId);
    if (media === null || media.uploadedById !== userId) {
      throw new AppError({
        code: 'LISTING_MEDIA_NOT_FOUND',
        message: 'The listing image was not found.',
        statusCode: 404,
      });
    }
    const removed = await repository.deleteLinkedMedia(listingId, mediaId);
    if (removed === null) throw listingNotFound();
    await bestEffortDelete(storage, removed.objectKey);
  },

  reorderMedia: async (userId, listingId, mediaIds) => {
    assertEditableOwner(await repository.getListingContext(listingId), userId);
    if (!(await repository.reorder(listingId, mediaIds))) {
      throw new AppError({
        code: 'INVALID_LISTING_MEDIA_ORDER',
        message: 'The media order must contain every image exactly once.',
        statusCode: 400,
      });
    }
    return (await repository.listLinkedMedia(listingId)).map(toMediaView);
  },
});

export const marketplaceMediaService = createMarketplaceMediaService();
