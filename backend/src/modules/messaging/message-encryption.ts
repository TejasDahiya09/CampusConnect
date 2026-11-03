import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '../../errors/app-error.js';
import { env } from '../../config/env.js';

export interface EncryptedMessageContent {
  readonly encryptedContent: Uint8Array<ArrayBuffer>;
  readonly encryptionIv: Uint8Array<ArrayBuffer>;
  readonly encryptionTag: Uint8Array<ArrayBuffer>;
  readonly encryptionVersion: number;
}

const keyRequired = (key: Buffer | undefined): Buffer => {
  if (key?.length !== 32)
    throw new AppError({
      code: 'MESSAGE_ENCRYPTION_UNAVAILABLE',
      expose: false,
      message: 'Messaging encryption is not configured.',
      statusCode: 503,
    });
  return key;
};

export const createMessageEncryption = (
  configuredKey: Buffer | undefined = env.messageEncryptionKey,
) => ({
  decrypt: (record: EncryptedMessageContent): string => {
    if (record.encryptionVersion !== 1)
      throw new AppError({
        code: 'MESSAGE_DECRYPTION_FAILED',
        expose: false,
        message: 'This message cannot be read.',
        statusCode: 500,
      });
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        keyRequired(configuredKey),
        record.encryptionIv,
      );
      decipher.setAuthTag(record.encryptionTag);
      return Buffer.concat([decipher.update(record.encryptedContent), decipher.final()]).toString(
        'utf8',
      );
    } catch {
      throw new AppError({
        code: 'MESSAGE_DECRYPTION_FAILED',
        expose: false,
        message: 'This message cannot be read.',
        statusCode: 500,
      });
    }
  },
  encrypt: (plaintext: string): EncryptedMessageContent => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', keyRequired(configuredKey), iv);
    const encryptedContent = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const copy = (value: Uint8Array): Uint8Array<ArrayBuffer> => {
      const result = new Uint8Array(value.byteLength);
      result.set(value);
      return result;
    };
    return {
      encryptedContent: copy(encryptedContent),
      encryptionIv: copy(iv),
      encryptionTag: copy(cipher.getAuthTag()),
      encryptionVersion: 1,
    };
  },
});

export const messageEncryption = createMessageEncryption();
