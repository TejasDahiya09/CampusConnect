import type { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error.js';

interface RateLimitOptions {
  readonly maximum?: number;
  readonly now?: () => number;
  readonly windowMs?: number;
}

export const createPublicHighlightsRateLimit = ({
  maximum = 60,
  now = Date.now,
  windowMs = 60_000,
}: RateLimitOptions = {}): RequestHandler => {
  const windows = new Map<string, { count: number; startedAt: number }>();
  return (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const timestamp = now();
    const current = windows.get(key);
    const window =
      current === undefined || timestamp - current.startedAt >= windowMs
        ? { count: 1, startedAt: timestamp }
        : { count: current.count + 1, startedAt: current.startedAt };
    windows.set(key, window);
    if (windows.size > 1_000)
      for (const [candidate, value] of windows)
        if (timestamp - value.startedAt >= windowMs) windows.delete(candidate);
    if (window.count <= maximum) return next();
    response.set(
      'Retry-After',
      String(Math.max(1, Math.ceil((window.startedAt + windowMs - timestamp) / 1000))),
    );
    return next(
      new AppError({
        code: 'PUBLIC_HIGHLIGHTS_RATE_LIMITED',
        message: 'Too many public highlight requests. Please try again shortly.',
        statusCode: 429,
      }),
    );
  };
};
