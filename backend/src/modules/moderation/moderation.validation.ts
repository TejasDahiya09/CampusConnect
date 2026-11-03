import { ReportReason, ReportStatus } from '../../generated/prisma/client.js';
import { ValidationError } from '../../errors/app-error.js';
import {
  moderationTargetTypes,
  type ModerationDecision,
  type ModerationQuery,
  type ModerationTargetType,
  type ReportSubmission,
} from './moderation.types.js';

const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid moderation request.', [{ field, message }]);
};
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail('body', 'Expected a JSON object.');
  return Object.fromEntries(Object.entries(value));
};
const isReason = (value: unknown): value is ReportReason =>
  typeof value === 'string' && Object.values(ReportReason).some((reason) => reason === value);
const isStatus = (value: unknown): value is ReportStatus =>
  typeof value === 'string' && Object.values(ReportStatus).some((status) => status === value);
const isTargetType = (value: unknown): value is ModerationTargetType =>
  typeof value === 'string' && moderationTargetTypes.some((targetType) => targetType === value);
const isDecisionStatus = (value: unknown): value is ModerationDecision['status'] =>
  value === ReportStatus.UNDER_REVIEW ||
  value === ReportStatus.RESOLVED ||
  value === ReportStatus.DISMISSED;
const uuid = (field: string, value: unknown) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : fail(field, 'Expected a UUID.');
const boundedText = (field: string, value: unknown, maximum: number, required = false) => {
  if (!required && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string') return fail(field, 'Expected text.');
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if ((required && !normalized) || normalized.length > maximum)
    return fail(field, `Use ${required ? `1 to ${maximum}` : `up to ${maximum}`} characters.`);
  return normalized;
};
const exactKeys = (body: Record<string, unknown>, allowed: readonly string[]) => {
  const unknown = Object.keys(body).find((key) => !allowed.includes(key));
  if (unknown) fail(unknown, 'Unsupported field.');
};

export const parseReportSubmission = (value: unknown): ReportSubmission => {
  const body = record(value);
  exactKeys(body, ['description', 'reason', 'targetId', 'targetType']);
  const targetType = isTargetType(body.targetType)
    ? body.targetType
    : fail('targetType', 'Unsupported report target.');
  const reason = isReason(body.reason) ? body.reason : fail('reason', 'Unsupported report reason.');
  return {
    description: boundedText('description', body.description, 1000),
    reason,
    targetId: uuid('targetId', body.targetId),
    targetType,
  };
};

export const parseModerationDecision = (value: unknown): ModerationDecision => {
  const body = record(value);
  exactKeys(body, ['resolutionNote', 'status']);
  const status = isDecisionStatus(body.status)
    ? body.status
    : fail('status', 'Use UNDER_REVIEW, RESOLVED, or DISMISSED.');
  return {
    resolutionNote: boundedText('resolutionNote', body.resolutionNote, 1000, true) ?? '',
    status,
  };
};

export const parseModerationQuery = (query: Record<string, unknown>): ModerationQuery => {
  const allowed = ['limit', 'page', 'reason', 'search', 'status', 'targetType'];
  exactKeys(query, allowed);
  const page = Number(query.page ?? 1),
    limit = Number(query.limit ?? 20);
  if (!Number.isInteger(page) || page < 1) fail('page', 'Use a positive integer.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail('limit', 'Use 1 to 50.');
  const status =
    query.status === undefined
      ? undefined
      : isStatus(query.status)
        ? query.status
        : fail('status', 'Unsupported status.');
  const reason =
    query.reason === undefined
      ? undefined
      : isReason(query.reason)
        ? query.reason
        : fail('reason', 'Unsupported reason.');
  const targetType =
    query.targetType === undefined
      ? undefined
      : isTargetType(query.targetType)
        ? query.targetType
        : fail('targetType', 'Unsupported target type.');
  return {
    limit,
    page,
    reason,
    search: boundedText('search', query.search, 100) ?? undefined,
    status,
    targetType,
  };
};
