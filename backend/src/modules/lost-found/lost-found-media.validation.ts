import { ValidationError } from '../../errors/app-error.js';
import {
  canonicalExtension,
  isMarketplaceContentType,
  marketplaceImageExtensions,
  MAX_MARKETPLACE_IMAGE_SIZE,
  type MarketplaceImageContentType,
} from '../marketplace/marketplace-media.validation.js';
import type {
  LostFoundMediaCompletionRequest,
  LostFoundMediaUploadRequest,
} from './lost-found.types.js';

export const MAX_LOST_FOUND_IMAGES = 4;
export const MAX_LOST_FOUND_IMAGE_SIZE = MAX_MARKETPLACE_IMAGE_SIZE;
export { canonicalExtension, isMarketplaceContentType, marketplaceImageExtensions };
export type LostFoundImageContentType = MarketplaceImageContentType;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid Lost & Found image request.', [{ field, message }]);
};
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail('body', 'Expected a JSON object.');
  return value as Record<string, unknown>;
};
const rejectUnknown = (input: Record<string, unknown>, allowed: readonly string[]): void => {
  const field = Object.keys(input).find((key) => !allowed.includes(key));
  if (field !== undefined) fail(field, 'This field is not supported.');
};

export const parseLostFoundMediaId = (field: string, value: unknown): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) fail(field, 'Expected a UUID.');
  return value as string;
};

export const parseLostFoundMediaUpload = (body: unknown): LostFoundMediaUploadRequest => {
  const input = object(body);
  rejectUnknown(input, ['contentType', 'fileName', 'size']);
  if (
    typeof input.fileName !== 'string' ||
    input.fileName.trim().length < 1 ||
    input.fileName.trim().length > 255 ||
    input.fileName.includes('/') ||
    input.fileName.includes('\\')
  )
    fail('fileName', 'Use a filename between 1 and 255 characters without path separators.');
  if (typeof input.contentType !== 'string' || !isMarketplaceContentType(input.contentType))
    fail('contentType', 'Only JPEG, PNG, and WebP images are supported.');
  const contentType = input.contentType as LostFoundImageContentType;
  const fileName = input.fileName as string;
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  if (!(marketplaceImageExtensions[contentType] as readonly string[]).includes(extension))
    fail('fileName', `The file extension must match ${contentType}.`);
  if (
    !Number.isInteger(input.size) ||
    (input.size as number) < 1 ||
    (input.size as number) > MAX_LOST_FOUND_IMAGE_SIZE
  )
    fail('size', `Image size must be between 1 byte and ${MAX_LOST_FOUND_IMAGE_SIZE} bytes.`);
  return { contentType, fileName: fileName.trim(), size: input.size as number };
};

export const parseLostFoundMediaCompletion = (body: unknown): LostFoundMediaCompletionRequest => {
  const input = object(body);
  rejectUnknown(input, ['objectKey']);
  if (
    typeof input.objectKey !== 'string' ||
    input.objectKey.length < 1 ||
    input.objectKey.length > 1024
  )
    fail('objectKey', 'A valid backend-issued object key is required.');
  return { objectKey: input.objectKey as string };
};

export const parseLostFoundMediaOrder = (body: unknown): readonly string[] => {
  const input = object(body);
  rejectUnknown(input, ['mediaIds']);
  if (!Array.isArray(input.mediaIds) || input.mediaIds.length > MAX_LOST_FOUND_IMAGES)
    fail('mediaIds', `Provide no more than ${MAX_LOST_FOUND_IMAGES} media IDs.`);
  const ids = (input.mediaIds as unknown[]).map((id: unknown) =>
    parseLostFoundMediaId('mediaIds', id),
  );
  if (new Set(ids).size !== ids.length) fail('mediaIds', 'Media IDs must be unique.');
  return ids;
};
