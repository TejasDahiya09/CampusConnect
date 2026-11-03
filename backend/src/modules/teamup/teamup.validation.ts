import { ValidationError } from '../../errors/app-error.js';
import {
  ProjectStatus,
  type ProjectStatus as ProjectStatusValue,
} from '../../generated/prisma/client.js';
import type { TeamUpCreateInput, TeamUpQuery, TeamUpUpdateInput } from './teamup.types.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid TeamUp request.', [{ field, message }]);
};
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail('body', 'Expected a JSON object.');
  return value as Record<string, unknown>;
};
const rejectUnknown = (input: Record<string, unknown>, allowed: readonly string[]) => {
  const field = Object.keys(input).find((key) => !allowed.includes(key));
  if (field) fail(field, 'This field is not supported.');
};
const text = (field: string, value: unknown, min: number, max: number): string => {
  if (typeof value !== 'string') return fail(field, 'Expected a string.');
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max)
    return fail(field, `Use between ${min} and ${max} characters.`);
  return normalized;
};
const optionalText = (field: string, value: unknown, max: number): string | null =>
  value === null || value === '' ? null : text(field, value, 1, max);
const date = (field: string, value: unknown): Date | null => {
  if (value === null || value === '') return null;
  const normalized = text(field, value, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return fail(field, 'Use YYYY-MM-DD.');
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized)
    return fail(field, 'Use a real calendar date.');
  return parsed;
};
const capacity = (value: unknown): number => {
  if (!Number.isInteger(value) || Number(value) < 2 || Number(value) > 20)
    return fail('maxMembers', 'Use an integer between 2 and 20.');
  return Number(value);
};
const boolean = (field: string, value: unknown): boolean => {
  if (typeof value !== 'boolean') return fail(field, 'Expected a Boolean.');
  return value;
};
const skills = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.length > 12)
    return fail('requiredSkills', 'Provide up to 12 skills.');
  const result = value.map((item) => text('requiredSkills', item, 1, 50));
  if (new Set(result.map((item) => item.toLowerCase())).size !== result.length)
    return fail('requiredSkills', 'Skills must be unique.');
  return result;
};

export const parseTeamUpId = (field: string, value: unknown): string => {
  if (typeof value !== 'string' || !uuid.test(value)) return fail(field, 'Expected a UUID.');
  return value;
};

export const parseTeamUpCreate = (body: unknown): TeamUpCreateInput => {
  const input = object(body);
  const fields = [
    'category',
    'deadline',
    'description',
    'featuredOnLanding',
    'maxMembers',
    'requiredSkills',
    'title',
  ] as const;
  rejectUnknown(input, fields);
  for (const field of fields.filter((field) => field !== 'featuredOnLanding'))
    if (!(field in input)) fail(field, 'This field is required.');
  return {
    category: optionalText('category', input.category, 100),
    deadline: date('deadline', input.deadline),
    description: text('description', input.description, 20, 5000),
    featuredOnLanding:
      'featuredOnLanding' in input ? boolean('featuredOnLanding', input.featuredOnLanding) : false,
    maxMembers: capacity(input.maxMembers),
    requiredSkills: skills(input.requiredSkills),
    title: text('title', input.title, 3, 180),
  };
};

export const parseTeamUpUpdate = (body: unknown): TeamUpUpdateInput => {
  const input = object(body);
  const fields = [
    'category',
    'deadline',
    'description',
    'featuredOnLanding',
    'maxMembers',
    'requiredSkills',
    'title',
  ] as const;
  rejectUnknown(input, fields);
  if (Object.keys(input).length === 0) fail('body', 'Provide at least one field.');
  return {
    ...('category' in input ? { category: optionalText('category', input.category, 100) } : {}),
    ...('deadline' in input ? { deadline: date('deadline', input.deadline) } : {}),
    ...('description' in input
      ? { description: text('description', input.description, 20, 5000) }
      : {}),
    ...('featuredOnLanding' in input
      ? { featuredOnLanding: boolean('featuredOnLanding', input.featuredOnLanding) }
      : {}),
    ...('maxMembers' in input ? { maxMembers: capacity(input.maxMembers) } : {}),
    ...('requiredSkills' in input ? { requiredSkills: skills(input.requiredSkills) } : {}),
    ...('title' in input ? { title: text('title', input.title, 3, 180) } : {}),
  };
};

export const parseTeamUpQuery = (query: Record<string, unknown>): TeamUpQuery => {
  rejectUnknown(query, ['keyword', 'limit', 'page', 'skill', 'sort', 'status']);
  const integer = (field: string, fallback: number, max: number) => {
    const value = query[field];
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value))
      return fail(field, `Use an integer between 1 and ${max}.`);
    const parsed = Number(value);
    if (parsed < 1 || parsed > max) return fail(field, `Use an integer between 1 and ${max}.`);
    return parsed;
  };
  const status =
    query.status === undefined
      ? undefined
      : (text('status', query.status, 1, 20) as ProjectStatusValue);
  if (status !== undefined && !Object.values(ProjectStatus).includes(status))
    fail('status', 'Use a valid project status.');
  const sort = query.sort === undefined ? 'newest' : text('sort', query.sort, 1, 20);
  if (!['deadline', 'newest', 'oldest'].includes(sort))
    fail('sort', 'Use deadline, newest, or oldest.');
  return {
    ...(query.keyword === undefined ? {} : { keyword: text('keyword', query.keyword, 1, 100) }),
    limit: integer('limit', 12, 50),
    page: integer('page', 1, 1_000_000),
    ...(query.skill === undefined ? {} : { skill: text('skill', query.skill, 1, 50) }),
    sort: sort as TeamUpQuery['sort'],
    ...(status === undefined ? {} : { status }),
  };
};

export const parseApplicationCreate = (body: unknown): string | null => {
  const input = object(body);
  rejectUnknown(input, ['message']);
  return optionalText('message', input.message, 1000);
};

export const parseApplicationReview = (body: unknown): 'ACCEPTED' | 'REJECTED' => {
  const input = object(body);
  rejectUnknown(input, ['status']);
  return text('status', input.status, 1, 20) === 'ACCEPTED'
    ? 'ACCEPTED'
    : input.status === 'REJECTED'
      ? 'REJECTED'
      : fail('status', 'Use ACCEPTED or REJECTED.');
};

export const parseProjectTransition = (body: unknown): ProjectStatusValue => {
  const input = object(body);
  rejectUnknown(input, ['status']);
  const status = text('status', input.status, 1, 20) as ProjectStatusValue;
  if (!Object.values(ProjectStatus).includes(status)) fail('status', 'Use a valid project status.');
  return status;
};
