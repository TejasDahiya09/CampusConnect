export type NotificationKind =
  | 'MARKETPLACE_MESSAGE'
  | 'MESSAGE_RECEIVED'
  | 'LOST_FOUND_MATCH'
  | 'LOST_FOUND_CLAIM_SUBMITTED'
  | 'LOST_FOUND_CLAIM_ACCEPTED'
  | 'LOST_FOUND_CLAIM_REJECTED'
  | 'TEAMUP_APPLICATION'
  | 'TEAMUP_APPLICATION_ACCEPTED'
  | 'TEAMUP_APPLICATION_REJECTED'
  | 'SERVICE_REQUEST'
  | 'SERVICE_REQUEST_ACCEPTED'
  | 'SERVICE_REQUEST_REJECTED'
  | 'SERVICE_REQUEST_COMPLETED';
export interface NotificationView {
  readonly createdAt: string;
  readonly description: string | null;
  readonly id: string;
  readonly kind: NotificationKind;
  readonly path: string;
  readonly read: boolean;
  readonly readAt: string | null;
  readonly title: string;
}
export interface NotificationPageResult {
  readonly notifications: readonly NotificationView[];
  readonly pagination: {
    readonly limit: number;
    readonly page: number;
    readonly total: number;
    readonly totalPages: number;
  };
}
