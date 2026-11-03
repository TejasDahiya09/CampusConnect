export const notificationKinds = [
  'MARKETPLACE_MESSAGE',
  'MESSAGE_RECEIVED',
  'LOST_FOUND_MATCH',
  'LOST_FOUND_CLAIM_SUBMITTED',
  'LOST_FOUND_CLAIM_ACCEPTED',
  'LOST_FOUND_CLAIM_REJECTED',
  'TEAMUP_APPLICATION',
  'TEAMUP_APPLICATION_ACCEPTED',
  'TEAMUP_APPLICATION_REJECTED',
  'SERVICE_REQUEST',
  'SERVICE_REQUEST_ACCEPTED',
  'SERVICE_REQUEST_REJECTED',
  'SERVICE_REQUEST_COMPLETED',
  'REPORT_SUBMITTED',
  'REPORT_RESOLVED',
  'CONTENT_HIDDEN',
  'CONTENT_RESTORED',
] as const;
export type NotificationKind = (typeof notificationKinds)[number];
export type NotificationEntity =
  | 'MESSAGING'
  | 'LOST_FOUND'
  | 'TEAMUP'
  | 'SERVICE'
  | 'MODERATION'
  | 'NOTIFICATIONS'
  | 'MARKETPLACE'
  | 'PROFILE';
export interface NotificationCreateInput {
  readonly description: string | null;
  readonly entityId: string;
  readonly entityType: NotificationEntity;
  readonly eventId: string;
  readonly kind: NotificationKind;
  readonly recipientId: string;
  readonly title: string;
}
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
