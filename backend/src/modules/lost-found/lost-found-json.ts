import { ClaimStatus, type Prisma } from '../../generated/prisma/client.js';
import { getCloudFrontDeliveryUrl } from '../../services/storage/cloudfront-url.js';
import type { LostFoundClaim, LostFoundImage } from './lost-found.types.js';

const isObject = (value: Prisma.JsonValue): value is Record<string, Prisma.JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: Prisma.JsonValue | undefined): string | null =>
  typeof value === 'string' ? value : null;
const number = (value: Prisma.JsonValue | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const isClaimStatus = (value: string): value is ClaimStatus =>
  Object.values(ClaimStatus).some((status) => status === value);

export const parseStringArray = (value: Prisma.JsonValue): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))]
    : [];

export const parseLostFoundImages = (value: Prisma.JsonValue): LostFoundImage[] => {
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
          url: getCloudFrontDeliveryUrl(key),
          width: number(entry.width),
        },
      ];
    })
    .sort((left, right) => left.position - right.position);
};

export const normalizeLostFoundImages = (images: readonly LostFoundImage[]): LostFoundImage[] =>
  images.map((image, position) => ({ ...image, position, primary: position === 0 }));

export const lostFoundImagesToJson = (images: readonly LostFoundImage[]): Prisma.InputJsonArray =>
  images.map(({ url: _url, ...image }) => ({ ...image }));

export const parseLostFoundClaims = (value: Prisma.JsonValue): LostFoundClaim[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isObject(entry)) return [];
    const claimantId = text(entry.claimantId);
    const createdAt = text(entry.createdAt);
    const id = text(entry.id);
    const message = text(entry.message);
    const status = text(entry.status);
    if (
      claimantId === null ||
      createdAt === null ||
      id === null ||
      message === null ||
      status === null ||
      !isClaimStatus(status)
    )
      return [];
    return [
      {
        claimantId,
        createdAt,
        id,
        message,
        reviewedAt: text(entry.reviewedAt),
        reviewerId: text(entry.reviewerId),
        status,
      },
    ];
  });
};

export const claimsToJson = (claims: readonly LostFoundClaim[]): Prisma.InputJsonArray =>
  claims.map((claim) => ({ ...claim }));
