import { ValidationError } from '../../errors/app-error.js';
import {
  ListingCondition,
  ListingStatus,
  type ListingCondition as ListingConditionValue,
  type ListingStatus as ListingStatusValue,
} from '../../generated/prisma/client.js';
import type {
  ListingCreateInput,
  ListingQuery,
  ListingSort,
  ListingUpdateInput,
} from './marketplace.types.js';
import { findMarketplaceCategory } from './marketplace-categories.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pricePattern = /^\d{1,10}(?:\.\d{1,2})?$/;
const currencyPattern = /^[A-Za-z]{3}$/;
const publicStatuses = [ListingStatus.ACTIVE, ListingStatus.SOLD, ListingStatus.ARCHIVED] as const;
const discoveryStatuses = [ListingStatus.ACTIVE, ListingStatus.SOLD] as const;
const conditions = Object.values(ListingCondition);
const listingSorts: readonly ListingSort[] = ['newest', 'price_asc', 'price_desc'];

const validationError = (field: string, message: string): never => {
  throw new ValidationError(`A valid ${field} is required.`, [{ field, message }]);
};

const requireObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return validationError('body', 'Expected a JSON object.');
  }
  return value as Record<string, unknown>;
};

const rejectUnknownFields = (input: Record<string, unknown>, allowed: readonly string[]): void => {
  const field = Object.keys(input).find((key) => !allowed.includes(key));
  if (field !== undefined) validationError(field, 'This field cannot be modified.');
};

