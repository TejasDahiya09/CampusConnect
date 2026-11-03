import type {
  ClaimStatus,
  LostFoundStatus,
  LostFoundType,
  UserRole,
} from '../../generated/prisma/client.js';

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

export interface LostFoundMediaUploadRequest {
  readonly contentType: string;
  readonly fileName: string;
  readonly size: number;
}

export interface LostFoundMediaCompletionRequest {
  readonly objectKey: string;
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

export interface LostFoundReporterView {
  readonly avatar: unknown;
  readonly department: string | null;
  readonly displayName: string;
  readonly id: string;
}

export interface LostFoundReportView {
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
  readonly reporter: LostFoundReporterView;
  readonly reporterId: string;
  readonly resolvedAt: string | null;
  readonly status: LostFoundStatus;
  readonly title: string;
  readonly type: LostFoundType;
  readonly updatedAt: string;
}

export interface LostFoundCreateInput {
  readonly category: string;
  readonly description: string;
  readonly featuredOnLanding?: boolean;
  readonly incidentDate: Date;
  readonly location: string;
  readonly title: string;
  readonly type: LostFoundType;
}

export interface LostFoundUpdateInput {
  readonly category?: string | null;
  readonly description?: string;
  readonly featuredOnLanding?: boolean;
  readonly incidentDate?: Date | null;
  readonly location?: string | null;
  readonly title?: string;
}

export type LostFoundSort = 'incident_newest' | 'newest' | 'oldest';

export interface LostFoundQuery {
  readonly category?: string;
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
  readonly keyword?: string;
  readonly limit: number;
  readonly location?: string;
  readonly page: number;
  readonly sort: LostFoundSort;
  readonly status?: LostFoundStatus;
  readonly type?: LostFoundType;
}

export interface LostFoundBookmarkQuery {
  readonly limit: number;
  readonly page: number;
}

export interface PaginatedLostFoundReports {
  readonly items: readonly LostFoundReportView[];
  readonly limit: number;
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface LostFoundMatchView {
  readonly confidence: 'HIGH' | 'LOW' | 'MEDIUM';
  readonly reasons: readonly string[];
  readonly report: LostFoundReportView;
  readonly score: number;
  readonly signals: {
    readonly category: number;
    readonly location: number;
    readonly text: number;
    readonly time: number;
    readonly image?: number | null;
  };
  readonly scoringMode?: 'baseline' | 'multimodal' | 'semantic';
}

export interface LostFoundMatchesView {
  readonly matcherVersion: 'lf-baseline-v1' | 'lf-multimodal-v1' | 'lf-semantic-v1';
  readonly matches: readonly LostFoundMatchView[];
}

export interface LostFoundViewer {
  readonly id: string;
  readonly role: UserRole;
}
