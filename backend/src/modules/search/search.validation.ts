import { ValidationError } from '../../errors/app-error.js';
import { searchTypes, type SearchQuery, type SearchType } from './search.types.js';

const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid search request.', [{ field, message }]);
};

const single = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return fail(field, 'Expected one value.');
  return value;
};

const positiveInteger = (value: unknown, fallback: number, field: string, maximum: number) => {
  const text = single(value, field) ?? String(fallback);
  if (!/^\d+$/.test(text)) return fail(field, 'Expected a positive integer.');
  const parsed = Number(text);
  if (parsed < 1 || parsed > maximum) return fail(field, `Expected a value from 1 to ${maximum}.`);
  return parsed;
};

export const parseSearchQuery = (input: Record<string, unknown>): SearchQuery => {
  const unknown = Object.keys(input).find((key) => !['q', 'type', 'page', 'limit'].includes(key));
  if (unknown) fail(unknown, 'Unsupported search parameter.');
  const query = (single(input.q, 'q') ?? '').trim().replace(/\s+/g, ' ');
  if (query.length < 2) fail('q', 'Use at least 2 characters.');
  if (query.length > 100) fail('q', 'Use at most 100 characters.');
  const rawType = (single(input.type, 'type') ?? 'ALL').toUpperCase();
  const foundType: SearchType | undefined = searchTypes.find((candidate) => candidate === rawType);
  const type =
    foundType ?? fail('type', 'Use ALL, STUDENT, MARKETPLACE, LOST_FOUND, TEAMUP, or SERVICE.');
  return {
    limit: positiveInteger(input.limit, type === 'ALL' ? 5 : 12, 'limit', type === 'ALL' ? 10 : 25),
    page: positiveInteger(input.page, 1, 'page', 1000),
    query,
    type,
  };
};
