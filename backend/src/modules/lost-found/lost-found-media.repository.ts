import { prisma } from '../../database/prisma.js';
import {
  LostFoundStatus,
  ModerationVisibility,
  Prisma,
  type ModerationVisibility as ModerationVisibilityValue,
  type LostFoundStatus as Status,
} from '../../generated/prisma/client.js';
import { getCloudFrontDeliveryUrl } from '../../services/storage/cloudfront-url.js';
import {
  lostFoundImagesToJson,
  normalizeLostFoundImages,
  parseLostFoundImages,
} from './lost-found-json.js';
import type { LostFoundImage } from './lost-found.types.js';

export interface LostFoundMediaContext {
  readonly imageCount: number;
  readonly moderationVisibility: ModerationVisibilityValue;
  readonly reporterId: string;
  readonly status: Status;
}
export interface FinalizeLostFoundMediaInput {
  readonly byteSize: number;
  readonly contentType: string;
  readonly mediaId: string;
  readonly objectKey: string;
  readonly originalName: string;
  readonly reportId: string;
  readonly uploaderId: string;
}
export type FinalizeLostFoundMediaResult =
  | { readonly kind: 'created'; readonly media: LostFoundImage }
  | { readonly kind: 'limit' }
  | { readonly kind: 'report-unavailable' };
export interface LostFoundMediaRepository {
  deleteLinkedMedia(reportId: string, mediaId: string): Promise<LostFoundImage | null>;
  finalizeMedia(
    input: FinalizeLostFoundMediaInput,
    maximum: number,
  ): Promise<FinalizeLostFoundMediaResult>;
  findLinkedMedia(reportId: string, mediaId: string): Promise<LostFoundImage | null>;
  getReportContext(reportId: string): Promise<LostFoundMediaContext | null>;
  listLinkedMedia(reportId: string): Promise<readonly LostFoundImage[]>;
  reorder(reportId: string, mediaIds: readonly string[]): Promise<boolean>;
}
const editable = (status: Status) =>
  status === LostFoundStatus.OPEN || status === LostFoundStatus.MATCHED;
const withUrl = (image: LostFoundImage): LostFoundImage => ({
  ...image,
  url: getCloudFrontDeliveryUrl(image.key),
});

export const lostFoundMediaRepository: LostFoundMediaRepository = {
  deleteLinkedMedia: (reportId, mediaId) =>
    prisma.$transaction(
      async (tx) => {
        const report = await tx.lostFound.findUnique({
          select: { images: true },
          where: { id: reportId },
        });
        if (!report) return null;
        const images = parseLostFoundImages(report.images);
        const removed = images.find(({ id }) => id === mediaId);
        if (!removed) return null;
        await tx.lostFound.update({
          data: {
            images: lostFoundImagesToJson(
              normalizeLostFoundImages(images.filter(({ id }) => id !== mediaId)),
            ),
          },
          where: { id: reportId },
        });
        return withUrl(removed);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  finalizeMedia: (input, maximum) =>
    prisma.$transaction(
      async (tx) => {
        const report = await tx.lostFound.findUnique({
          select: { images: true, moderationVisibility: true, reporterId: true, status: true },
          where: { id: input.reportId },
        });
        if (
          !report ||
          report.moderationVisibility !== ModerationVisibility.VISIBLE ||
          report.reporterId !== input.uploaderId ||
          !editable(report.status)
        )
          return { kind: 'report-unavailable' } as const;
        const images = parseLostFoundImages(report.images);
        const existing = images.find(({ id }) => id === input.mediaId);
        if (existing) return { kind: 'created', media: withUrl(existing) } as const;
        if (images.length >= maximum) return { kind: 'limit' } as const;
        const image: LostFoundImage = {
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
        await tx.lostFound.update({
          data: { images: lostFoundImagesToJson([...images, image]) },
          where: { id: input.reportId },
        });
        return { kind: 'created', media: image } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  findLinkedMedia: async (reportId, mediaId) => {
    const report = await prisma.lostFound.findUnique({
      select: { images: true },
      where: { id: reportId },
    });
    const image = report
      ? parseLostFoundImages(report.images).find(({ id }) => id === mediaId)
      : undefined;
    return image ? withUrl(image) : null;
  },
  getReportContext: async (reportId) => {
    const report = await prisma.lostFound.findUnique({
      select: { images: true, moderationVisibility: true, reporterId: true, status: true },
      where: { id: reportId },
    });
    return report
      ? {
          imageCount: parseLostFoundImages(report.images).length,
          moderationVisibility: report.moderationVisibility,
          reporterId: report.reporterId,
          status: report.status,
        }
      : null;
  },
  listLinkedMedia: async (reportId) => {
    const report = await prisma.lostFound.findUnique({
      select: { images: true },
      where: { id: reportId },
    });
    return report ? parseLostFoundImages(report.images).map(withUrl) : [];
  },
  reorder: (reportId, mediaIds) =>
    prisma.$transaction(
      async (tx) => {
        const report = await tx.lostFound.findUnique({
          select: { images: true },
          where: { id: reportId },
        });
        if (!report) return false;
        const images = parseLostFoundImages(report.images);
        if (
          images.length !== mediaIds.length ||
          new Set(mediaIds).size !== mediaIds.length ||
          images.some(({ id }) => !mediaIds.includes(id))
        )
          return false;
        const byId = new Map(images.map((image) => [image.id, image]));
        const ordered = mediaIds
          .map((id) => byId.get(id))
          .filter((image): image is LostFoundImage => image !== undefined);
        await tx.lostFound.update({
          data: { images: lostFoundImagesToJson(normalizeLostFoundImages(ordered)) },
          where: { id: reportId },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
};