const parseString = (field: string, value: unknown, minimum: number, maximum: number): string => {
  if (typeof value !== 'string') {
    return validationError(
      field,
      `Expected a string between ${minimum} and ${maximum} characters.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    return validationError(field, `Must contain between ${minimum} and ${maximum} characters.`);
  }
  return normalized;
};

const parseNullableString = (field: string, value: unknown, maximum: number): string | null =>
  value === null || value === '' ? null : parseString(field, value, 1, maximum);

const parseBoolean = (field: string, value: unknown): boolean => {
  if (typeof value !== 'boolean') return validationError(field, 'Expected a Boolean.');
  return value;
};

export const parseListingId = (value: unknown): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    return validationError('id', 'Expected a UUID.');
  }
  return value;
};

const parseCategoryId = (value: unknown): string => {
  if (typeof value !== 'string' || findMarketplaceCategory(value) === undefined) {
    return validationError('categoryId', 'Select a supported marketplace category.');
  }
  return value;
};

const parseCondition = (value: unknown): ListingConditionValue => {
  if (typeof value !== 'string' || !conditions.includes(value as ListingConditionValue)) {
    return validationError('condition', `Use one of: ${conditions.join(', ')}.`);
  }
  return value as ListingConditionValue;
};

const parseStatus = (value: unknown): ListingStatusValue => {
  if (
    typeof value !== 'string' ||
    !publicStatuses.includes(value as (typeof publicStatuses)[number])
  ) {
    return validationError('status', `Use one of: ${publicStatuses.join(', ')}.`);
  }
  return value as ListingStatusValue;
};

const parseCreateStatus = (value: unknown): ListingStatusValue => {
  const status = parseStatus(value);
  if (status !== ListingStatus.ACTIVE) {
    return validationError('status', 'A new listing must begin as ACTIVE.');
  }
  return status;
};

const parsePrice = (field: string, value: unknown): string => {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof normalized !== 'string' || !pricePattern.test(normalized)) {
    return validationError(
      field,
      'Use a non-negative amount with at most 10 integer and 2 decimal digits.',
    );
  }
  const [integerPart = '0', fractionalPart = ''] = normalized.split('.');
  const integer = integerPart.replace(/^0+(?=\d)/, '');
  return `${integer}.${fractionalPart.padEnd(2, '0')}`;
};

const parseCurrency = (value: unknown): string => {
  if (typeof value !== 'string' || !currencyPattern.test(value.trim())) {
    return validationError('currency', 'Use a three-letter ISO-style currency code.');
  }
  return value.trim().toUpperCase();
};

const editableFields = [
  'categoryId',
  'condition',
  'currency',
  'description',
  'featuredOnLanding',
  'location',
  'price',
  'status',
  'title',
] as const;

export const parseListingCreate = (body: unknown): ListingCreateInput => {
  const input = requireObject(body);
  rejectUnknownFields(input, editableFields);
  const required = [
    'categoryId',
    'condition',
    'currency',
    'description',
    'price',
    'title',
  ] as const;
  const missing = required.find((field) => !(field in input));
  if (missing !== undefined) validationError(missing, 'This field is required.');

  return {
    categoryId: parseCategoryId(input.categoryId),
    condition: parseCondition(input.condition),
    currency: parseCurrency(input.currency),
    description: parseString('description', input.description, 10, 10_000),
    featuredOnLanding:
      'featuredOnLanding' in input
        ? parseBoolean('featuredOnLanding', input.featuredOnLanding)
        : false,
    location: 'location' in input ? parseNullableString('location', input.location, 255) : null,
    price: parsePrice('price', input.price),
    status: 'status' in input ? parseCreateStatus(input.status) : ListingStatus.ACTIVE,
    title: parseString('title', input.title, 3, 160),
  };
};

export const parseListingUpdate = (body: unknown): ListingUpdateInput => {
  const input = requireObject(body);
  rejectUnknownFields(input, editableFields);
  if (Object.keys(input).length === 0)
    validationError('body', 'Provide at least one listing field.');

  const result: {
    categoryId?: string;
    condition?: ListingConditionValue;
    currency?: string;
    description?: string;
    featuredOnLanding?: boolean;
    location?: string | null;
    price?: string;
    status?: ListingStatusValue;
    title?: string;
  } = {};
  if ('categoryId' in input) result.categoryId = parseCategoryId(input.categoryId);
  if ('condition' in input) result.condition = parseCondition(input.condition);
  if ('currency' in input) result.currency = parseCurrency(input.currency);
  if ('description' in input)
    result.description = parseString('description', input.description, 10, 10_000);
  if ('featuredOnLanding' in input)
    result.featuredOnLanding = parseBoolean('featuredOnLanding', input.featuredOnLanding);
  if ('location' in input) result.location = parseNullableString('location', input.location, 255);
  if ('price' in input) result.price = parsePrice('price', input.price);
  if ('status' in input) result.status = parseStatus(input.status);
  if ('title' in input) result.title = parseString('title', input.title, 3, 160);
  return result;
};

const singleQueryValue = (field: string, value: unknown): unknown => {
  if (Array.isArray(value)) validationError(field, 'Provide this query parameter only once.');
  return value;
};

const optionalAlias = (
  query: Record<string, unknown>,
  field: string,
  legacyField: string,
): unknown => {
  if (query[field] !== undefined && query[legacyField] !== undefined) {
    return validationError(field, `Do not combine ${field} with legacy ${legacyField}.`);
  }
  const source = query[field] === undefined ? legacyField : field;
  return query[source] === undefined ? undefined : singleQueryValue(source, query[source]);
};

const parseOptionalSearch = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return validationError('search', 'Expected a string.');
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  if (normalized.length > 100) validationError('search', 'Must contain at most 100 characters.');
  return normalized;
};

const listingIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseExcludedIds = (value: unknown): readonly string[] | undefined => {
  if (value === undefined) return undefined;
  const normalized = singleQueryValue('excludeIds', value);
  if (typeof normalized !== 'string') {
    return validationError('excludeIds', 'Expected a comma-separated list of listing IDs.');
  }
  const ids = normalized.split(',').map((id) => id.trim());
  if (
    ids.length < 1 ||
    ids.length > 4 ||
    ids.some((id) => !listingIdPattern.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    return validationError('excludeIds', 'Provide one to four unique listing UUIDs.');
  }
  return ids;
};

const parseDiscoveryStatus = (value: unknown): ListingStatusValue => {
  if (
    typeof value !== 'string' ||
    !discoveryStatuses.includes(value as (typeof discoveryStatuses)[number])
  ) {
    return validationError('status', `Use one of: ${discoveryStatuses.join(', ')}.`);
  }
  return value as ListingStatusValue;
};

const parseSort = (value: unknown): ListingSort => {
  if (value === undefined) return 'newest';
  if (typeof value !== 'string' || !listingSorts.includes(value as ListingSort)) {
    return validationError('sort', `Use one of: ${listingSorts.join(', ')}.`);
  }
  return value as ListingSort;
};

const priceInMinorUnits = (price: string): bigint => {
  const [integer = '0', fraction = '00'] = price.split('.');
  return BigInt(integer) * 100n + BigInt(fraction);
};

const parsePositiveInteger = (
  field: string,
  value: unknown,
  fallback: number,
  maximum: number,
): number => {
  if (value === undefined) return fallback;
  const normalized = singleQueryValue(field, value);
  if (typeof normalized !== 'string' || !/^\d+$/.test(normalized)) {
    return validationError(field, `Use an integer between 1 and ${maximum}.`);
  }
  const parsed = Number(normalized);
  if (parsed < 1 || parsed > maximum)
    validationError(field, `Use an integer between 1 and ${maximum}.`);
  return parsed;
};

export const parseListingQuery = (query: Record<string, unknown>): ListingQuery => {
  rejectUnknownFields(query, [
    'categoryId',
    'condition',
    'excludeIds',
    'keyword',
    'limit',
    'maxPrice',
    'maximumPrice',
    'minPrice',
    'minimumPrice',
    'page',
    'search',
    'sort',
    'status',
  ]);
  const minPriceValue = optionalAlias(query, 'minPrice', 'minimumPrice');
  const maxPriceValue = optionalAlias(query, 'maxPrice', 'maximumPrice');
  const searchValue = optionalAlias(query, 'search', 'keyword');
  const minPrice = minPriceValue === undefined ? undefined : parsePrice('minPrice', minPriceValue);
  const maxPrice = maxPriceValue === undefined ? undefined : parsePrice('maxPrice', maxPriceValue);
  if (
    minPrice !== undefined &&
    maxPrice !== undefined &&
    priceInMinorUnits(minPrice) > priceInMinorUnits(maxPrice)
  ) {
    validationError('maxPrice', 'Must be greater than or equal to minPrice.');
  }

  const search = parseOptionalSearch(searchValue);
  const excludeIds = parseExcludedIds(query.excludeIds);

  return {
    ...(query.categoryId === undefined
      ? {}
      : { categoryId: parseCategoryId(singleQueryValue('categoryId', query.categoryId)) }),
    ...(query.condition === undefined
      ? {}
      : { condition: parseCondition(singleQueryValue('condition', query.condition)) }),
    ...(excludeIds === undefined ? {} : { excludeIds }),
    limit: parsePositiveInteger('limit', query.limit, 12, 50),
    ...(maxPrice === undefined ? {} : { maxPrice }),
    ...(minPrice === undefined ? {} : { minPrice }),
    page: parsePositiveInteger('page', query.page, 1, 1_000_000),
    ...(search === undefined ? {} : { search }),
    sort: parseSort(query.sort === undefined ? undefined : singleQueryValue('sort', query.sort)),
    ...(query.status === undefined
      ? {}
      : { status: parseDiscoveryStatus(singleQueryValue('status', query.status)) }),
  };
};
