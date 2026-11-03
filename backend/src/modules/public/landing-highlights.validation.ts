import { ValidationError } from '../../errors/app-error.js';

const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid public highlights request.', [{ field, message }]);
};

export const parseLandingHighlightsQuery = (query: Record<string, unknown>): number => {
  const unsupported = Object.keys(query).find((key) => key !== 'limit');
  if (unsupported !== undefined) fail(unsupported, 'This query parameter is not supported.');
  if (query.limit === undefined) return 8;
  if (Array.isArray(query.limit) || typeof query.limit !== 'string' || !/^\d+$/.test(query.limit))
    return fail('limit', 'Use an integer between 1 and 8.');
  const limit = Number(query.limit);
  if (limit < 1 || limit > 8) return fail('limit', 'Use an integer between 1 and 8.');
  return limit;
};
