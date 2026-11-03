import type { ListingCondition, LostFoundType, Prisma } from '../../generated/prisma/client.js';

export type LandingHighlightKind = 'LOST_FOUND' | 'MARKETPLACE' | 'SERVICE' | 'TEAMUP';

export interface MarketplaceLandingCandidate {
  readonly category: string;
  readonly condition: ListingCondition;
  readonly createdAt: Date;
  readonly currency: string;
  readonly id: string;
  readonly price: Prisma.Decimal;
  readonly title: string;
}

export interface LostFoundLandingCandidate {
  readonly category: string | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly title: string;
  readonly type: LostFoundType;
}

export interface TeamUpLandingCandidate {
  readonly category: string | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly requiredSkills: readonly string[];
  readonly title: string;
}

export interface ServiceLandingCandidate {
  readonly category: string;
  readonly createdAt: Date;
  readonly currency: string;
  readonly id: string;
  readonly price: Prisma.Decimal | null;
  readonly skills: readonly string[];
  readonly title: string;
}

interface LandingHighlightBase {
  readonly createdAt: string;
  readonly id: string;
  readonly kind: LandingHighlightKind;
  readonly route: string;
  readonly summary: string;
  readonly title: string;
}

export interface MarketplaceLandingHighlight extends LandingHighlightBase {
  readonly kind: 'MARKETPLACE';
  readonly metadata: {
    readonly category: string;
    readonly condition: ListingCondition;
    readonly currency: string;
    readonly price: string;
  };
}

export interface LostFoundLandingHighlight extends LandingHighlightBase {
  readonly kind: 'LOST_FOUND';
  readonly metadata: {
    readonly category: string | null;
    readonly reportType: LostFoundType;
    readonly status: 'OPEN';
  };
}

export interface TeamUpLandingHighlight extends LandingHighlightBase {
  readonly kind: 'TEAMUP';
  readonly metadata: {
    readonly category: string | null;
    readonly requiredSkills: readonly string[];
    readonly status: 'OPEN';
  };
}

export interface ServiceLandingHighlight extends LandingHighlightBase {
  readonly kind: 'SERVICE';
  readonly metadata: {
    readonly category: string | null;
    readonly currency: string;
    readonly price: string | null;
    readonly pricingType: 'FIXED' | 'FREE' | 'NEGOTIABLE';
    readonly skills: readonly string[];
  };
}

export type LandingHighlight =
  | LostFoundLandingHighlight
  | MarketplaceLandingHighlight
  | ServiceLandingHighlight
  | TeamUpLandingHighlight;

export interface LandingHighlightCandidates {
  readonly lostFound: readonly LostFoundLandingCandidate[];
  readonly marketplace: readonly MarketplaceLandingCandidate[];
  readonly services: readonly ServiceLandingCandidate[];
  readonly teamUp: readonly TeamUpLandingCandidate[];
}
