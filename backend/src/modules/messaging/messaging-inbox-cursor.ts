import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';

// Authenticated encryption hides participant IDs and search terms, not merely signs them.
export const createInboxCursors = (key = env.messageEncryptionKey, now = Date.now) => {
  const secret = () => {
    if (key?.length !== 32)
      throw new AppError({
        code: 'MESSAGING_UNAVAILABLE',
        message: 'Messaging is unavailable.',
        statusCode: 503,
      });
    return createHmac('sha256', key).update('campusconnect:inbox-cursor:v1').digest();
  };
  const issue = (scope: string, at: string, id: string) => {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', secret(), iv);
    const content = Buffer.concat([
      cipher.update(JSON.stringify({ scope, at, id, expires: now() + 900_000 })),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), content]).toString('base64url');
  };
  const verify = (token: string, scope: string): { at: string; id: string } => {
    try {
      if (token.length > 2048) throw new Error();
      const bytes = Buffer.from(token, 'base64url');
      if (bytes.toString('base64url') !== token) throw new Error();
      const cipher = createDecipheriv('aes-256-gcm', secret(), bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      const value = JSON.parse(
        Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(),
      ) as { scope: string; at: string; id: string; expires: number };
      if (
        value.scope !== scope ||
        value.expires <= now() ||
        !/^[0-9a-f-]{36}$/.test(value.id) ||
        !Number.isFinite(Date.parse(value.at))
      )
        throw new Error();
      return value;
    } catch {
      throw new AppError({
        code: 'INVALID_INBOX_CURSOR',
        message: 'Refresh the inbox before loading more conversations.',
        statusCode: 400,
      });
    }
  };
  return { issue, verify };
};
export const inboxCursors = createInboxCursors();
