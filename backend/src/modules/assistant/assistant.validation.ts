import { ValidationError } from '../../errors/app-error.js';
import {
  assistantSourceTypes,
  type AssistantRetrievalQuery,
  type AssistantSourceType,
} from './assistant.types.js';

const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid assistant retrieval request.', [{ field, message }]);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isUnknownArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

const single = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return fail(field, 'Expected one value.');
  return value;
};

export const parseAssistantRetrievalQuery = (
  input: Record<string, unknown>,
): AssistantRetrievalQuery => {
  const unknown = Object.keys(input).find((key) => !['q', 'types'].includes(key));
  if (unknown !== undefined) fail(unknown, 'Unsupported retrieval parameter.');

  const question = (single(input.q, 'q') ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (question.length < 2) fail('q', 'Use at least 2 characters.');
  if (question.length > 300) fail('q', 'Use at most 300 characters.');

  const rawTypes = single(input.types, 'types');
  const sourceTypes: AssistantSourceType[] = [];
  for (const rawType of rawTypes?.split(',') ?? assistantSourceTypes) {
    const normalized = rawType.trim().toUpperCase();
    const sourceType = assistantSourceTypes.find((candidate) => candidate === normalized);
    if (sourceType === undefined)
      return fail('types', 'Use MARKETPLACE, LOST_FOUND, TEAMUP, or SERVICE.');
    if (!sourceTypes.includes(sourceType)) sourceTypes.push(sourceType);
  }
  if (sourceTypes.length === 0) fail('types', 'Select at least one source type.');

  return { question, sourceTypes };
};

export const parseAssistantAskBody = (input: unknown): AssistantRetrievalQuery => {
  if (!isRecord(input)) return fail('body', 'Expected an object.');
  const body = input;
  const unknown = Object.keys(body).find(
    (key) => !['question', 'sourceTypes', 'history'].includes(key),
  );
  if (unknown !== undefined) fail(unknown, 'Unsupported assistant parameter.');
  const rawQuestion = body.question;
  if (typeof rawQuestion !== 'string') return fail('question', 'Expected a string.');
  const question = rawQuestion.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (question.length < 2) fail('question', 'Use at least 2 characters.');
  if (question.length > 300) fail('question', 'Use at most 300 characters.');
  const suppliedTypes = body.sourceTypes;
  if (suppliedTypes !== undefined && !isUnknownArray(suppliedTypes))
    return fail('sourceTypes', 'Expected an array.');
  const rawTypes = suppliedTypes ?? assistantSourceTypes;
  const sourceTypes: AssistantSourceType[] = [];
  for (const rawType of rawTypes) {
    if (typeof rawType !== 'string') return fail('sourceTypes', 'Expected source type strings.');
    const normalized = rawType.trim().toUpperCase();
    const sourceType = assistantSourceTypes.find((candidate) => candidate === normalized);
    if (sourceType === undefined)
      return fail('sourceTypes', 'Use MARKETPLACE, LOST_FOUND, TEAMUP, or SERVICE.');
    if (sourceTypes.includes(sourceType)) fail('sourceTypes', 'Source types must be unique.');
    sourceTypes.push(sourceType);
  }
  if (sourceTypes.length === 0) fail('sourceTypes', 'Select at least one source type.');
  if (
    body.history !== undefined &&
    (!isUnknownArray(body.history) ||
      body.history.length > 4 ||
      body.history.some((item) => typeof item !== 'string' || item.length > 300))
  )
    return fail('history', 'Use at most four previous questions of at most 300 characters.');
  const history = body.history as readonly string[] | undefined;
  return { question, sourceTypes, ...(history === undefined ? {} : { history }) };
};
