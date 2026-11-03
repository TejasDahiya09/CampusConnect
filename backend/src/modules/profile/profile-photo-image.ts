/** Strict bounded PNG decoder validation. Browser crops JPEG/PNG/WebP sources to PNG. */
import { inflateSync, deflateSync } from 'node:zlib';
import { AppError } from '../../errors/app-error.js';
export const PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_SIDE = 512;
export const photoInvalid = () =>
  new AppError({
    code: 'PROFILE_PHOTO_INVALID',
    message: 'Use a valid square profile photo. Choose JPEG, PNG or WebP and crop it again.',
    statusCode: 400,
  });
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
export function pngChunk(type: string, data: Uint8Array) {
  const name = Buffer.from(type);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  Buffer.from(data).copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, 8 + data.length)), 8 + data.length);
  return result;
}
export function canonicalPhoto(bytes: Uint8Array): Buffer {
  try {
    const b = Buffer.from(bytes);
    if (b.length > PHOTO_BYTES || b.length < 57 || !b.subarray(0, 8).equals(signature))
      throw photoInvalid();
    let offset = 8,
      header: Buffer | null = null,
      ended = false,
      seenData = false,
      dataEnded = false;
    const data: Buffer[] = [];
    while (offset < b.length) {
      if (offset + 12 > b.length) throw photoInvalid();
      const size = b.readUInt32BE(offset);
      if (size > PHOTO_BYTES || offset + size + 12 > b.length) throw photoInvalid();
      const type = b.toString('ascii', offset + 4, offset + 8),
        payload = b.subarray(offset + 8, offset + 8 + size);
      if (crc32(b.subarray(offset + 4, offset + 8 + size)) !== b.readUInt32BE(offset + 8 + size))
        throw photoInvalid();
      if (!header && type !== 'IHDR') throw photoInvalid();
      if (type === 'IHDR') {
        if (
          header ||
          size !== 13 ||
          payload.readUInt32BE(0) !== PHOTO_SIDE ||
          payload.readUInt32BE(4) !== PHOTO_SIDE ||
          payload[8] !== 8 ||
          ![2, 6].includes(payload[9]!) ||
          payload[10] !== 0 ||
          payload[11] !== 0 ||
          payload[12] !== 0
        )
          throw photoInvalid();
        header = payload;
      } else if (type === 'IDAT') {
        if (dataEnded) throw photoInvalid();
        seenData = true;
        data.push(payload);
      } else if (type === 'IEND') {
        if (size || !seenData || offset + 12 !== b.length) throw photoInvalid();
        ended = true;
        break;
      } else {
        if (seenData) dataEnded = true;
        if (!['sRGB', 'gAMA', 'cHRM', 'pHYs'].includes(type)) throw photoInvalid();
      }
      offset += size + 12;
    }
    if (!header || !ended) throw photoInvalid();
    const stride = PHOTO_SIDE * (header[9] === 6 ? 4 : 3) + 1;
    const raw = inflateSync(Buffer.concat(data), { maxOutputLength: stride * PHOTO_SIDE });
    if (raw.length !== stride * PHOTO_SIDE) throw photoInvalid();
    for (let y = 0; y < PHOTO_SIDE; y++) if (raw[y * stride]! > 4) throw photoInvalid();
    // Only image-bearing chunks are published: no EXIF, text, animation or trailing content.
    return Buffer.concat([
      signature,
      pngChunk('IHDR', header),
      pngChunk('IDAT', deflateSync(raw)),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
  } catch {
    throw photoInvalid();
  }
}
