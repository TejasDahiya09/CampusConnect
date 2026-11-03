import { ValidationError } from '../../errors/app-error.js';
import type { MediaCompletionRequest, MediaUploadRequest } from './marketplace.types.js';

export const MAX_MARKETPLACE_IMAGES = 6;
export const MAX_MARKETPLACE_IMAGE_SIZE = 5 * 1024 * 1024;

export const marketplaceImageExtensions = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
} as const;

export type MarketplaceImageContentType = keyof typeof marketplaceImageExtensions;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid marketplace image request.', [{ field, message }]);
};

const requireObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('body', 'Expected a JSON object.');
  }
  return value as Record<string, unknown>;
};

const rejectUnknownFields = (input: Record<string, unknown>, allowed: readonly string[]): void => {
  const unknown = Object.keys(input).find((field) => !allowed.includes(field));
  if (unknown !== undefined) fail(unknown, 'This field is not supported.');
};

export const parseMediaId = (field: string, value: unknown): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) fail(field, 'Expected a UUID.');
  return value as string;
};

const getExtension = (fileName: string): string => {
  const separator = fileName.lastIndexOf('.');
  return separator < 1 ? '' : fileName.slice(separator + 1).toLowerCase();
};

export const canonicalExtension = (contentType: MarketplaceImageContentType): string =>
  contentType === 'image/jpeg' ? 'jpg' : marketplaceImageExtensions[contentType][0];

export const isMarketplaceContentType = (
  value: string | undefined,
): value is MarketplaceImageContentType =>
  value !== undefined && Object.hasOwn(marketplaceImageExtensions, value);

export const parseMediaUploadRequest = (body: unknown): MediaUploadRequest => {
  const input = requireObject(body);
  rejectUnknownFields(input, ['contentType', 'fileName', 'size']);
  const fileName = input.fileName;
  const contentType = input.contentType;
  const size = input.size;

  if (
    typeof fileName !== 'string' ||
    fileName.trim().length < 1 ||
    fileName.trim().length > 255 ||
    fileName.includes('/') ||
    fileName.includes('\\') ||
    Array.from(fileName).some((character) => character.charCodeAt(0) < 32)
  ) {
    fail('fileName', 'Use a filename between 1 and 255 characters without path separators.');
  }
  if (typeof contentType !== 'string' || !isMarketplaceContentType(contentType)) {
    fail('contentType', 'Only JPEG, PNG, and WebP images are supported.');
  }
  const safeFileName = fileName as string;
  const safeContentType = contentType as MarketplaceImageContentType;
  const extension = getExtension(safeFileName);
  if (!(marketplaceImageExtensions[safeContentType] as readonly string[]).includes(extension)) {
    fail('fileName', `The file extension must match ${safeContentType}.`);
  }
  if (
    !Number.isInteger(size) ||
    (size as number) < 1 ||
    (size as number) > MAX_MARKETPLACE_IMAGE_SIZE
  ) {
    fail('size', `Image size must be between 1 byte and ${MAX_MARKETPLACE_IMAGE_SIZE} bytes.`);
  }

  return {
    contentType: safeContentType,
    fileName: safeFileName.trim(),
    size: size as number,
  };
};

export const parseMediaCompletionRequest = (body: unknown): MediaCompletionRequest => {
  const input = requireObject(body);
  rejectUnknownFields(input, ['objectKey']);
  if (
    typeof input.objectKey !== 'string' ||
    input.objectKey.length < 1 ||
    input.objectKey.length > 1024
  ) {
    fail('objectKey', 'A valid backend-issued object key is required.');
  }
  return { objectKey: input.objectKey as string };
};

export const parseMediaOrder = (body: unknown): readonly string[] => {
  const input = requireObject(body);
  rejectUnknownFields(input, ['mediaIds']);
  if (!Array.isArray(input.mediaIds) || input.mediaIds.length > MAX_MARKETPLACE_IMAGES) {
    fail('mediaIds', `Provide an array containing no more than ${MAX_MARKETPLACE_IMAGES} IDs.`);
  }
  const mediaIds = (input.mediaIds as unknown[]).map((value: unknown) =>
    parseMediaId('mediaIds', value),
  );
  if (new Set(mediaIds).size !== mediaIds.length) fail('mediaIds', 'Media IDs must be unique.');
  return mediaIds;
};
