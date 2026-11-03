import { ValidationError } from '../../errors/app-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { isPredefinedAvatarId } from './profile-avatars.js';
import type {
  AchievementInput,
  PortfolioLinkInput,
  ProfilePatch,
  SkillInput,
} from './profile.types.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const linkedInHosts = new Set(['linkedin.com', 'www.linkedin.com']);

export const normalizePortfolioUrl = (value: string): string => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error();

  if (linkedInHosts.has(url.hostname.toLowerCase())) {
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 2 || segments[0]?.toLowerCase() !== 'in' || !segments[1]) {
      throw new Error();
    }
    url.protocol = 'https:';
    url.hostname = 'www.linkedin.com';
    url.port = '';
    url.pathname = `/in/${segments[1]}`;
    url.search = '';
    url.hash = '';
  }

  return url.toString();
};

const requireObject = (body: unknown): Record<string, unknown> => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('The request body must be a JSON object.', [
      { field: 'body', message: 'Expected a JSON object.' },
    ]);
  }

  return body as Record<string, unknown>;
};

const rejectUnknownFields = (
  body: Record<string, unknown>,
  allowedFields: readonly string[],
): void => {
  const unknownField = Object.keys(body).find((field) => !allowedFields.includes(field));

  if (unknownField !== undefined) {
    throw new ValidationError('The request contains an unsupported field.', [
      { field: unknownField, message: 'This field cannot be modified.' },
    ]);
  }
};

const parseRequiredString = (
  field: string,
  value: unknown,
  minimum: number,
  maximum: number,
): string => {
  if (typeof value !== 'string') {
    throw new ValidationError(`A valid ${field} is required.`, [
      { field, message: `Expected a string between ${minimum} and ${maximum} characters.` },
    ]);
  }

  const normalized = value.trim();

  if (normalized.length < minimum || normalized.length > maximum) {
    throw new ValidationError(`A valid ${field} is required.`, [
      { field, message: `Must contain between ${minimum} and ${maximum} characters.` },
    ]);
  }

  return normalized;
};

const parseNullableString = (field: string, value: unknown, maximum: number): string | null => {
  if (value === null || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }

  return parseRequiredString(field, value, 1, maximum);
};

export const parseUuid = (field: string, value: unknown): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new ValidationError(`A valid ${field} is required.`, [
      { field, message: 'Expected a UUID.' },
    ]);
  }

  return value;
};

const parseProficiency = (value: unknown): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw new ValidationError('A valid proficiency is required.', [
      { field: 'proficiency', message: 'Must be an integer between 1 and 5 or null.' },
    ]);
  }

  return value as number;
};

const parseDate = (field: string, value: unknown): Date | null => {
  if (value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string' || !datePattern.test(value)) {
    throw new ValidationError(`A valid ${field} is required.`, [
      { field, message: 'Expected an ISO date in YYYY-MM-DD format.' },
    ]);
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`A valid ${field} is required.`, [
      { field, message: 'Expected a real calendar date.' },
    ]);
  }

  return date;
};

export const parseProfilePatch = (body: unknown): ProfilePatch => {
  const input = requireObject(body);
  const allowedFields = [
    'academicYear',
    'avatar',
    'bio',
    'department',
    'departmentId',
    'displayName',
    'fullName',
    'location',
    'year',
  ];
  rejectUnknownFields(input, allowedFields);

  if (Object.keys(input).length === 0) {
    throw new ValidationError('At least one profile field is required.', [
      { field: 'body', message: 'Provide at least one editable profile field.' },
    ]);
  }

  const patch: {
    academicYear?: number | null;
    avatar?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    bio?: string | null;
    department?: string | null;
    fullName?: string;
    location?: string | null;
  } = {};

  if ('displayName' in input && 'fullName' in input) {
    throw new ValidationError('Use only one name field.', [
      { field: 'fullName', message: 'Do not combine fullName with displayName.' },
    ]);
  }
  if ('displayName' in input)
    patch.fullName = parseRequiredString('displayName', input.displayName, 2, 120);
  if ('fullName' in input) patch.fullName = parseRequiredString('fullName', input.fullName, 2, 120);
  if ('bio' in input) patch.bio = parseNullableString('bio', input.bio, 1000);
  if ('department' in input && 'departmentId' in input) {
    throw new ValidationError('Use only one department field.', [
      { field: 'department', message: 'Do not combine department with departmentId.' },
    ]);
  }
  if ('department' in input)
    patch.department = parseNullableString('department', input.department, 120);
  if ('departmentId' in input)
    patch.department = parseNullableString('departmentId', input.departmentId, 120);
  if ('location' in input) patch.location = parseNullableString('location', input.location, 180);
  if ('avatar' in input) {
    if (input.avatar === null) patch.avatar = Prisma.JsonNull;
    else {
      const avatar = requireObject(input.avatar);
      rejectUnknownFields(avatar, ['id', 'type']);
      if (avatar.type !== 'predefined' || !isPredefinedAvatarId(avatar.id)) {
        throw new ValidationError('A valid predefined avatar is required.', [
          { field: 'avatar', message: 'Select an avatar from the supported catalog.' },
        ]);
      }
      patch.avatar = { id: avatar.id, type: 'predefined' };
    }
  }
  if ('year' in input && 'academicYear' in input) {
    throw new ValidationError('Use only one academic year field.', [
      { field: 'academicYear', message: 'Do not combine academicYear with year.' },
    ]);
  }
  const academicYear = 'academicYear' in input ? input.academicYear : input.year;
  if ('year' in input || 'academicYear' in input) {
    if (academicYear === null || academicYear === '') {
      patch.academicYear = null;
    } else if (
      !Number.isInteger(academicYear) ||
      (academicYear as number) < 1 ||
      (academicYear as number) > 10
    ) {
      throw new ValidationError('A valid year is required.', [
        { field: 'year', message: 'Must be an integer between 1 and 10 or null.' },
      ]);
    } else {
      patch.academicYear = academicYear as number;
    }
  }

  return patch;
};

