import { ValidationError } from '../../errors/app-error.js';
import {
  ConversationType,
  type ConversationType as Context,
} from '../../generated/prisma/client.js';
import type { ConversationOpenInput } from './messaging.types.js';
const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid Messaging request.', [{ field, message }]);
};
const object = (v: unknown): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    return fail('body', 'Expected a JSON object.');
  return v as Record<string, unknown>;
};
const uuid = (field: string, v: unknown) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
    ? v.toLowerCase()
    : fail(field, 'Expected a UUID.');
export const parseConversationId = (v: unknown) => uuid('id', v);
export const parseUpdatesQuery = (q: Record<string, unknown>) => {
  const after = q.after === 'start' ? 'start' : uuid('after', q.after);
  const limit = q.limit === undefined ? '100' : q.limit;
  if (typeof limit !== 'string' || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)
    return fail('limit', 'Use a page size between 1 and 100.');
  if (Object.keys(q).some((key) => !['after', 'limit', 'mode', 'floor'].includes(key)))
    return fail('query', 'Unsupported query field.');
  if (q.mode !== undefined && q.mode !== 'recent')
    return fail('mode', 'Use recent reconciliation.');
  return {
    after,
    limit: Number(limit),
    mode: q.mode,
    floor: q.floor === undefined ? undefined : uuid('floor', q.floor),
  };
};
export const parseOpenConversation = (body: unknown): ConversationOpenInput => {
  const input = object(body);
  const extra = Object.keys(input).find(
    (k) => !['contextId', 'contextType', 'targetUserId'].includes(k),
  );
  if (extra) fail(extra, 'This field is not supported.');
  const contextType =
    typeof input.contextType === 'string' &&
    ['DIRECT', 'MARKETPLACE', 'SERVICE', 'TEAMUP'].includes(input.contextType)
      ? (input.contextType as Context)
      : fail('contextType', 'Use DIRECT, MARKETPLACE, SERVICE, or TEAMUP.');
  const contextId =
    contextType === 'DIRECT'
      ? input.contextId === null || input.contextId === undefined
        ? null
        : fail('contextId', 'Direct conversations do not use a context ID.')
      : uuid('contextId', input.contextId);
  return { contextId, contextType, targetUserId: uuid('targetUserId', input.targetUserId) };
};
export const parseMessage = (body: unknown) => {
  const input = object(body);
  if (Object.keys(input).some((k) => !['text', 'clientMessageId'].includes(k)))
    fail('body', 'Only text and optional clientMessageId are supported.');
  if (input.clientMessageId !== undefined) uuid('clientMessageId', input.clientMessageId);
  if (typeof input.text !== 'string') return fail('text', 'Expected text.');
  const text = input.text.trim();
  if (!text.length || text.length > 4000) fail('text', 'Use between 1 and 4000 characters.');
  return text;
};
export const parseClientMessageId = (body: unknown): string | undefined => {
  const input = object(body);
  return input.clientMessageId === undefined
    ? undefined
    : uuid('clientMessageId', input.clientMessageId);
};
export const parseReadReceipt = (body: unknown): string => {
  const input = object(body);
  if (
    Object.keys(input).some((key) => key !== 'readReceipt') ||
    typeof input.readReceipt !== 'string' ||
    !input.readReceipt ||
    input.readReceipt.length > 12000
  )
    return fail('readReceipt', 'Provide the receipt returned with this history page.');
  return input.readReceipt;
};
export const parseInboxQuery = (q: Record<string, unknown>) => {
  const contextType =
    q.contextType === undefined
      ? undefined
      : typeof q.contextType === 'string' &&
          Object.values(ConversationType).includes(q.contextType as Context)
        ? (q.contextType as Context)
        : fail('contextType', 'Use a valid context type.');
  const search =
    q.search === undefined
      ? undefined
      : typeof q.search === 'string' && q.search.trim().length <= 100
        ? q.search.trim()
        : fail('search', 'Use up to 100 characters.');
  if (
    Object.keys(q).some(
      (key) => !['contextType', 'search', 'cursor', 'limit', 'selected'].includes(key),
    )
  )
    fail('query', 'Unsupported query field.');
  if (
    q.cursor !== undefined &&
    (typeof q.cursor !== 'string' || !q.cursor.length || q.cursor.length > 2048)
  )
    fail('cursor', 'Use the supplied inbox cursor.');
  const limit = q.limit === undefined ? 30 : Number(q.limit);
  if (q.limit !== undefined && (typeof q.limit !== 'string' || !/^\d+$/.test(q.limit)))
    fail('limit', 'Use 1 to 50.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) fail('limit', 'Use 1 to 50.');
  return {
    limit,
    ...(q.cursor === undefined ? {} : { cursor: q.cursor as string }),
    ...(q.selected === undefined ? {} : { selected: uuid('selected', q.selected) }),
    ...(contextType === undefined ? {} : { contextType }),
    ...(search === undefined ? {} : { search }),
  };
};
export const parseHistoryQuery = (q: Record<string, unknown>) => {
  const value = q.page === undefined ? '1' : q.page;
  const limitValue = q.limit === undefined ? '50' : q.limit;
  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1 ||
    Number(value) > 1_000_000
  )
    fail('page', 'Use a positive page.');
  if (
    typeof limitValue !== 'string' ||
    !/^\d+$/.test(limitValue) ||
    Number(limitValue) < 1 ||
    Number(limitValue) > 100
  )
    fail('limit', 'Use 1 to 100.');
  if ((Number(value) - 1) * Number(limitValue) > 100_000)
    fail('page', 'Use cursor recovery for deeper history.');
  return { limit: Number(limitValue), page: Number(value) };
};
