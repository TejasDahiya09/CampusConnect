import type { ReportReason, ReportStatus } from '../../generated/prisma/client.js';

export const moderationTargetTypes = [
  'MARKETPLACE',
  'LOST_FOUND',
  'TEAMUP',
  'SERVICE',
  'PROFILE',
] as const;
export type ModerationTargetType = (typeof moderationTargetTypes)[number];

export interface ReportSubmission {
  readonly description: string | null;
  readonly reason: ReportReason;
  readonly targetId: string;
  readonly targetType: ModerationTargetType;
}
export interface ModerationDecision {
  readonly resolutionNote: string;
  readonly status: Exclude<ReportStatus, 'OPEN'>;
}
export interface ModerationQuery {
  readonly limit: number;
  readonly page: number;
  readonly reason?: ReportReason | undefined;
  readonly search?: string | undefined;
  readonly status?: ReportStatus | undefined;
  readonly targetType?: ModerationTargetType | undefined;
}
export interface SafetySignal {
  readonly code: 'COMMON_SCAM_LANGUAGE' | 'EXCESSIVE_LINKS' | 'REPETITIVE_CONTENT';
  readonly explanation: string;
}
