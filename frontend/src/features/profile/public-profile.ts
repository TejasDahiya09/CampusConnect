import { ApiClientError } from '../../services/api-client';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidPublicProfileId = (value: string): boolean => uuidPattern.test(value);

export const publicProfileErrorMessage = (reason: unknown): string =>
  reason instanceof ApiClientError && reason.status === 404
    ? 'This student profile was not found.'
    : reason instanceof Error
      ? reason.message
      : 'The public profile could not be loaded.';
