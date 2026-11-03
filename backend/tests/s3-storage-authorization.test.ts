import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { s3StorageService } from '../src/services/storage/s3-storage.service.js';

void describe('S3 upload authorization contract', () => {
  void it('does not duplicate presigned metadata as unsigned request headers', async () => {
    const authorization = await s3StorageService.createUploadAuthorization({
      contentType: 'image/png',
      expectedSize: 68,
      listingId: '11111111-1111-4111-8111-111111111111',
      mediaId: '22222222-2222-4222-8222-222222222222',
      objectKey:
        'marketplace-pending/11111111-1111-4111-8111-111111111111/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png',
      originalName: 'campus.png',
      uploaderId: '11111111-1111-4111-8111-111111111111',
    });

    assert.deepEqual(authorization.requiredHeaders, {
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': 'image/png',
      'x-amz-server-side-encryption': 'AES256',
    });
    assert.equal(
      Object.keys(authorization.requiredHeaders).some((name) => name.startsWith('x-amz-meta-')),
      false,
    );
    const signedUrl = new URL(authorization.uploadUrl);
    assert.equal(
      signedUrl.searchParams.get('x-amz-meta-listing-id'),
      '11111111-1111-4111-8111-111111111111',
    );
    assert.equal(
      signedUrl.searchParams.get('x-amz-meta-media-id'),
      '22222222-2222-4222-8222-222222222222',
    );
  });
});
