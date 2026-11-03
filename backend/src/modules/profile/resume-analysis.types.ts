export type ResumeSkillCategory =
  | 'AI / Machine Learning'
  | 'Cloud / DevOps'
  | 'Computer Science'
  | 'Data Science'
  | 'Databases'
  | 'Professional Skills'
  | 'Programming Languages'
  | 'Web Development';

export interface ResumeSkillSuggestion {
  readonly category: ResumeSkillCategory;
  readonly confidence: 'high' | 'medium';
  readonly evidence: string;
  readonly method: 'alias_normalization' | 'context_inference' | 'explicit_mention';
  readonly name: string;
}

export interface ResumeAnalysis {
  readonly skills: readonly ResumeSkillSuggestion[];
  readonly status: 'completed';
}
