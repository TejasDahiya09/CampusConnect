export interface DepartmentSummary {
  readonly code: string;
  readonly id: string;
  readonly name: string;
}

export interface ProfileSkill {
  readonly id: string;
  readonly name: string;
  readonly proficiency: number | null;
}

export interface ProfileInterest {
  readonly id: string;
  readonly name: string;
}

export interface ProfileAchievement {
  readonly awardedAt: string | null;
  readonly description: string | null;
  readonly id: string;
  readonly title: string;
}

export interface ProfilePortfolioLink {
  readonly id: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly url: string;
}

export type PredefinedAvatarId = 'campus-indigo' | 'campus-cyan' | 'campus-amber' | 'campus-rose';

export type ProfileAvatar =
  | { readonly type: 'predefined'; readonly id: PredefinedAvatarId }
  | { readonly type: 'photo'; readonly id: string; readonly url: string };

export interface ProfileCompletion {
  readonly completed: number;
  readonly criteria: Readonly<Record<string, boolean>>;
  readonly percentage: number;
  readonly total: number;
}

export interface StudentProfile {
  readonly achievements: readonly ProfileAchievement[];
  readonly avatar: ProfileAvatar | null;
  readonly bio: string | null;
  readonly completion?: ProfileCompletion;
  readonly department: DepartmentSummary | null;
  readonly departmentId: string | null;
  readonly displayName: string;
  readonly interests: readonly ProfileInterest[];
  readonly location: string | null;
  readonly portfolioLinks: readonly ProfilePortfolioLink[];
  readonly profileId: string;
  readonly skills: readonly ProfileSkill[];
  readonly universityDomain: string | null;
  readonly userId: string;
  readonly year: number | null;
}

export interface ProfileOptions {
  readonly departments: readonly DepartmentSummary[];
  readonly interests: readonly ProfileInterest[];
  readonly skills: readonly { readonly id: string; readonly name: string }[];
}

export interface ProfilePatch {
  readonly avatar?: ProfileAvatar | null;
  readonly bio?: string | null;
  readonly departmentId?: string | null;
  readonly displayName?: string;
  readonly location?: string | null;
  readonly year?: number | null;
}
