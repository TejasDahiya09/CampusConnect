import type { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error.js';

export const messagingLimits = {
  open: 30,
  send: 120,
  inbox: 120,
  history: 240,
  read: 240,
  recovery: 240,
} as const;
type Action = keyof typeof messagingLimits;
/** Authenticated account buckets. No IP/user-supplied identity or private payload retained. */
export function createMessagingRateLimit(now = Date.now, capacity = 20_000) {
  const buckets = new Map<string, { count: number; end: number }>();
  let sweepAt = 0;
  return (action: Action): RequestHandler =>
    (request, response, next) => {
      if (!request.auth)
        return next(
          new AppError({
            code: 'UNAUTHENTICATED',
            message: 'Authentication is required.',
            statusCode: 401,
          }),
        );
      const time = now(),
        key = `${request.auth.user.id}:${action}`;
      if (time >= sweepAt) {
        for (const [id, bucket] of buckets) if (bucket.end <= time) buckets.delete(id);
        sweepAt = time + 60_000;
      }
      if ((buckets.get(key)?.end ?? Infinity) <= time) buckets.delete(key);
      let bucket = buckets.get(key);
      if (!bucket && buckets.size < capacity) {
        bucket = { count: 0, end: time + 60_000 };
        buckets.set(key, bucket);
      }
      response.set('Cache-Control', 'no-store');
      if (bucket && ++bucket.count <= messagingLimits[action]) return next();
      response.set(
        'Retry-After',
        String(Math.max(1, Math.ceil(((bucket?.end ?? time + 60_000) - time) / 1000))),
      );
      return next(
        new AppError({
          code: 'MESSAGING_RATE_LIMITED',
          message: 'Too many Messaging requests. Please wait before retrying.',
          statusCode: 429,
        }),
      );
    };
}
