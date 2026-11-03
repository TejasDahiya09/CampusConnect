import type { TeamUpProject } from '../teamup/teamup.types';

export interface PublicStudent {
  readonly avatar: unknown;
  readonly bio: string | null;
  readonly department: string | null;
  readonly displayName: string;
  readonly id: string;
  readonly interests: readonly string[];
  readonly skills: readonly string[];
}
export interface MatchExplanation {
  readonly label: 'Partial skill alignment' | 'Relevant skill alignment' | 'Strong skill alignment';
  readonly matchedSkills: readonly string[];
  readonly missingSkills: readonly string[];
  readonly reasons: readonly string[];
  readonly score: number;
  readonly semanticAvailable: boolean;
}
export interface StudentRecommendation {
  readonly match: MatchExplanation;
  readonly student: PublicStudent;
}
export interface ProjectRecommendation {
  readonly match: MatchExplanation;
  readonly project: TeamUpProject;
}
