import type {
  AccountStatus,
  ListingCondition,
  ListingStatus,
  LostFoundStatus,
  LostFoundType,
  ProjectStatus,
  ServiceStatus,
  UserRole,
} from '../../generated/prisma/client.js';

export const DEMO_DATASET_ID = 'campusconnect-examiner-demo-v1';
export const DEMO_MARKER = `[${DEMO_DATASET_ID}]`;

export interface DemoUserCandidate {
  readonly id: string;
  readonly role: UserRole;
  readonly status: AccountStatus;
  readonly profile: { readonly fullName: string } | null;
}

export interface DemoMarketplaceRecord {
  readonly id: string;
  readonly sellerId: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly price: string;
  readonly currency: 'INR';
  readonly condition: ListingCondition;
  readonly status: ListingStatus;
  readonly location: string;
  readonly images: readonly [];
  readonly bookmarks: readonly string[];
}

export interface DemoLostFoundRecord {
  readonly id: string;
  readonly reporterId: string;
  readonly type: LostFoundType;
  readonly status: LostFoundStatus;
  readonly category: string;
  readonly title: string;
  readonly description: string;
  readonly location: string;
  readonly incidentDate: Date;
  readonly images: readonly [];
  readonly bookmarks: readonly string[];
  readonly claims: readonly [];
  readonly matches: readonly [];
}

export interface DemoTeamUpRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly requiredSkills: readonly string[];
  readonly members: readonly [];
  readonly applications: readonly [];
  readonly bookmarks: readonly [];
  readonly images: readonly [];
  readonly status: ProjectStatus;
  readonly maxMembers: number;
  readonly deadline: Date;
}

export interface DemoServiceRecord {
  readonly id: string;
  readonly providerId: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly skills: readonly string[];
  readonly price: string | null;
  readonly currency: 'INR';
  readonly location: string;
  readonly images: readonly [];
  readonly portfolio: readonly [];
  readonly bookmarks: readonly string[];
  readonly bookings: readonly [];
  readonly reviews: readonly [];
  readonly status: ServiceStatus;
}

export interface DemoSeedPlan {
  readonly datasetId: typeof DEMO_DATASET_ID;
  readonly userIds: readonly [string, string, string];
  readonly marketplace: readonly DemoMarketplaceRecord[];
  readonly lostFound: readonly DemoLostFoundRecord[];
  readonly teamUp: readonly DemoTeamUpRecord[];
  readonly services: readonly DemoServiceRecord[];
}

export interface DemoSeedCounts {
  readonly marketplace: number;
  readonly lostFound: number;
  readonly teamUp: number;
  readonly services: number;
}
