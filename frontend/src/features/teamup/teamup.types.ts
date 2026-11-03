export type TeamUpStatus = 'OPEN' | 'FULL' | 'COMPLETED' | 'ARCHIVED';
export type TeamUpApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export interface TeamUpPerson {
  readonly avatar: unknown;
  readonly department: string | null;
  readonly displayName: string;
  readonly id: string;
}
export interface TeamUpProject {
  readonly category: string | null;
  readonly createdAt: string;
  readonly currentMemberCount: number;
  readonly deadline: string | null;
  readonly description: string;
  readonly featuredOnLanding?: boolean;
  readonly id: string;
  readonly maxMembers: number;
  readonly members?: readonly TeamUpPerson[];
  readonly owner: TeamUpPerson;
  readonly ownerId: string;
  readonly requiredSkills: readonly string[];
  readonly status: TeamUpStatus;
  readonly title: string;
  readonly updatedAt: string;
  readonly viewerApplicationStatus: TeamUpApplicationStatus | null;
  readonly viewerIsMember: boolean;
  readonly viewerIsOwner: boolean;
}
export interface TeamUpApplication {
  readonly applicant: TeamUpPerson;
  readonly applicantId: string;
  readonly createdAt: string;
  readonly id: string;
  readonly message: string | null;
  readonly project?: TeamUpProject;
  readonly reviewedAt: string | null;
  readonly reviewerId: string | null;
  readonly status: TeamUpApplicationStatus;
}
export interface TeamUpDraft {
  readonly category: string;
  readonly deadline: string;
  readonly description: string;
  readonly featuredOnLanding: boolean;
  readonly maxMembers: number;
  readonly requiredSkills: readonly string[];
  readonly title: string;
}
export interface TeamUpFilters {
  readonly keyword: string;
  readonly limit: number;
  readonly page: number;
  readonly skill: string;
  readonly sort: 'deadline' | 'newest' | 'oldest';
  readonly status: '' | TeamUpStatus;
}
export interface TeamUpPageResult {
  readonly pagination: {
    readonly limit: number;
    readonly page: number;
    readonly total: number;
    readonly totalPages: number;
  };
  readonly projects: readonly TeamUpProject[];
}
export interface TeamUpWorkspace {
  readonly applications: readonly TeamUpApplication[];
  readonly joined: readonly TeamUpProject[];
  readonly owned: readonly TeamUpProject[];
}

export const canApplyToProject = (project: TeamUpProject): boolean =>
  project.status === 'OPEN' &&
  !project.viewerIsOwner &&
  !project.viewerIsMember &&
  project.viewerApplicationStatus === null;
export const teamUpStatusTone = (
  status: TeamUpStatus,
): 'info' | 'neutral' | 'success' | 'warning' =>
  status === 'OPEN'
    ? 'success'
    : status === 'FULL'
      ? 'warning'
      : status === 'COMPLETED'
        ? 'info'
        : 'neutral';
