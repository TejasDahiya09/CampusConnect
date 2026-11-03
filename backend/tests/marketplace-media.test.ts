import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ListingStatus } from '../src/generated/prisma/client.js';
import type {
  FinalizeMediaInput,
  MarketplaceMediaRepository,
} from '../src/modules/marketplace/marketplace-media.repository.js';
import { createMarketplaceMediaService } from '../src/modules/marketplace/marketplace-media.service.js';
import {
  MAX_MARKETPLACE_IMAGE_SIZE,
  parseMediaOrder,
  parseMediaUploadRequest,
} from '../src/modules/marketplace/marketplace-media.validation.js';
import type { MarketplaceMediaRecord } from '../src/modules/marketplace/marketplace.types.js';
import type {
  CreateUploadAuthorizationInput,
  StorageService,
  StoredObjectMetadata,
} from '../src/services/storage/storage.types.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const listingId = '33333333-3333-4333-8333-333333333333';
const mediaId = '44444444-4444-4444-8444-444444444444';
const secondMediaId = '55555555-5555-4555-8555-555555555555';
const objectKey = `marketplace-pending/${ownerId}/${listingId}/${mediaId}.jpg`;
const finalObjectKey = `marketplace/${ownerId}/${listingId}/${mediaId}.jpg`;

const media = (overrides: Partial<MarketplaceMediaRecord> = {}): MarketplaceMediaRecord => ({
  height: null,
  id: mediaId,
  mimeType: 'image/jpeg',
  objectKey: finalObjectKey,
  originalName: 'camera.jpg',
  sortOrder: 0,
  uploadedById: ownerId,
  url: `https://cdn.example.com/${finalObjectKey}`,
  width: null,
  ...overrides,
});

const objectMetadata = (overrides: Partial<StoredObjectMetadata> = {}): StoredObjectMetadata => ({
  byteSize: 1024,
  contentType: 'image/jpeg',
  metadata: {
    'expected-size': '1024',
    'listing-id': listingId,
    'media-id': mediaId,
    'original-name': 'camera.jpg',
    'uploader-id': ownerId,
  },
  ...overrides,
});

const createRepository = (
  overrides: Partial<MarketplaceMediaRepository> = {},
): MarketplaceMediaRepository => ({
  deleteLinkedMedia: () => Promise.resolve(media()),
  finalizeMedia: () => Promise.resolve({ kind: 'created', media: media() }),
  findLinkedMedia: () => Promise.resolve(null),
  getListingContext: () =>
    Promise.resolve({
      imageCount: 0,
      moderationVisibility: 'VISIBLE',
      sellerId: ownerId,
      status: ListingStatus.ACTIVE,
    }),
  listLinkedMedia: () => Promise.resolve([media()]),
  reorder: () => Promise.resolve(true),
  ...overrides,
});

const createStorage = (overrides: Partial<StorageService> = {}): StorageService => ({
  createUploadAuthorization: (input) =>
    Promise.resolve({
      expiresAt: '2026-09-02T00:05:00.000Z',
      objectKey: input.objectKey,
      requiredHeaders: { 'content-type': input.contentType },
      uploadUrl: 'https://private-bucket.s3.example/presigned',
    }),
  deleteObject: () => Promise.resolve(),
  getDeliveryUrl: (key) => `https://cdn.example.com/${key}`,
  headObject: () => Promise.resolve(objectMetadata()),
  promoteObject: () => Promise.resolve(),
  ...overrides,
});

