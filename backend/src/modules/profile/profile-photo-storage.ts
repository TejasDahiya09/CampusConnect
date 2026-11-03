import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { configuration, getClient } from '../../services/storage/s3-storage.service.js';
export interface PhotoStorage {
  authorize(
    key: string,
    size: number,
    owner: string,
    nonce: string,
  ): Promise<{ uploadUrl: string; headers: Record<string, string> }>;
  read(key: string, size: number, owner: string, nonce: string): Promise<Uint8Array>;
  put(key: string, bytes: Uint8Array, owner: string): Promise<void>;
  remove(key: string, owner?: string): Promise<void>;
}
export const profilePhotoStorage: PhotoStorage = {
  authorize: async (key, size, owner, nonce) => {
    const headers = { 'content-type': 'image/png', 'x-amz-server-side-encryption': 'AES256' };
    return {
      uploadUrl: await getSignedUrl(
        getClient(),
        new PutObjectCommand({
          Bucket: configuration().bucket,
          Key: key,
          ContentType: 'image/png',
          ContentLength: size,
          ServerSideEncryption: 'AES256',
          Metadata: { 'photo-owner': owner, 'photo-session': nonce, 'photo-size': String(size) },
        }),
        { expiresIn: 300 },
      ),
      headers,
    };
  },
  read: async (key, size, owner, nonce) => {
    const client = getClient(),
      Bucket = configuration().bucket;
    const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
    if (
      head.ContentType !== 'image/png' ||
      head.ContentLength !== size ||
      head.ServerSideEncryption !== 'AES256' ||
      head.Metadata?.['photo-owner'] !== owner ||
      head.Metadata['photo-session'] !== nonce ||
      head.Metadata['photo-size'] !== String(size) ||
      !head.ETag
    )
      throw new Error('Photo object verification failed');
    const result = await client.send(
      new GetObjectCommand({ Bucket, Key: key, IfMatch: head.ETag }),
    );
    if (!result.Body) throw new Error('Photo body missing');
    const parts: Buffer[] = [];
    let count = 0;
    try {
      for await (const part of result.Body as AsyncIterable<Uint8Array>) {
        count += part.length;
        if (count > size) throw new Error('Photo body exceeds limit');
        parts.push(Buffer.from(part));
      }
    } catch (error) {
      (result.Body as { destroy?: () => void }).destroy?.();
      throw error;
    }
    if (count !== size) throw new Error('Photo body size mismatch');
    return Buffer.concat(parts);
  },
  put: async (key, bytes, owner) => {
    await getClient().send(
      new PutObjectCommand({
        Bucket: configuration().bucket,
        Key: key,
        Body: bytes,
        ContentType: 'image/png',
        CacheControl: 'no-store',
        Metadata: { 'photo-owner': owner },
        ServerSideEncryption: 'AES256',
      }),
    );
  },
  remove: async (key, owner) => {
    if (owner) {
      const head = await getClient().send(
        new HeadObjectCommand({ Bucket: configuration().bucket, Key: key }),
      );
      if (head.Metadata?.['photo-owner'] !== owner)
        throw new Error('Photo deletion ownership check failed');
    }
    await getClient().send(new DeleteObjectCommand({ Bucket: configuration().bucket, Key: key }));
  },
};
