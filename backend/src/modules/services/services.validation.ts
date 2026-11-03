import { ValidationError } from '../../errors/app-error.js';
import {
  ServiceStatus,
  type ServiceStatus as ServiceStatusValue,
} from '../../generated/prisma/client.js';
import type {
  PricingType,
  ServiceCreateInput,
  ServiceQuery,
  ServiceUpdateInput,
} from './services.types.js';
const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid Services request.', [{ field, message }]);
};
const obj = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail('body', 'Expected a JSON object.');
  return value as Record<string, unknown>;
};
const unknown = (input: Record<string, unknown>, allowed: readonly string[]) => {
  const field = Object.keys(input).find((key) => !allowed.includes(key));
  if (field) fail(field, 'This field is not supported.');
};
const text = (field: string, value: unknown, min: number, max: number) => {
  if (typeof value !== 'string') return fail(field, 'Expected a string.');
  const result = value.trim();
  if (result.length < min || result.length > max)
    return fail(field, `Use between ${min} and ${max} characters.`);
  return result;
};
const nullable = (field: string, value: unknown, max: number) =>
  value === null || value === '' ? null : text(field, value, 1, max);
const boolean = (field: string, value: unknown): boolean => {
  if (typeof value !== 'boolean') return fail(field, 'Expected a Boolean.');
  return value;
};
const types: readonly PricingType[] = ['FREE', 'FIXED', 'NEGOTIABLE'];
const pricing = (
  pricingType: unknown,
  price: unknown,
): { pricingType: PricingType; price: string | null } => {
  if (typeof pricingType !== 'string' || !types.includes(pricingType as PricingType))
    return fail('pricingType', 'Use FREE, FIXED, or NEGOTIABLE.');
  if (pricingType === 'FREE') {
    if (price !== null && price !== '' && price !== 0 && price !== '0')
      fail('price', 'Free services cannot have a payable price.');
    return { price: '0', pricingType };
  }
  if (pricingType === 'NEGOTIABLE') {
    if (price !== null && price !== '')
      fail('price', 'Negotiable services cannot have a fixed price.');
    return { price: null, pricingType };
  }
  if (
    (typeof price !== 'string' && typeof price !== 'number') ||
    !/^\d+(\.\d{1,2})?$/.test(String(price)) ||
    Number(price) <= 0 ||
    Number(price) > 10_000_000
  )
    return fail('price', 'Use a positive fixed price with at most two decimal places.');
  return { price: Number(price).toFixed(2), pricingType: pricingType as PricingType };
};
const skills = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 12) return fail('skills', 'Provide up to 12 skills.');
  const result = value.map((item) => text('skills', item, 1, 50));
  if (new Set(result.map((item) => item.toLowerCase())).size !== result.length)
    return fail('skills', 'Skills must be unique.');
  return result;
};
export const parseServiceId = (field: string, value: unknown) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : fail(field, 'Expected a UUID.');
export const parseServiceCreate = (body: unknown): ServiceCreateInput => {
  const input = obj(body);
  const fields = [
    'category',
    'description',
    'featuredOnLanding',
    'location',
    'price',
    'pricingType',
    'skills',
    'title',
  ] as const;
  unknown(input, fields);
  for (const field of fields.filter((field) => field !== 'featuredOnLanding'))
    if (!(field in input)) fail(field, 'This field is required.');
  return {
    category: text('category', input.category, 2, 100),
    description: text('description', input.description, 20, 5000),
    featuredOnLanding:
      'featuredOnLanding' in input ? boolean('featuredOnLanding', input.featuredOnLanding) : false,
    location: nullable('location', input.location, 180),
    ...pricing(input.pricingType, input.price),
    skills: skills(input.skills),
    title: text('title', input.title, 3, 180),
  };
};
export const parseServiceUpdate = (body: unknown): ServiceUpdateInput => {
  const input = obj(body);
  const fields = [
    'category',
    'description',
    'featuredOnLanding',
    'location',
    'price',
    'pricingType',
    'skills',
    'title',
  ] as const;
  unknown(input, fields);
  if (!Object.keys(input).length) fail('body', 'Provide at least one field.');
  const hasPricing = 'pricingType' in input || 'price' in input;
  if (hasPricing && (!('pricingType' in input) || !('price' in input)))
    fail('pricingType', 'Provide pricingType and price together.');
  return {
    ...('category' in input ? { category: text('category', input.category, 2, 100) } : {}),
    ...('description' in input
      ? { description: text('description', input.description, 20, 5000) }
      : {}),
    ...('featuredOnLanding' in input
      ? { featuredOnLanding: boolean('featuredOnLanding', input.featuredOnLanding) }
      : {}),
    ...('location' in input ? { location: nullable('location', input.location, 180) } : {}),
    ...(hasPricing ? pricing(input.pricingType, input.price) : {}),
    ...('skills' in input ? { skills: skills(input.skills) } : {}),
    ...('title' in input ? { title: text('title', input.title, 3, 180) } : {}),
  };
};
export const parseServiceQuery = (query: Record<string, unknown>): ServiceQuery => {
  unknown(query, [
    'category',
    'limit',
    'maxPrice',
    'minPrice',
    'page',
    'pricingType',
    'search',
    'sort',
    'status',
  ]);
  const integer = (field: string, fallback: number, max: number) => {
    const value = query[field];
    if (value === undefined) return fallback;
    if (
      typeof value !== 'string' ||
      !/^\d+$/.test(value) ||
      Number(value) < 1 ||
      Number(value) > max
    )
      return fail(field, `Use an integer between 1 and ${max}.`);
    return Number(value);
  };
  const money = (field: string) => {
    const value = query[field];
    if (value === undefined) return undefined;
    if (
      typeof value !== 'string' ||
      !/^\d{1,8}(\.\d{1,2})?$/.test(value) ||
      Number(value) > 10_000_000
    )
      return fail(field, 'Use a valid non-negative amount.');
    return value;
  };
  const pricingType =
    query.pricingType === undefined
      ? undefined
      : (text('pricingType', query.pricingType, 1, 20) as PricingType);
  if (pricingType && !types.includes(pricingType)) fail('pricingType', 'Use a valid pricing type.');
  const status =
    query.status === undefined
      ? undefined
      : (text('status', query.status, 1, 20) as ServiceStatusValue);
  if (status && !Object.values(ServiceStatus).includes(status))
    fail('status', 'Use a valid service status.');
  const sort = query.sort === undefined ? 'newest' : text('sort', query.sort, 1, 20);
  if (!['newest', 'oldest', 'price_asc', 'price_desc'].includes(sort))
    fail('sort', 'Use a valid sort.');
  const maxPrice = money('maxPrice');
  const minPrice = money('minPrice');
  if (minPrice !== undefined && maxPrice !== undefined && Number(minPrice) > Number(maxPrice))
    fail('minPrice', 'Minimum price cannot exceed maximum price.');
  if (pricingType === 'NEGOTIABLE' && (minPrice !== undefined || maxPrice !== undefined))
    fail('pricingType', 'Negotiable prices cannot be combined with numeric bounds.');
  if (pricingType === 'FREE' && Number(minPrice ?? 0) > 0)
    fail('minPrice', 'Free services require a range including zero.');
  if (pricingType === 'FIXED' && maxPrice !== undefined && Number(maxPrice) === 0)
    fail('maxPrice', 'Fixed prices must be greater than zero.');
  return {
    ...(query.category === undefined ? {} : { category: text('category', query.category, 1, 100) }),
    limit: integer('limit', 12, 50),
    ...(maxPrice === undefined ? {} : { maxPrice }),
    ...(minPrice === undefined ? {} : { minPrice }),
    page: integer('page', 1, 1_000_000),
    ...(pricingType ? { pricingType } : {}),
    ...(query.search === undefined ? {} : { search: text('search', query.search, 1, 100) }),
    sort: sort as ServiceQuery['sort'],
    ...(status ? { status } : {}),
  };
};
export const parseRequestCreate = (body: unknown) => {
  const input = obj(body);
  unknown(input, ['message']);
  return nullable('message', input.message, 1000);
};
export const parseRequestDecision = (body: unknown): 'ACCEPTED' | 'REJECTED' => {
  const input = obj(body);
  unknown(input, ['status']);
  return input.status === 'ACCEPTED' || input.status === 'REJECTED'
    ? input.status
    : fail('status', 'Use ACCEPTED or REJECTED.');
};
export const parseServiceStatus = (body: unknown): ServiceStatusValue => {
  const input = obj(body);
  unknown(input, ['status']);
  return input.status === 'ACTIVE' || input.status === 'PAUSED' || input.status === 'ARCHIVED'
    ? input.status
    : fail('status', 'Use ACTIVE, PAUSED, or ARCHIVED.');
};
