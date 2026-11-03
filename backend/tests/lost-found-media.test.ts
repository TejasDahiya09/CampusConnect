import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LostFoundStatus } from '../src/generated/prisma/client.js';
import type { LostFoundMediaRepository } from '../src/modules/lost-found/lost-found-media.repository.js';
import { createLostFoundMediaService } from '../src/modules/lost-found/lost-found-media.service.js';
import {
  MAX_LOST_FOUND_IMAGE_SIZE,
  parseLostFoundMediaOrder,
  parseLostFoundMediaUpload,
} from '../src/modules/lost-found/lost-found-media.validation.js';
import type { LostFoundImage } from '../src/modules/lost-found/lost-found.types.js';
import type { StorageService } from '../src/services/storage/storage.types.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const reportId = '33333333-3333-4333-8333-333333333333';
const mediaId = '44444444-4444-4444-8444-444444444444';
const pendingKey = `lost-found-pending/${ownerId}/${reportId}/${mediaId}.png`;
const finalKey = `lost-found/${ownerId}/${reportId}/${mediaId}.png`;
const media = (overrides: Partial<LostFoundImage> = {}): LostFoundImage => ({
  height: null,
  id: mediaId,
  key: finalKey,
  mimeType: 'image/png',
  originalName: 'item.png',
  position: 0,
  primary: true,
  size: 68,
  uploadedById: ownerId,
  url: `https://cdn.example.com/${finalKey}`,
  width: null,
  ...overrides,
});
const repository = (
  overrides: Partial<LostFoundMediaRepository> = {},
): LostFoundMediaRepository => ({
  deleteLinkedMedia: () => Promise.resolve(media()),
  finalizeMedia: () => Promise.resolve({ kind: 'created', media: media() }),
  findLinkedMedia: () => Promise.resolve(null),
  getReportContext: () =>
    Promise.resolve({
      imageCount: 0,
      moderationVisibility: 'VISIBLE',
      reporterId: ownerId,
      status: LostFoundStatus.OPEN,
    }),
  listLinkedMedia: () => Promise.resolve([media()]),
  reorder: () => Promise.resolve(true),
  ...overrides,
});
const storage = (overrides: Partial<StorageService> = {}): StorageService => ({
  createUploadAuthorization: (input) =>
    Promise.resolve({
      expiresAt: new Date().toISOString(),
      objectKey: input.objectKey,
      requiredHeaders: { 'content-type': input.contentType },
      uploadUrl: 'https://s3.example/signed',
    }),
  deleteObject: () => Promise.resolve(),
  getDeliveryUrl: (key) => `https://cdn.example.com/${key}`,
  headObject: () =>
    Promise.resolve({
      byteSize: 68,
      contentType: 'image/png',
      metadata: {
        'expected-size': '68',
        'listing-id': reportId,
        'media-id': mediaId,
        'original-name': 'item.png',
        'uploader-id': ownerId,
      },
    }),
  promoteObject: () => Promise.resolve(),
  ...overrides,
});
const code = (expected: string) => (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === expected;

void describe('Lost & Found media', () => {
  void it('validates JPEG, PNG, and WebP while rejecting invalid and oversized files', () => {
    for (const [contentType, fileName] of [
      ['image/jpeg', 'a.jpg'],
      ['image/png', 'a.png'],
      ['image/webp', 'a.webp'],
    ])
      assert.equal(
        parseLostFoundMediaUpload({ contentType, fileName, size: 10 }).contentType,
        contentType,
      );
    assert.throws(
      () => parseLostFoundMediaUpload({ contentType: 'image/gif', fileName: 'a.gif', size: 10 }),
      code('VALIDATION_ERROR'),
    );
    assert.throws(
      () =>
        parseLostFoundMediaUpload({
          contentType: 'image/png',
          fileName: 'a.png',
          size: MAX_LOST_FOUND_IMAGE_SIZE + 1,
        }),
      code('VALIDATION_ERROR'),
    );
  });
  void it('authorizes only an editable owner and enforces the four-image limit', async () => {
    const service = createLostFoundMediaService(repository(), storage());
    await assert.rejects(
      service.authorizeUpload(otherId, reportId, {
        contentType: 'image/png',
        fileName: 'a.png',
        size: 10,
      }),
      code('LOST_FOUND_FORBIDDEN'),
    );
    const full = createLostFoundMediaService(
      repository({
        getReportContext: () =>
          Promise.resolve({
            imageCount: 4,
            moderationVisibility: 'VISIBLE',
            reporterId: ownerId,
            status: LostFoundStatus.OPEN,
          }),
      }),
      storage(),
    );
    await assert.rejects(
      full.authorizeUpload(ownerId, reportId, {
        contentType: 'image/png',
        fileName: 'a.png',
        size: 10,
      }),
      code('LOST_FOUND_IMAGE_LIMIT_REACHED'),
    );
  });
  void it('verifies and promotes a namespace-bound object', async () => {
    let destination = '';
    const service = createLostFoundMediaService(
      repository(),
      storage({
        promoteObject: (_source, target) => {
          destination = target;
          return Promise.resolve();
        },
      }),
    );
    assert.equal(
      (await service.completeUpload(ownerId, reportId, mediaId, { objectKey: pendingKey })).id,
      mediaId,
    );
    assert.equal(destination, finalKey);
    await assert.rejects(
      service.completeUpload(ownerId, reportId, mediaId, {
        objectKey: `marketplace/${mediaId}.png`,
      }),
      code('INVALID_MEDIA_OBJECT_KEY'),
    );
  });
  void it('rejects missing objects and metadata mismatches', async () => {
    await assert.rejects(
      createLostFoundMediaService(
        repository(),
        storage({ headObject: () => Promise.resolve(null) }),
      ).completeUpload(ownerId, reportId, mediaId, { objectKey: pendingKey }),
      code('MEDIA_OBJECT_NOT_FOUND'),
    );
    await assert.rejects(
      createLostFoundMediaService(
        repository(),
        storage({
          headObject: () =>
            Promise.resolve({
              byteSize: 68,
              contentType: 'image/png',
              metadata: {
                'expected-size': '68',
                'listing-id': reportId,
                'media-id': mediaId,
                'original-name': 'item.png',
                'uploader-id': otherId,
              },
            }),
        }),
      ).completeUpload(ownerId, reportId, mediaId, { objectKey: pendingKey }),
      code('MEDIA_UPLOAD_VERIFICATION_FAILED'),
    );
  });
  void it('enforces deletion and reorder ownership', async () => {
    const service = createLostFoundMediaService(
      repository({ findLinkedMedia: () => Promise.resolve(media()) }),
      storage(),
    );
    await service.deleteMedia(ownerId, reportId, mediaId);
    await assert.rejects(
      service.deleteMedia(otherId, reportId, mediaId),
      code('LOST_FOUND_FORBIDDEN'),
    );
    assert.deepEqual(parseLostFoundMediaOrder({ mediaIds: [mediaId] }), [mediaId]);
    await assert.rejects(
      service.reorderMedia(otherId, reportId, [mediaId]),
      code('LOST_FOUND_FORBIDDEN'),
    );
  });
});