const expectCode = (code: string) => (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === code;

void describe('Marketplace media validation and service', () => {
  void it('rejects invalid MIME types, extensions, and oversized images', () => {
    assert.throws(
      () => parseMediaUploadRequest({ contentType: 'image/gif', fileName: 'photo.gif', size: 10 }),
      expectCode('VALIDATION_ERROR'),
    );
    assert.throws(
      () => parseMediaUploadRequest({ contentType: 'image/jpeg', fileName: 'photo.png', size: 10 }),
      expectCode('VALIDATION_ERROR'),
    );
    assert.throws(
      () =>
        parseMediaUploadRequest({
          contentType: 'image/png',
          fileName: 'photo.png',
          size: MAX_MARKETPLACE_IMAGE_SIZE + 1,
        }),
      expectCode('VALIDATION_ERROR'),
    );
  });

  void it('returns not found for a nonexistent listing', async () => {
    const service = createMarketplaceMediaService(
      createRepository({ getListingContext: () => Promise.resolve(null) }),
      createStorage(),
    );
    await assert.rejects(
      service.authorizeUpload(ownerId, listingId, {
        contentType: 'image/jpeg',
        fileName: 'photo.jpg',
        size: 1024,
      }),
      expectCode('LISTING_NOT_FOUND'),
    );
  });

  void it('forbids a non-owner and rejects sold or archived listings', async () => {
    const service = createMarketplaceMediaService(createRepository(), createStorage());
    await assert.rejects(
      service.authorizeUpload(otherId, listingId, {
        contentType: 'image/jpeg',
        fileName: 'photo.jpg',
        size: 1024,
      }),
      expectCode('LISTING_FORBIDDEN'),
    );
    for (const status of [ListingStatus.SOLD, ListingStatus.ARCHIVED]) {
      const unavailable = createMarketplaceMediaService(
        createRepository({
          getListingContext: () =>
            Promise.resolve({
              imageCount: 0,
              moderationVisibility: 'VISIBLE',
              sellerId: ownerId,
              status,
            }),
        }),
        createStorage(),
      );
      await assert.rejects(
        unavailable.authorizeUpload(ownerId, listingId, {
          contentType: 'image/jpeg',
          fileName: 'photo.jpg',
          size: 1024,
        }),
        expectCode('LISTING_MEDIA_NOT_EDITABLE'),
      );
    }
  });

  void it('rejects a seventh image', async () => {
    const service = createMarketplaceMediaService(
      createRepository({
        getListingContext: () =>
          Promise.resolve({
            imageCount: 6,
            moderationVisibility: 'VISIBLE',
            sellerId: ownerId,
            status: ListingStatus.ACTIVE,
          }),
      }),
      createStorage(),
    );
    await assert.rejects(
      service.authorizeUpload(ownerId, listingId, {
        contentType: 'image/webp',
        fileName: 'photo.webp',
        size: 1024,
      }),
      expectCode('MARKETPLACE_IMAGE_LIMIT_REACHED'),
    );
  });

  void it('generates a secure key and a short-lived credential-free authorization response', async () => {
    let input: CreateUploadAuthorizationInput | undefined;
    const service = createMarketplaceMediaService(
      createRepository(),
      createStorage({
        createUploadAuthorization: (value) => {
          input = value;
          return Promise.resolve({
            expiresAt: '2026-09-02T00:05:00.000Z',
            objectKey: value.objectKey,
            requiredHeaders: { 'content-type': value.contentType },
            uploadUrl: 'https://s3.example/presigned?signature=temporary',
          });
        },
      }),
    );
    const result = await service.authorizeUpload(ownerId, listingId, {
      contentType: 'image/png',
      fileName: 'campus.png',
      size: 1024,
    });
    assert.match(
      result.objectKey,
      new RegExp(`^marketplace-pending/${ownerId}/${listingId}/[0-9a-f-]+\\.png$`),
    );
    assert.equal(input?.uploaderId, ownerId);
    assert.equal('accessKeyId' in result, false);
    assert.equal('secretAccessKey' in result, false);
  });

  void it('verifies S3 metadata before finalizing the database media record', async () => {
    let finalized: FinalizeMediaInput | undefined;
    const service = createMarketplaceMediaService(
      createRepository({
        finalizeMedia: (input) => {
          finalized = input;
          return Promise.resolve({ kind: 'created', media: media() });
        },
      }),
      createStorage(),
    );
    const result = await service.completeUpload(ownerId, listingId, mediaId, { objectKey });
    assert.equal(result.id, mediaId);
    assert.equal(finalized?.objectKey, finalObjectKey);
    assert.equal(finalized?.byteSize, 1024);
  });

  void it('does not delete a promoted final key when database finalization fails', async () => {
    const deletedKeys: string[] = [];
    const service = createMarketplaceMediaService(
      createRepository({
        finalizeMedia: () => Promise.reject(new Error('database unavailable')),
      }),
      createStorage({
        deleteObject: (key) => {
          deletedKeys.push(key);
          return Promise.resolve();
        },
      }),
    );

    await assert.rejects(
      service.completeUpload(ownerId, listingId, mediaId, { objectKey }),
      /database unavailable/,
    );
    assert.deepEqual(deletedKeys, [objectKey]);
    assert.equal(deletedKeys.includes(finalObjectKey), false);
  });

  void it('rejects a nonexistent object and mismatched object metadata', async () => {
    const missing = createMarketplaceMediaService(
      createRepository(),
      createStorage({ headObject: () => Promise.resolve(null) }),
    );
    await assert.rejects(
      missing.completeUpload(ownerId, listingId, mediaId, { objectKey }),
      expectCode('MEDIA_OBJECT_NOT_FOUND'),
    );
    const mismatch = createMarketplaceMediaService(
      createRepository(),
      createStorage({
        headObject: () =>
          Promise.resolve(
            objectMetadata({ metadata: { ...objectMetadata().metadata, 'uploader-id': otherId } }),
          ),
      }),
    );
    await assert.rejects(
      mismatch.completeUpload(ownerId, listingId, mediaId, { objectKey }),
      expectCode('MEDIA_UPLOAD_VERIFICATION_FAILED'),
    );
  });

  void it('deletes linked media and its S3 object while rejecting a non-owner', async () => {
    let deletedKey: string | undefined;
    const service = createMarketplaceMediaService(
      createRepository({ findLinkedMedia: () => Promise.resolve(media()) }),
      createStorage({
        deleteObject: (key) => {
          deletedKey = key;
          return Promise.resolve();
        },
      }),
    );
    await service.deleteMedia(ownerId, listingId, mediaId);
    assert.equal(deletedKey, finalObjectKey);
    await assert.rejects(
      service.deleteMedia(otherId, listingId, mediaId),
      expectCode('LISTING_FORBIDDEN'),
    );
  });

  void it('uses exact ordering with the first image as primary', async () => {
    const ordered = [
      media({
        id: secondMediaId,
        objectKey: `marketplace/${ownerId}/${listingId}/${secondMediaId}.jpg`,
        sortOrder: 0,
      }),
      media({ sortOrder: 1 }),
    ];
    let received: readonly string[] = [];
    const service = createMarketplaceMediaService(
      createRepository({
        listLinkedMedia: () => Promise.resolve(ordered),
        reorder: (_listingId, mediaIds) => {
          received = mediaIds;
          return Promise.resolve(true);
        },
      }),
      createStorage(),
    );
    const result = await service.reorderMedia(ownerId, listingId, [secondMediaId, mediaId]);
    assert.deepEqual(received, [secondMediaId, mediaId]);
    assert.equal(result[0]?.id, secondMediaId);
    assert.equal(parseMediaOrder({ mediaIds: [secondMediaId, mediaId] })[0], secondMediaId);
  });

  void it('translates AWS failures without leaking provider details', async () => {
    const service = createMarketplaceMediaService(
      createRepository(),
      createStorage({
        createUploadAuthorization: () => Promise.reject(new Error('secret provider response')),
      }),
    );
    await assert.rejects(
      service.authorizeUpload(ownerId, listingId, {
        contentType: 'image/jpeg',
        fileName: 'photo.jpg',
        size: 1024,
      }),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'MEDIA_STORAGE_UNAVAILABLE' &&
        !error.message.includes('secret provider response'),
    );
  });

  void it('makes completion retries idempotent and returns no internal media fields', async () => {
    let headCalled = false;
    const service = createMarketplaceMediaService(
      createRepository({ findLinkedMedia: () => Promise.resolve(media()) }),
      createStorage({
        headObject: () => {
          headCalled = true;
          return Promise.resolve(objectMetadata());
        },
      }),
    );
    const view = await service.completeUpload(ownerId, listingId, mediaId, { objectKey });
    assert.equal(headCalled, false);
    assert.equal('objectKey' in view, false);
    assert.equal('uploadedById' in view, false);
    assert.equal(view.url?.startsWith('https://cdn.example.com/'), true);
  });
});
