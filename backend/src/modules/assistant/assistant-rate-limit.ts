import type { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error.js';

/** Per-process authenticated budget; does not persist questions or student data. */
export function createAssistantRateLimit(now = Date.now, maximum = 20): RequestHandler {
  const windows = new Map<string, { start: number; count: number }>();
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const time = now();
    for (const [id, value] of windows) if (time - value.start >= 60_000) windows.delete(id);
    const key = req.auth?.user.id ?? req.ip ?? 'unknown';
    const value = windows.get(key) ?? { start: time, count: 0 };
    if (windows.size >= 5000 && !windows.has(key))
      return next(
        new AppError({
          code: 'ASSISTANT_RATE_LIMITED',
          message: 'Assistant is busy. Please retry shortly.',
          statusCode: 429,
        }),
      );
    windows.set(key, value);
    value.count += 1;
    if (value.count <= maximum) return next();
    res.set('Retry-After', String(Math.max(1, Math.ceil((value.start + 60_000 - time) / 1000))));
    return next(
      new AppError({
        code: 'ASSISTANT_RATE_LIMITED',
        message: 'Too many assistant requests. Please wait a minute.',
        statusCode: 429,
      }),
    );
  };
}
