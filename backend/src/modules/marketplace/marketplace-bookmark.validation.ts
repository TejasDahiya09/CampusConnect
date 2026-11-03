import { ValidationError } from '../../errors/app-error.js';
import type { BookmarkQuery } from './marketplace.types.js';

const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid bookmark request.', [{ field, message }]);
};

const firstValue = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

const positiveInteger = (
  field: string,
  value: unknown,
  fallback: number,
  maximum: number,
): number => {
  if (value === undefined) return fallback;
  const normalized = firstValue(value);
  if (typeof normalized !== 'string' || !/^\d+$/.test(normalized)) {
    return fail(field, `Use an integer between 1 and ${maximum}.`);
  }
  const parsed = Number(normalized);
  if (parsed < 1 || parsed > maximum)
    return fail(field, `Use an integer between 1 and ${maximum}.`);
  return parsed;
};

export const parseBookmarkBody = (body: unknown): void => {
  if (body === undefined) return;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fail('body', 'Expected an empty JSON object or no request body.');
  }
  const field = Object.keys(body).at(0);
  if (field !== undefined) fail(field, 'Bookmark ownership cannot be supplied by the client.');
};

export const parseBookmarkQuery = (query: Record<string, unknown>): BookmarkQuery => {
  const unsupported = Object.keys(query).find((field) => !['limit', 'page'].includes(field));
  if (unsupported !== undefined) fail(unsupported, 'This query parameter is not supported.');
  return {
    limit: positiveInteger('limit', query.limit, 12, 50),
    page: positiveInteger('page', query.page, 1, 1_000_000),
  };
};
