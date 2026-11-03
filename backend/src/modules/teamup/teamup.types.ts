import type { ProjectStatus } from '../../generated/prisma/client.js';

export type TeamUpApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface TeamUpPerson {
  readonly avatar: unknown;
  readonly department: string | null;
  readonly displayName: string;
  readonly id: string;
}

export interface TeamUpApplicationRecord {
  readonly applicantId: string;
  readonly createdAt: string;
  readonly id: string;
  readonly message: string | null;
  readonly reviewedAt: string | null;
  readonly reviewerId: string | null;
  readonly status: TeamUpApplicationStatus;
}

export interface TeamUpMemberRecord {
  readonly applicationId: string;
  readonly joinedAt: string;
  readonly userId: string;
}

export interface TeamUpApplicationView extends TeamUpApplicationRecord {
  readonly applicant: TeamUpPerson;
  readonly project?: TeamUpProjectSummary;
}

export interface TeamUpProjectSummary {
  readonly category: string | null;
  readonly createdAt: string;
  readonly currentMemberCount: number;
  readonly deadline: string | null;
  readonly description: string;
  readonly featuredOnLanding?: boolean;
  readonly id: string;
  readonly maxMembers: number;
  readonly owner: TeamUpPerson;
  readonly ownerId: string;
  readonly requiredSkills: readonly string[];
  readonly status: ProjectStatus;
  readonly title: string;
  readonly updatedAt: string;
  readonly viewerApplicationStatus: TeamUpApplicationStatus | null;
  readonly viewerIsMember: boolean;
  readonly viewerIsOwner: boolean;
}

export interface TeamUpProjectView extends TeamUpProjectSummary {
  readonly members: readonly TeamUpPerson[];
}

export interface TeamUpCreateInput {
  readonly category: string | null;
  readonly deadline: Date | null;
  readonly description: string;
  readonly featuredOnLanding?: boolean;
  readonly maxMembers: number;
  readonly requiredSkills: readonly string[];
  readonly title: string;
}

export type TeamUpUpdateInput = Partial<TeamUpCreateInput>;

export interface TeamUpQuery {
  readonly keyword?: string;
  readonly limit: number;
  readonly page: number;
  readonly skill?: string;
  readonly sort: 'deadline' | 'newest' | 'oldest';
  readonly status?: ProjectStatus;
}

export interface PaginatedTeamUpProjects {
  readonly items: readonly TeamUpProjectSummary[];
  readonly limit: number;
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface TeamUpWorkspace {
  readonly applications: readonly TeamUpApplicationView[];
  readonly joined: readonly TeamUpProjectSummary[];
  readonly owned: readonly TeamUpProjectSummary[];
}
