import { ValidationError } from '../../errors/app-error.js';
const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid notification request.', [{ field, message }]);
};
export const notificationId = (value: unknown) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : fail('id', 'Expected a UUID.');
export const notificationQuery = (query: Record<string, unknown>) => {
  const rawPage = query.page ?? '1',
    rawLimit = query.limit ?? '20';
  if (
    typeof rawPage !== 'string' ||
    !/^\d+$/.test(rawPage) ||
    !Number.isSafeInteger(Number(rawPage)) ||
    Number(rawPage) < 1
  )
    fail('page', 'Use a positive integer.');
  if (
    typeof rawLimit !== 'string' ||
    !/^\d+$/.test(rawLimit) ||
    Number(rawLimit) < 1 ||
    Number(rawLimit) > 50
  )
    fail('limit', 'Use 1 to 50.');
  if (!Number.isSafeInteger((Number(rawPage) - 1) * Number(rawLimit)))
    fail('page', 'Use a page with a safe integer offset.');
  const unread =
    query.unread === undefined
      ? false
      : query.unread === 'true'
        ? true
        : query.unread === 'false'
          ? false
          : fail('unread', 'Use true or false.');
  return { limit: Number(rawLimit), page: Number(rawPage), unread };
};
