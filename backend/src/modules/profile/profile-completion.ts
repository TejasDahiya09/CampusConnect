import type { ProfileCompletion, ProfileRecord } from './profile.types.js';

export const calculateProfileCompletion = (profile: ProfileRecord): ProfileCompletion => {
  const criteria = {
    achievement: profile.achievements.length > 0,
    avatar: profile.avatar !== null,
    bio: Boolean(profile.bio?.trim()),
    department: profile.department !== null,
    displayName: profile.fullName.trim().length >= 2,
    interest: profile.interests.length > 0,
    portfolioLink: profile.portfolio.length > 0,
    skill: profile.skills.length > 0,
    universityVerified: profile.emailVerifiedAt !== null,
    year: profile.academicYear !== null,
  } as const;
  const values = Object.values(criteria);
  const completed = values.filter(Boolean).length;
  return {
    completed,
    criteria,
    percentage: Math.round((completed / values.length) * 100),
    total: values.length,
  };
};
