import { ValidationError } from '../../errors/app-error.js';
import {
  ClaimStatus,
  LostFoundStatus,
  LostFoundType,
  type LostFoundStatus as LostFoundStatusValue,
  type LostFoundType as LostFoundTypeValue,
} from '../../generated/prisma/client.js';
import type {
  LostFoundBookmarkQuery,
  LostFoundCreateInput,
  LostFoundQuery,
  LostFoundUpdateInput,
} from './lost-found.types.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid Lost & Found request.', [{ field, message }]);
};
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail('body', 'Expected a JSON object.');
  return value as Record<string, unknown>;
};
const rejectUnknown = (value: Record<string, unknown>, allowed: readonly string[]): void => {
  const field = Object.keys(value).find((key) => !allowed.includes(key));
  if (field !== undefined) fail(field, 'This field is not supported.');
};
const string = (field: string, value: unknown, min: number, max: number): string => {
  if (typeof value !== 'string') return fail(field, 'Expected a string.');
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max)
    return fail(field, `Use between ${min} and ${max} characters.`);
  return normalized;
};
const nullableString = (field: string, value: unknown, max: number): string | null =>
  value === null || value === '' ? null : string(field, value, 1, max);
const date = (field: string, value: unknown): Date => {
  if (typeof value !== 'string' || !datePattern.test(value)) return fail(field, 'Use YYYY-MM-DD.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return fail(field, 'Use a real calendar date.');
  return parsed;
};
const nullableDate = (field: string, value: unknown): Date | null =>
  value === null || value === '' ? null : date(field, value);
const boolean = (field: string, value: unknown): boolean => {
  if (typeof value !== 'boolean') return fail(field, 'Expected a Boolean.');
  return value;
};
const enumValue = <T extends string>(field: string, value: unknown, values: readonly T[]): T => {
  if (typeof value !== 'string' || !values.includes(value as T))
    return fail(field, `Use one of: ${values.join(', ')}.`);
  return value as T;
};
const positiveInteger = (field: string, value: unknown, fallback: number, max: number): number => {
  if (value === undefined) return fallback;
  if (Array.isArray(value) || typeof value !== 'string' || !/^\d+$/.test(value))
    return fail(field, `Use an integer between 1 and ${max}.`);
  const parsed = Number(value);
  if (parsed < 1 || parsed > max) return fail(field, `Use an integer between 1 and ${max}.`);
  return parsed;
};

export const parseLostFoundId = (field: string, value: unknown): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) return fail(field, 'Expected a UUID.');
  return value;
};

export const parseLostFoundCreate = (body: unknown): LostFoundCreateInput => {
  const input = object(body);
  const fields = [
    'category',
    'description',
    'featuredOnLanding',
    'incidentDate',
    'location',
    'title',
    'type',
  ] as const;
  rejectUnknown(input, fields);
  const required = [
    'category',
    'description',
    'incidentDate',
    'location',
    'title',
    'type',
  ] as const;
  const missing = required.find((field) => !(field in input));
  if (missing !== undefined) fail(missing, 'This field is required.');
  return {
    category: string('category', input.category, 2, 100),
    description: string('description', input.description, 10, 5000),
    featuredOnLanding:
      'featuredOnLanding' in input ? boolean('featuredOnLanding', input.featuredOnLanding) : false,
    incidentDate: date('incidentDate', input.incidentDate),
    location: string('location', input.location, 2, 180),
    title: string('title', input.title, 3, 180),
    type: enumValue('type', input.type, Object.values(LostFoundType)),
  };
};

export const parseLostFoundUpdate = (body: unknown): LostFoundUpdateInput => {
  const input = object(body);
  const fields = [
    'category',
    'description',
    'featuredOnLanding',
    'incidentDate',
    'location',
    'title',
  ] as const;
  rejectUnknown(input, fields);
  if (Object.keys(input).length === 0) fail('body', 'Provide at least one field.');
  const result: {
    category?: string | null;
    description?: string;
    featuredOnLanding?: boolean;
    incidentDate?: Date | null;
    location?: string | null;
    title?: string;
  } = {};
  if ('category' in input) result.category = nullableString('category', input.category, 100);
  if ('description' in input)
    result.description = string('description', input.description, 10, 5000);
  if ('featuredOnLanding' in input)
    result.featuredOnLanding = boolean('featuredOnLanding', input.featuredOnLanding);
  if ('incidentDate' in input)
    result.incidentDate = nullableDate('incidentDate', input.incidentDate);
  if ('location' in input) result.location = nullableString('location', input.location, 180);
  if ('title' in input) result.title = string('title', input.title, 3, 180);
  return result;
};

export const parseLostFoundTransition = (body: unknown): LostFoundStatusValue => {
  const input = object(body);
  rejectUnknown(input, ['status']);
  return enumValue('status', input.status, Object.values(LostFoundStatus));
};

export const parseClaimCreate = (body: unknown): string => {
  const input = object(body);
  rejectUnknown(input, ['message']);
  return string('message', input.message, 10, 2000);
};

export const parseClaimReview = (body: unknown): ClaimStatus => {
  const input = object(body);
  rejectUnknown(input, ['status']);
  return enumValue('status', input.status, [ClaimStatus.APPROVED, ClaimStatus.REJECTED]);
};

export const parseEmptyBody = (body: unknown): void => {
  if (body === undefined) return;
  const input = object(body);
  rejectUnknown(input, []);
};

export const parseLostFoundQuery = (query: Record<string, unknown>): LostFoundQuery => {
  const allowed = [
    'category',
    'dateFrom',
    'dateTo',
    'keyword',
    'limit',
    'location',
    'page',
    'sort',
    'status',
    'type',
  ];
  rejectUnknown(query, allowed);
  const optional = (field: string, max: number): string | undefined =>
    query[field] === undefined ? undefined : string(field, query[field], 1, max);
  const dateFrom = query.dateFrom === undefined ? undefined : date('dateFrom', query.dateFrom);
  const dateTo = query.dateTo === undefined ? undefined : date('dateTo', query.dateTo);
  const category = optional('category', 100);
  const keyword = optional('keyword', 100);
  const location = optional('location', 180);
  if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo)
    fail('dateTo', 'Must be on or after dateFrom.');
  const sort =
    query.sort === undefined
      ? 'newest'
      : enumValue('sort', query.sort, ['newest', 'oldest', 'incident_newest'] as const);
  const visibleStatuses = [
    LostFoundStatus.OPEN,
    LostFoundStatus.MATCHED,
    LostFoundStatus.CLAIM_PENDING,
    LostFoundStatus.RESOLVED,
  ] as const;
  return {
    ...(category === undefined ? {} : { category }),
    ...(dateFrom === undefined ? {} : { dateFrom }),
    ...(dateTo === undefined ? {} : { dateTo }),
    ...(keyword === undefined ? {} : { keyword }),
    limit: positiveInteger('limit', query.limit, 12, 50),
    ...(location === undefined ? {} : { location }),
    page: positiveInteger('page', query.page, 1, 1_000_000),
    sort,
    ...(query.status === undefined
      ? {}
      : { status: enumValue('status', query.status, visibleStatuses) }),
    ...(query.type === undefined
      ? {}
      : { type: enumValue<LostFoundTypeValue>('type', query.type, Object.values(LostFoundType)) }),
  };
};

export const parseLostFoundBookmarkQuery = (
  query: Record<string, unknown>,
): LostFoundBookmarkQuery => {
  rejectUnknown(query, ['limit', 'page']);
  return {
    limit: positiveInteger('limit', query.limit, 12, 50),
    page: positiveInteger('page', query.page, 1, 1_000_000),
  };
};
