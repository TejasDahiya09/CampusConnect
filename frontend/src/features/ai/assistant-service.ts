import { ApiClientError, apiRequest } from '../../services/api-client';
import {
  assistantSourceTypes,
  type AskAssistantInput,
  type AssistantAnswer,
  type AssistantCitation,
  type AssistantResponseType,
  type AssistantSourceType,
  type AssistantStatus,
} from './assistant.types';

const REQUEST_TIMEOUT_MS = 30_000;
const actionRoutes = new Set([
  '/home',
  '/marketplace',
  '/marketplace/new',
  '/marketplace/saved',
  '/lost-found',
  '/lost-found/new?type=lost',
  '/lost-found/new?type=found',
  '/teamup',
  '/teamup/new',
  '/services',
  '/services/new',
  '/messages',
  '/profile',
]);
const routePrefixes: Readonly<Record<AssistantSourceType, string>> = {
  LOST_FOUND: '/lost-found/',
  MARKETPLACE: '/marketplace/',
  SERVICE: '/services/',
  TEAMUP: '/teamup/',
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isSourceType = (value: unknown): value is AssistantSourceType =>
  assistantSourceTypes.some((sourceType) => sourceType === value);
const isStatus = (value: unknown): value is AssistantStatus =>
  value === 'answered' ||
  value === 'insufficient_evidence' ||
  value === 'unsupported' ||
  value === 'unavailable';
const isRetrievalMode = (
  value: unknown,
): value is 'insufficient_evidence' | 'lexical_fallback' | 'semantic' =>
  value === 'insufficient_evidence' || value === 'lexical_fallback' || value === 'semantic';
const isResponseType = (value: unknown): value is AssistantResponseType =>
  value === 'conversation' ||
  value === 'grounded' ||
  value === 'platform_knowledge' ||
  value === 'system';

const isCitation = (value: unknown): value is AssistantCitation =>
  isRecord(value) &&
  hasExactKeys(value, [
    'route',
    'sourceId',
    'sourceType',
    'title',
    ...(value.details === undefined ? [] : ['details']),
  ]) &&
  (value.details === undefined ||
    (typeof value.details === 'string' && value.details.length <= 240)) &&
  typeof value.sourceId === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value.sourceId) &&
  isSourceType(value.sourceType) &&
  typeof value.title === 'string' &&
  value.title.length > 0 &&
  value.title.length <= 180 &&
  typeof value.route === 'string' &&
  value.route === `${routePrefixes[value.sourceType]}${value.sourceId}`;

export const parseAssistantAnswer = (value: unknown): AssistantAnswer => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      ...(value.actions === undefined ? [] : ['actions']),
      'answer',
      'citations',
      'contractVersion',
      'errorCode',
      'model',
      'provider',
      'retrievalMode',
      'responseType',
      'status',
    ]) ||
    value.contractVersion !== 'campus-assistant-grounded-v1' ||
    typeof value.answer !== 'string' ||
    value.answer.length < 1 ||
    value.answer.length > 4000 ||
    !isStatus(value.status) ||
    !Array.isArray(value.citations) ||
    value.citations.length > 10 ||
    !value.citations.every(isCitation) ||
    (value.provider !== null && value.provider !== 'gemini') ||
    (value.model !== null && typeof value.model !== 'string') ||
    (value.provider === null) !== (value.model === null) ||
    (value.errorCode !== null && typeof value.errorCode !== 'string') ||
    (value.retrievalMode !== null && !isRetrievalMode(value.retrievalMode)) ||
    !isResponseType(value.responseType)
  ) {
    throw new ApiClientError(
      'INVALID_ASSISTANT_RESPONSE',
      'The Campus Assistant returned an invalid response.',
      502,
    );
  }
  if (
    value.actions !== undefined &&
    (!Array.isArray(value.actions) ||
      value.actions.length > 4 ||
      !value.actions.every(
        (item: unknown) =>
          isRecord(item) &&
          hasExactKeys(item, ['label', 'route']) &&
          typeof item.label === 'string' &&
          item.label.length > 0 &&
          item.label.length <= 60 &&
          typeof item.route === 'string' &&
          actionRoutes.has(item.route),
      ))
  )
    throw new ApiClientError(
      'INVALID_ASSISTANT_RESPONSE',
      'The Campus Assistant returned unsafe navigation.',
      502,
    );

  const citationIds = value.citations.map(({ sourceId }) => sourceId);
  const deterministic =
    value.responseType === 'conversation' || value.responseType === 'platform_knowledge';
  if (
    citationIds.length !== new Set(citationIds).size ||
    (value.status === 'answered' &&
      value.responseType === 'grounded' &&
      citationIds.length === 0) ||
    (value.responseType !== 'grounded' && citationIds.length > 0) ||
    (value.responseType === 'grounded' && value.status !== 'answered') ||
    (deterministic &&
      (value.status !== 'answered' ||
        value.provider !== null ||
        value.model !== null ||
        value.retrievalMode !== null)) ||
    (value.status !== 'answered' && citationIds.length > 0) ||
    (value.status === 'unavailable' ? value.errorCode === null : value.errorCode !== null)
  ) {
    throw new ApiClientError(
      'INVALID_ASSISTANT_RESPONSE',
      'The Campus Assistant returned an invalid response.',
      502,
    );
  }

  return {
    ...(value.actions === undefined
      ? {}
      : { actions: value.actions as { label: string; route: string }[] }),
    answer: value.answer,
    citations: value.citations,
    contractVersion: value.contractVersion,
    errorCode: value.errorCode,
    model: value.model,
    provider: value.provider,
    retrievalMode: value.retrievalMode,
    responseType: value.responseType,
    status: value.status,
  };
};

export const askAssistant = async (
  input: AskAssistantInput,
  request: typeof apiRequest = apiRequest,
): Promise<AssistantAnswer> => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal?.addEventListener('abort', abort, { once: true });
  if (input.signal?.aborted) controller.abort();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const payload = {
      question: input.question,
      ...(input.sourceTypes === undefined ? {} : { sourceTypes: input.sourceTypes }),
      ...(input.history === undefined ? {} : { history: input.history.slice(-4) }),
    };
    return parseAssistantAnswer(
      await request<unknown>('/api/assistant/ask', {
        body: JSON.stringify(payload),
        method: 'POST',
        signal: controller.signal,
      }),
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiClientError(
        'ASSISTANT_TIMEOUT',
        'The Campus Assistant took too long to respond.',
        504,
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    input.signal?.removeEventListener('abort', abort);
  }
};