export const parseSkillInput = (body: unknown): SkillInput => {
  const input = requireObject(body);
  rejectUnknownFields(input, ['name', 'proficiency']);
  return {
    name: parseRequiredString('name', input.name, 2, 80),
    proficiency: parseProficiency(input.proficiency),
  };
};

export const parseSkillPatch = (body: unknown): Pick<SkillInput, 'proficiency'> => {
  const input = requireObject(body);
  rejectUnknownFields(input, ['proficiency']);

  if (!('proficiency' in input)) {
    throw new ValidationError('Proficiency is required.', [
      { field: 'proficiency', message: 'Provide a value between 1 and 5 or null.' },
    ]);
  }

  return { proficiency: parseProficiency(input.proficiency) };
};

export const parseInterestInput = (body: unknown): { readonly name: string } => {
  const input = requireObject(body);
  rejectUnknownFields(input, ['name']);
  return { name: parseRequiredString('name', input.name, 2, 80) };
};

export const parseAchievementInput = (body: unknown, partial: boolean): AchievementInput => {
  const input = requireObject(body);
  rejectUnknownFields(input, ['awardedAt', 'description', 'title']);

  if (partial && Object.keys(input).length === 0) {
    throw new ValidationError('At least one achievement field is required.', [
      { field: 'body', message: 'Provide an achievement field to update.' },
    ]);
  }

  if (!partial && !('title' in input)) {
    throw new ValidationError('Achievement title is required.', [
      { field: 'title', message: 'Provide an achievement title.' },
    ]);
  }

  const result: { awardedAt?: Date | null; description?: string | null; title?: string } = {};
  if ('title' in input) result.title = parseRequiredString('title', input.title, 2, 160);
  if ('description' in input)
    result.description = parseNullableString('description', input.description, 1000);
  if ('awardedAt' in input) result.awardedAt = parseDate('awardedAt', input.awardedAt);
  return result;
};

export const parsePortfolioInput = (body: unknown, partial: boolean): PortfolioLinkInput => {
  const input = requireObject(body);
  rejectUnknownFields(input, ['label', 'sortOrder', 'url']);

  if (partial && Object.keys(input).length === 0) {
    throw new ValidationError('At least one portfolio field is required.', [
      { field: 'body', message: 'Provide a portfolio field to update.' },
    ]);
  }

  if (!partial && (!('label' in input) || !('url' in input))) {
    throw new ValidationError('Portfolio label and URL are required.', [
      { field: 'body', message: 'Provide both label and url.' },
    ]);
  }

  const result: { label?: string; sortOrder?: number; url?: string } = {};
  if ('label' in input) result.label = parseRequiredString('label', input.label, 1, 80);
  if ('url' in input) {
    const urlValue = parseRequiredString('url', input.url, 1, 2048);

    try {
      result.url = normalizePortfolioUrl(urlValue);
    } catch {
      throw new ValidationError('A valid portfolio or LinkedIn profile URL is required.', [
        {
          field: 'url',
          message: 'Use an absolute HTTP(S) URL. LinkedIn links must be profile URLs under /in/.',
        },
      ]);
    }
  }
  if ('sortOrder' in input) {
    if (
      !Number.isInteger(input.sortOrder) ||
      (input.sortOrder as number) < 0 ||
      (input.sortOrder as number) > 10_000
    ) {
      throw new ValidationError('A valid sort order is required.', [
        { field: 'sortOrder', message: 'Must be an integer between 0 and 10000.' },
      ]);
    }
    result.sortOrder = input.sortOrder as number;
  }

  return result;
};
