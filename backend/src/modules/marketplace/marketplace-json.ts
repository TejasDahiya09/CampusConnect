import type { Prisma } from '../../generated/prisma/client.js';

export interface MarketplaceImageMetadata {
  readonly height: number | null;
  readonly id: string;
  readonly key: string;
  readonly mimeType: string;
  readonly originalName: string | null;
  readonly position: number;
  readonly primary: boolean;
  readonly size: number;
  readonly uploadedById: string;
  readonly url: string | null;
  readonly width: number | null;
}

const isObject = (value: Prisma.JsonValue): value is Record<string, Prisma.JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: Prisma.JsonValue | undefined): string | null =>
  typeof value === 'string' ? value : null;
const number = (value: Prisma.JsonValue | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const parseMarketplaceImages = (value: Prisma.JsonValue): MarketplaceImageMetadata[] => {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry) => {
      if (!isObject(entry)) return [];
      const id = text(entry.id);
      const key = text(entry.key);
      const mimeType = text(entry.mimeType);
      const uploadedById = text(entry.uploadedById);
      if (id === null || key === null || mimeType === null || uploadedById === null) return [];
      return [
        {
          height: number(entry.height),
          id,
          key,
          mimeType,
          originalName: text(entry.originalName),
          position: number(entry.position) ?? 0,
          primary: entry.primary === true,
          size: number(entry.size) ?? 0,
          uploadedById,
          url: text(entry.url),
          width: number(entry.width),
        },
      ];
    })
    .sort((left, right) => left.position - right.position);
};

export const parseBookmarkIds = (value: Prisma.JsonValue): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))]
    : [];

export const normalizeMarketplaceImages = (
  images: readonly MarketplaceImageMetadata[],
): MarketplaceImageMetadata[] =>
  images.map((image, position) => ({ ...image, position, primary: position === 0 }));

export const marketplaceImagesToJson = (
  images: readonly MarketplaceImageMetadata[],
): Prisma.InputJsonArray =>
  images.map((image) => ({
    height: image.height,
    id: image.id,
    key: image.key,
    mimeType: image.mimeType,
    originalName: image.originalName,
    position: image.position,
    primary: image.primary,
    size: image.size,
    uploadedById: image.uploadedById,
    url: image.url,
    width: image.width,
  }));
