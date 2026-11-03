import type { PredefinedAvatar, PhotoAvatar } from './profile-avatar-value.js';
import type { Prisma } from '../../generated/prisma/client.js';

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
  readonly awardedAt: Date | null;
  readonly description: string | null;
  readonly id: string;
  readonly title: string;
}
export interface ProfileAchievementView extends Omit<ProfileAchievement, 'awardedAt'> {
  readonly awardedAt: string | null;
}
export interface ProfilePortfolioLink {
  readonly id: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly url: string;
}
export type ProfileAvatar = PredefinedAvatar | PhotoAvatar;

export interface ProfileRecord {
  readonly academicYear: number | null;
  readonly achievements: readonly ProfileAchievement[];
  readonly avatar: ProfileAvatar | null;
  readonly bio: string | null;
  readonly department: string | null;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly fullName: string;
  readonly interests: readonly string[];
  readonly location: string | null;
  readonly portfolio: readonly ProfilePortfolioLink[];
  readonly profileCompletion: number;
  readonly skillProficiencies: Readonly<Record<string, number>>;
  readonly skills: readonly string[];
  readonly userId: string;
}

export interface ProfileCompletion {
  readonly completed: number;
  readonly criteria: {
    readonly achievement: boolean;
    readonly avatar: boolean;
    readonly bio: boolean;
    readonly department: boolean;
    readonly displayName: boolean;
    readonly interest: boolean;
    readonly portfolioLink: boolean;
    readonly skill: boolean;
    readonly universityVerified: boolean;
    readonly year: boolean;
  };
  readonly percentage: number;
  readonly total: number;
}

// These compatibility aliases preserve the existing frontend contract while persistence uses
// the new Profile columns directly (for example fullName and academicYear).
export interface ProfileView {
  readonly achievements: readonly ProfileAchievementView[];
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
  readonly skills: readonly Omit<ProfileSkill, 'proficiency'>[];
}

export interface ProfilePatch {
  readonly academicYear?: number | null;
  readonly avatar?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  readonly bio?: string | null;
  readonly department?: string | null;
  readonly fullName?: string;
  readonly location?: string | null;
}

export interface SkillInput {
  readonly name: string;
  readonly proficiency: number | null;
}
export interface AchievementInput {
  readonly awardedAt?: Date | null;
  readonly description?: string | null;
  readonly title?: string;
}
export interface PortfolioLinkInput {
  readonly label?: string;
  readonly sortOrder?: number;
  readonly url?: string;
}
