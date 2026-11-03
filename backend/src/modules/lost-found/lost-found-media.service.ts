import { randomUUID } from 'node:crypto';
import { AppError } from '../../errors/app-error.js';
import { LostFoundStatus, ModerationVisibility } from '../../generated/prisma/client.js';
import { s3StorageService } from '../../services/storage/s3-storage.service.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import {
  lostFoundMediaRepository,
  type LostFoundMediaContext,
  type LostFoundMediaRepository,
} from './lost-found-media.repository.js';
import {
  canonicalExtension,
  isMarketplaceContentType,
  marketplaceImageExtensions,
  MAX_LOST_FOUND_IMAGES,
  MAX_LOST_FOUND_IMAGE_SIZE,
  type LostFoundImageContentType,
} from './lost-found-media.validation.js';
import type {
  LostFoundImage,
  LostFoundMediaCompletionRequest,
  LostFoundMediaUploadRequest,
} from './lost-found.types.js';

export interface LostFoundUploadAuthorization {
  readonly expiresAt: string;
  readonly mediaId: string;
  readonly objectKey: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly uploadUrl: string;
}
export interface LostFoundMediaService {
  authorizeUpload(
    userId: string,
    reportId: string,
    input: LostFoundMediaUploadRequest,
  ): Promise<LostFoundUploadAuthorization>;
  completeUpload(
    userId: string,
    reportId: string,
    mediaId: string,
    input: LostFoundMediaCompletionRequest,
  ): Promise<LostFoundImage>;
  deleteMedia(userId: string, reportId: string, mediaId: string): Promise<void>;
  reorderMedia(
    userId: string,
    reportId: string,
    mediaIds: readonly string[],
  ): Promise<readonly LostFoundImage[]>;
}
const notFound = () =>
  new AppError({
    code: 'LOST_FOUND_NOT_FOUND',
    message: 'The Lost & Found report was not found.',
    statusCode: 404,
  });
const assertOwner = (
  context: LostFoundMediaContext | null,
  userId: string,
): LostFoundMediaContext => {
  if (!context) throw notFound();
  if (context.moderationVisibility !== ModerationVisibility.VISIBLE) throw notFound();
  if (context.reporterId !== userId)
    throw new AppError({
      code: 'LOST_FOUND_FORBIDDEN',
      message: "You cannot modify another student's report media.",
      statusCode: 403,
    });
  if (context.status !== LostFoundStatus.OPEN && context.status !== LostFoundStatus.MATCHED)
    throw new AppError({
      code: 'LOST_FOUND_MEDIA_NOT_EDITABLE',
      message: 'Images can only be changed while a report is open or matched.',
      statusCode: 409,
    });
  return context;
};
const limit = () =>
  new AppError({
    code: 'LOST_FOUND_IMAGE_LIMIT_REACHED',
    message: `A report can contain at most ${MAX_LOST_FOUND_IMAGES} images.`,
    statusCode: 409,
  });
const storageFailure = () =>
  new AppError({
    code: 'MEDIA_STORAGE_UNAVAILABLE',
    expose: true,
    message: 'Image storage is temporarily unavailable. Please try again.',
    statusCode: 502,
  });
const withStorage = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw storageFailure();
  }
};
const bestEffortDelete = async (storage: StorageService, key: string) => {
  try {
    await storage.deleteObject(key);
  } catch {
    console.error('Lost & Found media object cleanup failed.');
  }
};
const pendingKey = (
  userId: string,
  reportId: string,
  mediaId: string,
  type: LostFoundImageContentType,
) => `lost-found-pending/${userId}/${reportId}/${mediaId}.${canonicalExtension(type)}`;
const finalKey = (
  userId: string,
  reportId: string,
  mediaId: string,
  type: LostFoundImageContentType,
) => `lost-found/${userId}/${reportId}/${mediaId}.${canonicalExtension(type)}`;
const originalName = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length <= 255 ? decoded : null;
  } catch {
    return null;
  }
};

