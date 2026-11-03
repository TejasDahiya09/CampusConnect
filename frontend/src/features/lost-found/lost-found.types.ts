import type { ApplicationRole } from '../auth/auth.types';

export type LostFoundType = 'LOST' | 'FOUND';
export type LostFoundStatus =
  'OPEN' | 'MATCHED' | 'CLAIM_PENDING' | 'RESOLVED' | 'ARCHIVED' | 'REMOVED';
export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type LostFoundSort = 'newest' | 'oldest' | 'incident_newest';

export interface LostFoundImage {
  readonly height: number | null;
  readonly id: string;
  readonly key: string;
  readonly mimeType: string;
  readonly originalName: string | null;
  readonly position: number;
  readonly primary: boolean;
  readonly size: number;
  readonly uploadedById: string;
  readonly url: string | null;
  readonly width: number | null;
}

export interface LostFoundMediaAuthorization {
  readonly expiresAt: string;
  readonly mediaId: string;
  readonly objectKey: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly uploadUrl: string;
}

export interface LostFoundClaim {
  readonly claimantId: string;
  readonly createdAt: string;
  readonly id: string;
  readonly message: string;
  readonly reviewedAt: string | null;
  readonly reviewerId: string | null;
  readonly status: ClaimStatus;
}

export interface LostFoundReport {
  readonly bookmarkCount: number;
  readonly category: string | null;
  readonly claimCount: number;
  readonly createdAt: string;
  readonly description: string;
  readonly featuredOnLanding?: boolean;
  readonly id: string;
  readonly images: readonly LostFoundImage[];
  readonly incidentDate: string | null;
  readonly isBookmarked: boolean;
  readonly location: string | null;
  readonly matchCount: number;
  readonly reporter: {
    readonly avatar: unknown;
    readonly department: string | null;
    readonly displayName: string;
    readonly id: string;
  };
  readonly reporterId: string;
  readonly resolvedAt: string | null;
  readonly status: LostFoundStatus;
  readonly title: string;
  readonly type: LostFoundType;
  readonly updatedAt: string;
}

export interface LostFoundDraft {
  readonly category: string;
  readonly description: string;
  readonly featuredOnLanding: boolean;
  readonly incidentDate: string;
  readonly location: string;
  readonly title: string;
  readonly type: LostFoundType;
}

export interface LostFoundFilters {
  readonly category: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly keyword: string;
  readonly limit: number;
  readonly location: string;
  readonly page: number;
  readonly sort: LostFoundSort;
  readonly status: '' | Exclude<LostFoundStatus, 'ARCHIVED' | 'REMOVED'>;
  readonly type: '' | LostFoundType;
}

export interface LostFoundPageResult {
  readonly pagination: {
    readonly limit: number;
    readonly page: number;
    readonly total: number;
    readonly totalPages: number;
  };
  readonly reports: readonly LostFoundReport[];
}

export interface LostFoundViewer {
  readonly id: string;
  readonly role: ApplicationRole;
}

export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface LostFoundMatchSignals {
  readonly category: number;
  readonly location: number;
  readonly text: number;
  readonly time: number;
}

export interface LostFoundMatch {
  readonly confidence: MatchConfidence;
  readonly reasons: readonly string[];
  readonly report: LostFoundReport;
  readonly score: number;
  readonly signals: LostFoundMatchSignals;
}

export interface LostFoundMatchResponse {
  readonly matcherVersion: 'lf-baseline-v1' | 'lf-semantic-v1';
  readonly matches: readonly LostFoundMatch[];
}

export const reportImageUrl = (image: LostFoundImage): string | null => image.url ?? null;

export const lostFoundFileKey = (file: File): string =>
  `${file.name}:${file.size}:${file.lastModified}`;

export const canEditReport = (report: LostFoundReport, viewer: LostFoundViewer | null): boolean =>
  viewer?.id === report.reporterId && (report.status === 'OPEN' || report.status === 'MATCHED');

export const canReviewClaims = (report: LostFoundReport, viewer: LostFoundViewer | null): boolean =>
  viewer !== null &&
  (viewer.id === report.reporterId || viewer.role === 'MODERATOR' || viewer.role === 'ADMIN');

export const canFindMatches = (report: LostFoundReport, viewer: LostFoundViewer | null): boolean =>
  viewer?.id === report.reporterId &&
  (report.status === 'OPEN' || report.status === 'MATCHED' || report.status === 'CLAIM_PENDING');

export const nextStatuses: Readonly<Record<LostFoundStatus, readonly LostFoundStatus[]>> = {
  ARCHIVED: [],
  CLAIM_PENDING: ['RESOLVED', 'MATCHED', 'OPEN'],
  MATCHED: ['CLAIM_PENDING', 'OPEN', 'ARCHIVED'],
  OPEN: ['MATCHED', 'ARCHIVED', 'REMOVED'],
  REMOVED: [],
  RESOLVED: ['ARCHIVED'],
};
