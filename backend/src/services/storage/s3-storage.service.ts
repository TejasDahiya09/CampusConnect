import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../../errors/app-error.js';
import { env } from '../../config/env.js';
import type { StorageService, StoredObjectMetadata } from './storage.types.js';
import { getCloudFrontDeliveryUrl } from './cloudfront-url.js';

export const MARKETPLACE_UPLOAD_EXPIRY_SECONDS = 300;

const storageUnavailable = () =>
  new AppError({
    code: 'STORAGE_NOT_CONFIGURED',
    expose: false,
    message: 'Marketplace storage configuration is unavailable.',
    statusCode: 503,
  });

export const configuration = () => {
  if (
    env.awsRegion === undefined ||
    env.awsS3Bucket === undefined ||
    env.awsCloudFrontBaseUrl === undefined
  ) {
    throw storageUnavailable();
  }
  return {
    bucket: env.awsS3Bucket,
    cloudFrontBaseUrl: env.awsCloudFrontBaseUrl,
    region: env.awsRegion,
  };
};

let client: S3Client | undefined;

export const getClient = (): S3Client => {
  const { region } = configuration();
  client ??= new S3Client({
    region,
    ...(env.awsAccessKeyId === undefined || env.awsSecretAccessKey === undefined
      ? {}
      : {
          credentials: {
            accessKeyId: env.awsAccessKeyId,
            secretAccessKey: env.awsSecretAccessKey,
          },
        }),
  });
  return client;
};

const mapMetadata = (metadata: Record<string, string> | undefined): Record<string, string> =>
  Object.fromEntries(
    Object.entries(metadata ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );

const isNotFound = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (('name' in error && (error.name === 'NotFound' || error.name === 'NoSuchKey')) ||
    ('$metadata' in error &&
      typeof error.$metadata === 'object' &&
      error.$metadata !== null &&
      'httpStatusCode' in error.$metadata &&
      error.$metadata.httpStatusCode === 404));

export const s3StorageService: StorageService = {
  createUploadAuthorization: async (input) => {
    const { bucket } = configuration();
    const metadata = {
      'expected-size': String(input.expectedSize),
      'listing-id': input.listingId,
      'media-id': input.mediaId,
      'original-name': encodeURIComponent(input.originalName),
      'uploader-id': input.uploaderId,
    };
    const command = new PutObjectCommand({
      Bucket: bucket,
      CacheControl: 'public, max-age=31536000, immutable',
      ContentType: input.contentType,
      Key: input.objectKey,
      Metadata: metadata,
      ServerSideEncryption: 'AES256',
    });
    const uploadUrl = await getSignedUrl(getClient(), command, {
      expiresIn: MARKETPLACE_UPLOAD_EXPIRY_SECONDS,
    });
    return {
      expiresAt: new Date(Date.now() + MARKETPLACE_UPLOAD_EXPIRY_SECONDS * 1000).toISOString(),
      objectKey: input.objectKey,
      requiredHeaders: {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': input.contentType,
        'x-amz-server-side-encryption': 'AES256',
      },
      uploadUrl,
    };
  },

  deleteObject: async (objectKey) => {
    const { bucket } = configuration();
    await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
  },

  getDeliveryUrl: (objectKey) => {
    configuration();
    const url = getCloudFrontDeliveryUrl(objectKey);
    if (url === null) throw storageUnavailable();
    return url;
  },

  headObject: async (objectKey): Promise<StoredObjectMetadata | null> => {
    const { bucket } = configuration();
    try {
      const result = await getClient().send(
        new HeadObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
      if (result.ContentLength === undefined) return null;
      return {
        byteSize: result.ContentLength,
        contentType: result.ContentType,
        metadata: mapMetadata(result.Metadata),
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  },

  readObject: async (objectKey, maximumBytes) => {
    const { bucket } = configuration();
    const metadata = await s3StorageService.headObject(objectKey);
    if (metadata === null || metadata.byteSize > maximumBytes) return null;
    try {
      const result = await getClient().send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
      if (result.Body === undefined) return null;
      const bytes = await result.Body.transformToByteArray();
      return bytes.byteLength <= maximumBytes ? bytes : null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  },

  promoteObject: async (sourceObjectKey, destinationObjectKey) => {
    const { bucket } = configuration();
    await getClient().send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${sourceObjectKey}`,
        Key: destinationObjectKey,
        MetadataDirective: 'COPY',
        ServerSideEncryption: 'AES256',
      }),
    );
    await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: sourceObjectKey }));
  },
};