export const createLostFoundMediaService = (
  repository: LostFoundMediaRepository = lostFoundMediaRepository,
  storage: StorageService = s3StorageService,
): LostFoundMediaService => ({
  authorizeUpload: async (userId, reportId, input) => {
    const context = assertOwner(await repository.getReportContext(reportId), userId);
    if (context.imageCount >= MAX_LOST_FOUND_IMAGES) throw limit();
    const mediaId = randomUUID();
    const contentType = input.contentType as LostFoundImageContentType;
    const objectKey = pendingKey(userId, reportId, mediaId, contentType);
    const authorization = await withStorage(() =>
      storage.createUploadAuthorization({
        contentType,
        expectedSize: input.size,
        listingId: reportId,
        mediaId,
        objectKey,
        originalName: input.fileName,
        uploaderId: userId,
      }),
    );
    return { ...authorization, mediaId };
  },
  completeUpload: async (userId, reportId, mediaId, input) => {
    const context = assertOwner(await repository.getReportContext(reportId), userId);
    if (
      !new RegExp(`^lost-found-pending/${userId}/${reportId}/${mediaId}\\.(jpg|png|webp)$`).test(
        input.objectKey,
      )
    )
      throw new AppError({
        code: 'INVALID_MEDIA_OBJECT_KEY',
        message: 'The uploaded object key does not match this authorization.',
        statusCode: 400,
      });
    const existing = await repository.findLinkedMedia(reportId, mediaId);
    if (existing) return existing;
    if (context.imageCount >= MAX_LOST_FOUND_IMAGES) {
      await bestEffortDelete(storage, input.objectKey);
      throw limit();
    }
    const object = await withStorage(() => storage.headObject(input.objectKey));
    if (!object)
      throw new AppError({
        code: 'MEDIA_OBJECT_NOT_FOUND',
        message: 'The uploaded image was not found. Upload it before completing.',
        statusCode: 409,
      });
    const contentType = object.contentType;
    const name = originalName(object.metadata['original-name']);
    const expectedSize = Number(object.metadata['expected-size']);
    const valid =
      isMarketplaceContentType(contentType) &&
      input.objectKey === pendingKey(userId, reportId, mediaId, contentType) &&
      object.metadata['listing-id'] === reportId &&
      object.metadata['media-id'] === mediaId &&
      object.metadata['uploader-id'] === userId &&
      Number.isInteger(expectedSize) &&
      expectedSize > 0 &&
      expectedSize <= MAX_LOST_FOUND_IMAGE_SIZE &&
      object.byteSize === expectedSize &&
      name !== null &&
      (marketplaceImageExtensions[contentType] as readonly string[]).some((extension) =>
        name.toLowerCase().endsWith(`.${extension}`),
      );
    if (!valid || !isMarketplaceContentType(contentType) || name === null) {
      await bestEffortDelete(storage, input.objectKey);
      throw new AppError({
        code: 'MEDIA_UPLOAD_VERIFICATION_FAILED',
        message: 'The uploaded image does not match its authorization.',
        statusCode: 400,
      });
    }
    const destination = finalKey(userId, reportId, mediaId, contentType);
    try {
      await withStorage(() => storage.promoteObject(input.objectKey, destination));
      const result = await repository.finalizeMedia(
        {
          byteSize: object.byteSize,
          contentType,
          mediaId,
          objectKey: destination,
          originalName: name,
          reportId,
          uploaderId: userId,
        },
        MAX_LOST_FOUND_IMAGES,
      );
      if (result.kind === 'limit') throw limit();
      if (result.kind === 'report-unavailable') throw notFound();
      return result.media;
    } catch (error) {
      await bestEffortDelete(storage, input.objectKey);
      throw error;
    }
  },
  deleteMedia: async (userId, reportId, mediaId) => {
    assertOwner(await repository.getReportContext(reportId), userId);
    const media = await repository.findLinkedMedia(reportId, mediaId);
    if (!media || media.uploadedById !== userId)
      throw new AppError({
        code: 'LOST_FOUND_MEDIA_NOT_FOUND',
        message: 'The report image was not found.',
        statusCode: 404,
      });
    const removed = await repository.deleteLinkedMedia(reportId, mediaId);
    if (!removed) throw notFound();
    await bestEffortDelete(storage, removed.key);
  },
  reorderMedia: async (userId, reportId, mediaIds) => {
    assertOwner(await repository.getReportContext(reportId), userId);
    if (!(await repository.reorder(reportId, mediaIds)))
      throw new AppError({
        code: 'INVALID_LOST_FOUND_MEDIA_ORDER',
        message: 'The media order must contain every image exactly once.',
        statusCode: 400,
      });
    return repository.listLinkedMedia(reportId);
  },
});

export const lostFoundMediaService = createLostFoundMediaService();
