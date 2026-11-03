import { apiRequest } from '../../services/api-client';
import type { ProfileAvatar } from './profile.types';
export const PHOTO_SOURCE_LIMIT = 5 * 1024 * 1024;
export const PHOTO_SIDE = 512;
export interface PhotoState {
  available: boolean;
  avatar: ProfileAvatar | null;
  version: string | null;
}
export { safePhoto } from './profile-avatar-value';
import { safePhoto } from './profile-avatar-value';
export const checkedPhotoState = (value: PhotoState): PhotoState => {
  if (
    typeof value.available !== 'boolean' ||
    (value.available &&
      !(typeof value.version === 'string' && /^[a-f0-9]{64}$/.test(value.version))) ||
    (value.avatar !== null &&
      !safePhoto(value.avatar) &&
      !(
        value.avatar.type === 'predefined' &&
        ['campus-indigo', 'campus-cyan', 'campus-amber', 'campus-rose'].includes(value.avatar.id)
      ))
  )
    throw new Error('The photo response could not be verified. Reload your profile.');
  return value;
};
export const photoApi = {
  get: async (signal?: AbortSignal) =>
    checkedPhotoState(
      (await apiRequest<{ photo: PhotoState }>('/api/profile/me/photo', { signal })).photo,
    ),
  authorize: (size: number, version: string, signal: AbortSignal) =>
    apiRequest<{
      ticket: string;
      uploadUrl: string;
      requiredHeaders: Record<string, string>;
      expiresAt: string;
    }>('/api/profile/me/photo/uploads', {
      method: 'POST',
      body: JSON.stringify({ size, version }),
      signal,
    }),
  complete: async (ticket: string, signal: AbortSignal) =>
    checkedPhotoState(
      (
        await apiRequest<{ photo: PhotoState }>('/api/profile/me/photo/uploads/complete', {
          method: 'POST',
          body: JSON.stringify({ ticket }),
          signal,
        })
      ).photo,
    ),
  remove: async (version: string, signal: AbortSignal) =>
    checkedPhotoState(
      (
        await apiRequest<{ photo: PhotoState }>('/api/profile/me/photo', {
          method: 'DELETE',
          body: JSON.stringify({ version }),
          signal,
        })
      ).photo,
    ),
  cancel: (ticket: string) =>
    apiRequest('/api/profile/me/photo/uploads', {
      method: 'DELETE',
      body: JSON.stringify({ ticket }),
    }),
};
export function imageFormat(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b))
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}
export function cropRect(width: number, height: number, zoom: number, x: number, y: number) {
  const side = Math.min(width, height) / Math.max(1, Math.min(3, zoom));
  return {
    side,
    x: ((width - side) / 2) * (1 + Math.max(-100, Math.min(100, x)) / 100),
    y: ((height - side) / 2) * (1 + Math.max(-100, Math.min(100, y)) / 100),
  };
}
/** Move the photo with the pointer, converting preview pixels to the existing crop coordinates. */
export function panPhoto(
  width: number,
  height: number,
  zoom: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  previewSide: number,
) {
  const { side } = cropRect(width, height, zoom, x, y);
  const move = (position: number, delta: number, extent: number) =>
    extent <= 0 || previewSide <= 0
      ? position
      : Math.max(-100, Math.min(100, position - (delta * side * 200) / (previewSide * extent)));
  return { x: move(x, dx, width - side), y: move(y, dy, height - side) };
}
/** Header dimensions are checked before asking the browser to allocate decoded pixels. */
export function sourceDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const format = imageFormat(bytes),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    format === 'image/png' &&
    bytes.length >= 24 &&
    String.fromCharCode(...bytes.subarray(12, 16)) === 'IHDR'
  )
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (format === 'image/webp' && bytes.length >= 30) {
    const kind = String.fromCharCode(...bytes.subarray(12, 16));
    if (kind === 'VP8X')
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    if (kind === 'VP8L' && bytes[20] === 47)
      return {
        width: 1 + bytes[21] + ((bytes[22] & 63) << 8),
        height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10),
      };
    if (kind === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42)
      return { width: view.getUint16(26, true) & 16383, height: view.getUint16(28, true) & 16383 };
  }
  if (format === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) return null;
      let marker = bytes[offset + 1];
      while (marker === 255) {
        offset++;
        if (offset + 4 > bytes.length) return null;
        marker = bytes[offset + 1];
      }
      if (marker === 217 || marker === 218) return null;
      const length = view.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) return null;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (length < 8) return null;
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      offset += length + 2;
    }
  }
  return null;
}
export async function decodePhoto(file: File): Promise<ImageBitmap> {
  if (file.size === 0 || file.size > PHOTO_SOURCE_LIMIT)
    throw new Error('Choose a photo smaller than 5 MB.');
  const format = imageFormat(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!format || file.type !== format) throw new Error('Choose a valid JPEG, PNG or WebP image.');
  const size = sourceDimensions(new Uint8Array(await file.slice(0, 262144).arrayBuffer()));
  if (
    !size ||
    size.width < 128 ||
    size.height < 128 ||
    size.width > 8192 ||
    size.height > 8192 ||
    size.width * size.height > 16000000
  )
    throw new Error('Choose an image at least 128 pixels per side and no more than 16 megapixels.');
  if (typeof createImageBitmap !== 'function')
    throw new Error('This browser cannot prepare photos. Try another browser.');
  const image = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('This image could not be opened. Choose another JPEG, PNG or WebP image.');
  });
  if (
    image.width < 128 ||
    image.height < 128 ||
    image.width > 8192 ||
    image.height > 8192 ||
    image.width * image.height > 16000000
  ) {
    image.close();
    throw new Error('Choose an image at least 128 pixels per side and no more than 16 megapixels.');
  }
  return image;
}
export function uploadPhoto(
  url: string,
  headers: Record<string, string>,
  blob: Blob,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<void> {
  const target = new URL(url);
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    !/(?:^|\.)s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(target.hostname)
  )
    throw new Error('The photo upload destination is invalid.');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => {
      xhr.abort();
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    xhr.open('PUT', url);
    xhr.timeout = 60000;
    for (const [key, value] of Object.entries(headers)) {
      if (!['content-type', 'x-amz-server-side-encryption'].includes(key.toLowerCase())) {
        signal.removeEventListener('abort', abort);
        reject(new Error('Unexpected photo upload header.'));
        return;
      }
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    const fail = () => {
      signal.removeEventListener('abort', abort);
      reject(new Error('The photo upload did not finish. Your existing photo is unchanged.'));
    };
    xhr.onerror = fail;
    xhr.ontimeout = fail;
    xhr.onabort = () => {
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };
    xhr.onload = () => {
      signal.removeEventListener('abort', abort);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else fail();
    };
    xhr.send(blob);
  });
}
