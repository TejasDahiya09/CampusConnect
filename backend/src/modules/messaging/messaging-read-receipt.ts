import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';

const invalid = () =>
  new AppError({
    code: 'INVALID_READ_RECEIPT',
    message: 'Fetch this conversation again before acknowledging messages.',
    statusCode: 400,
  });
export const createReadReceipts = (
  key: Buffer | undefined = env.messageEncryptionKey,
  now: () => number = Date.now,
) => {
  const sign = (payload: string): Buffer => {
    if (key?.length !== 32)
      throw new AppError({
        code: 'MESSAGE_ENCRYPTION_UNAVAILABLE',
        message: 'Messaging is unavailable.',
        statusCode: 503,
      });
    const derivedKey = createHmac('sha256', key)
      .update('campusconnect:read-receipt-key:v1')
      .digest();
    return createHmac('sha256', derivedKey)
      .update('campusconnect:read-receipt:v1:')
      .update(payload)
      .digest();
  };

  /** Signed exact fetched set: neither a client timestamp nor a broad conversation watermark. */
  const issue = (userId: string, conversationId: string, ids: readonly string[]) => {
    const payload = Buffer.from(
      JSON.stringify({ userId, conversationId, ids, expiresAt: now() + 15 * 60_000 }),
    ).toString('base64url');
    return payload + '.' + sign(payload).toString('base64url');
  };
  const verify = (token: unknown, userId: string, conversationId: string): string[] => {
    if (typeof token !== 'string' || token.length > 12_000) throw invalid();
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw invalid();
    const signature = Buffer.from(parts[1], 'base64url'),
      expected = sign(parts[0]);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected))
      throw invalid();
    try {
      const value: unknown = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      if (
        !value ||
        typeof value !== 'object' ||
        !('userId' in value) ||
        !('conversationId' in value) ||
        !('ids' in value) ||
        !('expiresAt' in value) ||
        value.userId !== userId ||
        value.conversationId !== conversationId ||
        typeof value.expiresAt !== 'number' ||
        value.expiresAt <= now() ||
        !Array.isArray(value.ids) ||
        value.ids.length > 100 ||
        !value.ids.every((id: unknown) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
      )
        throw invalid();
      return value.ids as string[];
    } catch {
      throw invalid();
    }
  };

  return { issue, verify };
};
const receipts = createReadReceipts();
export const issueReadReceipt = receipts.issue;
export const verifyReadReceipt = receipts.verify;
