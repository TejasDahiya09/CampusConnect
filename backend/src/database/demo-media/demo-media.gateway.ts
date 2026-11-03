import { prisma } from '../prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { parseLostFoundImages } from '../../modules/lost-found/lost-found-json.js';
import { lostFoundMediaService } from '../../modules/lost-found/lost-found-media.service.js';
import { MAX_LOST_FOUND_IMAGE_SIZE } from '../../modules/lost-found/lost-found-media.validation.js';
import { parseMarketplaceImages } from '../../modules/marketplace/marketplace-json.js';
import { marketplaceMediaService } from '../../modules/marketplace/marketplace-media.service.js';
import { isMarketplaceContentType } from '../../modules/marketplace/marketplace-media.validation.js';
import { s3StorageService } from '../../services/storage/s3-storage.service.js';
import type {
  DemoMediaAsset,
  DemoMediaGateway,
  DemoMediaRecord,
  DownloadedDemoAsset,
} from './demo-media.types.js';

const download = async (asset: DemoMediaAsset): Promise<DownloadedDemoAsset> => {
  const response = await fetch(asset.sourceUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Image source failed for ${asset.fileName} with HTTP ${response.status}.`);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
  if (!isMarketplaceContentType(contentType))
    throw new Error(`Image source returned an unsupported MIME type for ${asset.fileName}.`);
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_LOST_FOUND_IMAGE_SIZE)
    throw new Error(`Image source exceeds 5 MiB for ${asset.fileName}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_LOST_FOUND_IMAGE_SIZE)
    throw new Error(`Downloaded image size is invalid for ${asset.fileName}.`);
  return { bytes, contentType };
};

const mediaNames = (asset: DemoMediaAsset, images: Prisma.JsonValue): readonly string[] =>
  asset.module === 'MARKETPLACE'
    ? parseMarketplaceImages(images).flatMap(({ originalName }) => originalName ?? [])
    : parseLostFoundImages(images).flatMap(({ originalName }) => originalName ?? []);

export const prismaDemoMediaGateway: DemoMediaGateway = {
  authorize: async (asset, ownerId, file) => {
    const input = {
      contentType: file.contentType,
      fileName: asset.fileName,
      size: file.bytes.byteLength,
    };
    return asset.module === 'MARKETPLACE'
      ? marketplaceMediaService.authorizeUpload(ownerId, asset.recordId, input)
      : lostFoundMediaService.authorizeUpload(ownerId, asset.recordId, input);
  },
  complete: async (asset, ownerId, authorization) => {
    const input = { objectKey: authorization.objectKey };
    if (asset.module === 'MARKETPLACE') {
      await marketplaceMediaService.completeUpload(
        ownerId,
        asset.recordId,
        authorization.mediaId,
        input,
      );
    } else {
      await lostFoundMediaService.completeUpload(
        ownerId,
        asset.recordId,
        authorization.mediaId,
        input,
      );
    }
  },
  deleteObject: (objectKey) => s3StorageService.deleteObject(objectKey),
  download,
  findRecords: async (assets) => {
    const marketplaceIds = assets
      .filter(({ module }) => module === 'MARKETPLACE')
      .map(({ recordId }) => recordId);
    const lostFoundIds = assets
      .filter(({ module }) => module === 'LOST_FOUND')
      .map(({ recordId }) => recordId);
    const [marketplace, lostFound] = await Promise.all([
      prisma.marketplace.findMany({
        select: { description: true, id: true, images: true, sellerId: true, title: true },
        where: { id: { in: marketplaceIds } },
      }),
      prisma.lostFound.findMany({
        select: { description: true, id: true, images: true, reporterId: true, title: true },
        where: { id: { in: lostFoundIds } },
      }),
    ]);
    const records = new Map<string, DemoMediaRecord>();
    for (const row of marketplace)
      records.set(row.id, {
        description: row.description ?? '',
        existingFileNames: parseMarketplaceImages(row.images).flatMap(
          ({ originalName }) => originalName ?? [],
        ),
        id: row.id,
        ownerId: row.sellerId,
        title: row.title,
      });
    for (const row of lostFound)
      records.set(row.id, {
        description: row.description,
        existingFileNames: parseLostFoundImages(row.images).flatMap(
          ({ originalName }) => originalName ?? [],
        ),
        id: row.id,
        ownerId: row.reporterId,
        title: row.title,
      });
    return records;
  },
  hasAssociation: async (asset) => {
    const row =
      asset.module === 'MARKETPLACE'
        ? await prisma.marketplace.findUnique({
            select: { images: true },
            where: { id: asset.recordId },
          })
        : await prisma.lostFound.findUnique({
            select: { images: true },
            where: { id: asset.recordId },
          });
    return row !== null && mediaNames(asset, row.images).includes(asset.fileName);
  },
  upload: async (authorization, file) => {
    const response = await fetch(authorization.uploadUrl, {
      body: Buffer.from(file.bytes),
      headers: authorization.requiredHeaders,
      method: 'PUT',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`S3 upload failed with HTTP ${response.status}.`);
  },
};
