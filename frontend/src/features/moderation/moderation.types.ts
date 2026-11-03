export type ModerationTargetType = 'LOST_FOUND' | 'MARKETPLACE' | 'PROFILE' | 'SERVICE' | 'TEAMUP';
export type ReportReason =
  'FAKE_PROFILE' | 'HARASSMENT' | 'INAPPROPRIATE_CONTENT' | 'OTHER' | 'SCAM' | 'SPAM';
export type ReportStatus = 'DISMISSED' | 'OPEN' | 'RESOLVED' | 'UNDER_REVIEW';
export interface ModerationReport {
  readonly createdAt: string;
  readonly description: string | null;
  readonly id: string;
  readonly reason: string;
  readonly reporter: { readonly displayName: string; readonly id: string };
  readonly resolutionNote: string | null;
  readonly status: ReportStatus;
  readonly targetId: string;
  readonly targetType: ModerationTargetType;
}
