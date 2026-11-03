export interface ResumeSkillSuggestion {
  readonly category: string;
  readonly confidence: 'high' | 'medium';
  readonly evidence: string;
  readonly method: 'alias_normalization' | 'context_inference' | 'explicit_mention';
  readonly name: string;
}

export interface ResumeAnalysis {
  readonly skills: readonly ResumeSkillSuggestion[];
  readonly status: 'completed';
}
