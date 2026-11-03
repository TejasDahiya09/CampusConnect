import type {
  AccountStatus,
  ListingStatus,
  LostFoundStatus,
  ModerationVisibility,
  ProjectStatus,
  ServiceStatus,
} from '../../generated/prisma/client.js';

export type AdminContentType = 'LOST_FOUND' | 'MARKETPLACE' | 'SERVICE' | 'TEAMUP';
export type AdminContentStatus = ListingStatus | LostFoundStatus | ProjectStatus | ServiceStatus;
export interface AdminListQuery {
  readonly limit: number;
  readonly page: number;
  readonly search?: string | undefined;
}
export interface AdminUserQuery extends AdminListQuery {
  readonly role?: 'ADMIN' | 'MODERATOR' | 'STUDENT' | undefined;
  readonly status?: AccountStatus | undefined;
}
export interface AdminContentQuery extends AdminListQuery {
  readonly visibility?: ModerationVisibility | undefined;
  readonly status?: AdminContentStatus | undefined;
  readonly type: AdminContentType;
}
export interface AdminAuditQuery extends AdminListQuery {
  readonly event?: string | undefined;
}
export interface AdminAccountDecision {
  readonly reason: string;
  readonly status: Extract<AccountStatus, 'ACTIVE' | 'SUSPENDED'>;
}
export interface AdminEnforcementDecision {
  readonly reason: string;
  readonly relatedReportId?: string | undefined;
  readonly visibility: 'HIDDEN' | 'VISIBLE';
}
export type AdminEnforcementTargetType = AdminContentType | 'PROFILE';
