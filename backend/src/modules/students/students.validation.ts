import { ValidationError } from '../../errors/app-error.js';

const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid student discovery query.', [{ field, message }]);
};
const value = (field: string, input: unknown, maximum: number): string | undefined => {
  if (input === undefined) return undefined;
  if (typeof input !== 'string') return fail(field, 'Use one text value.');
  const normalized = input.trim();
  if (!normalized || normalized.length > maximum)
    return fail(field, `Use between 1 and ${maximum} characters.`);
  return normalized;
};
const integer = (field: string, input: unknown, fallback: number, maximum: number): number => {
  if (input === undefined) return fallback;
  if (typeof input !== 'string' || !/^\d+$/u.test(input))
    return fail(field, 'Use a positive integer.');
  const parsed = Number(input);
  if (parsed < 1 || parsed > maximum) return fail(field, `Use a value from 1 to ${maximum}.`);
  return parsed;
};
export const parseStudentDiscovery = (query: Record<string, unknown>) => {
  const supported = new Set(['department', 'interest', 'limit', 'page', 'search', 'skill']);
  const extra = Object.keys(query).find((key) => !supported.has(key));
  if (extra) fail(extra, 'This filter is not supported.');
  return {
    department: value('department', query.department, 120),
    interest: value('interest', query.interest, 100),
    limit: integer('limit', query.limit, 12, 24),
    page: integer('page', query.page, 1, 10_000),
    search: value('search', query.search, 100),
    skill: value('skill', query.skill, 80),
  };
};
