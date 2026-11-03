import {
  AccountStatus,
  ListingStatus,
  LostFoundStatus,
  ModerationVisibility,
  ProjectStatus,
  ServiceStatus,
  UserRole,
} from '../../generated/prisma/client.js';
import { ValidationError } from '../../errors/app-error.js';
import type {
  AdminAccountDecision,
  AdminAuditQuery,
  AdminContentQuery,
  AdminContentType,
  AdminEnforcementDecision,
  AdminEnforcementTargetType,
  AdminListQuery,
  AdminUserQuery,
} from './admin.types.js';

const fail = (field: string, message: string): never => {
  throw new ValidationError('Invalid administration request.', [{ field, message }]);
};
const text = (field: string, value: unknown, maximum: number, required = false) => {
  if (!required && (value === undefined || value === '')) return undefined;
  if (typeof value !== 'string') return fail(field, 'Expected text.');
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if ((required && !normalized) || normalized.length > maximum)
    return fail(field, `Use ${required ? `1 to ${maximum}` : `up to ${maximum}`} characters.`);
  return normalized;
};
const pagination = (query: Record<string, unknown>): AdminListQuery => {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  if (!Number.isInteger(page) || page < 1) fail('page', 'Use a positive integer.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail('limit', 'Use 1 to 50.');
  return { limit, page, search: text('search', query.search, 100) };
};
const contentTypes = ['LOST_FOUND', 'MARKETPLACE', 'SERVICE', 'TEAMUP'] as const;
const isContentType = (value: unknown): value is AdminContentType =>
  typeof value === 'string' && contentTypes.some((candidate) => candidate === value);
const enforcementTypes = [...contentTypes, 'PROFILE'] as const;
const isEnforcementType = (value: unknown): value is AdminEnforcementTargetType =>
  typeof value === 'string' && enforcementTypes.some((candidate) => candidate === value);
const uuid = (field: string, value: unknown) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : fail(field, 'Expected a UUID.');

export const parseAdminUserQuery = (query: Record<string, unknown>): AdminUserQuery => {
  const base = pagination(query);
  const role = Object.values(UserRole).find((candidate) => candidate === query.role);
  const status = Object.values(AccountStatus).find((candidate) => candidate === query.status);
  if (query.role !== undefined && !role) fail('role', 'Unsupported role.');
  if (query.status !== undefined && !status) fail('status', 'Unsupported account status.');
  return { ...base, role, status };
};
export const parseAdminContentQuery = (query: Record<string, unknown>): AdminContentQuery => {
  const base = pagination(query);
  const type = isContentType(query.type) ? query.type : fail('type', 'Unsupported content type.');
  const status = text('status', query.status, 40);
  const allowed =
    type === 'MARKETPLACE'
      ? Object.values(ListingStatus)
      : type === 'LOST_FOUND'
        ? Object.values(LostFoundStatus)
        : type === 'TEAMUP'
          ? Object.values(ProjectStatus)
          : Object.values(ServiceStatus);
  const normalizedStatus = allowed.find((candidate) => candidate === status);
  const visibility = Object.values(ModerationVisibility).find(
    (candidate) => candidate === query.visibility,
  );
  if (status && !normalizedStatus) fail('status', 'Unsupported status for this content type.');
  if (query.visibility !== undefined && !visibility) fail('visibility', 'Use VISIBLE or HIDDEN.');
  return { ...base, status: normalizedStatus, type, visibility };
};
export const parseAdminAuditQuery = (query: Record<string, unknown>): AdminAuditQuery => ({
  ...pagination(query),
  event: text('event', query.event, 100),
});
export const parseAccountDecision = (value: unknown): AdminAccountDecision => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail('body', 'Expected a JSON object.');
  const body: Record<string, unknown> = Object.fromEntries(Object.entries(value));
  const unknown = Object.keys(body).find((key) => !['reason', 'status'].includes(key));
  if (unknown) fail(unknown, 'Unsupported field.');
  const status =
    body.status === AccountStatus.ACTIVE || body.status === AccountStatus.SUSPENDED
      ? body.status
      : fail('status', 'Use ACTIVE or SUSPENDED.');
  return { reason: text('reason', body.reason, 500, true) ?? '', status };
};
export const parseEnforcementTargetType = (value: unknown): AdminEnforcementTargetType =>
  isEnforcementType(value) ? value : fail('type', 'Unsupported enforcement target type.');
export const parseEnforcementDecision = (
  value: unknown,
  visibility: AdminEnforcementDecision['visibility'],
): AdminEnforcementDecision => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail('body', 'Expected a JSON object.');
  const body: Record<string, unknown> = Object.fromEntries(Object.entries(value));
  const unknown = Object.keys(body).find((key) => !['reason', 'relatedReportId'].includes(key));
  if (unknown) fail(unknown, 'Unsupported field.');
  return {
    reason: text('reason', body.reason, 500, true) ?? '',
    relatedReportId:
      body.relatedReportId === undefined
        ? undefined
        : uuid('relatedReportId', body.relatedReportId),
    visibility,
  };
};
