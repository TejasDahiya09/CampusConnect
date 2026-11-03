import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import type { ResumeAnalysis, ResumeSkillCategory } from './resume-analysis.types.js';

const categories = new Set<ResumeSkillCategory>([
  'AI / Machine Learning',
  'Cloud / DevOps',
  'Computer Science',
  'Data Science',
  'Databases',
  'Professional Skills',
  'Programming Languages',
  'Web Development',
]);
const methods = new Set(['alias_normalization', 'context_inference', 'explicit_mention']);
const confidences = new Set(['high', 'medium']);
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;
const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

export const isResumeAnalysis = (value: unknown): value is ResumeAnalysis =>
  isRecord(value) &&
  hasExactKeys(value, ['skills', 'status']) &&
  value.status === 'completed' &&
  Array.isArray(value.skills) &&
  value.skills.length <= 100 &&
  value.skills.every(
    (skill: unknown) =>
      isRecord(skill) &&
      hasExactKeys(skill, ['category', 'confidence', 'evidence', 'method', 'name']) &&
      typeof skill.name === 'string' &&
      skill.name.length >= 1 &&
      skill.name.length <= 80 &&
      typeof skill.category === 'string' &&
      categories.has(skill.category as ResumeSkillCategory) &&
      typeof skill.evidence === 'string' &&
      skill.evidence.length >= 1 &&
      skill.evidence.length <= 240 &&
      typeof skill.method === 'string' &&
      methods.has(skill.method) &&
      typeof skill.confidence === 'string' &&
      confidences.has(skill.confidence),
  );

const safeUpstreamError = (statusCode: number): AppError => {
  if (statusCode === 413)
    return new AppError({
      code: 'RESUME_TOO_LARGE',
      message: 'The resume exceeds the configured size limit.',
      statusCode: 413,
    });
  if (statusCode === 422)
    return new AppError({
      code: 'RESUME_INVALID',
      message: 'The resume could not be read. Use a valid, text-based PDF or DOCX file.',
      statusCode: 422,
    });
  return new AppError({
    code: 'RESUME_ANALYSIS_UNAVAILABLE',
    message: 'Resume analysis is temporarily unavailable.',
    statusCode: 503,
  });
};

export const analyzeResume = async (
  content: Buffer,
  mediaType: string,
): Promise<ResumeAnalysis> => {
  if (
    !env.aiServiceEnabled ||
    env.aiServiceUrl === undefined ||
    env.aiServiceApiKey === undefined
  ) {
    throw safeUpstreamError(503);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.resumeAnalysisTimeoutMs);
  try {
    const response = await fetch(`${env.aiServiceUrl}/api/v1/resume/analyze`, {
      body: new Uint8Array(content),
      headers: {
        Accept: 'application/json',
        'Content-Type': mediaType,
        'X-CampusConnect-AI-Key': env.aiServiceApiKey,
        'X-Request-ID': randomUUID(),
      },
      method: 'POST',
      signal: controller.signal,
    });
    if (!response.ok) throw safeUpstreamError(response.status);
    const body: unknown = await response.json();
    if (!isResumeAnalysis(body)) throw safeUpstreamError(503);
    return body;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      code: controller.signal.aborted ? 'RESUME_ANALYSIS_TIMEOUT' : 'RESUME_ANALYSIS_UNAVAILABLE',
      message: controller.signal.aborted
        ? 'Resume analysis timed out. Please retry.'
        : 'Resume analysis is temporarily unavailable.',
      statusCode: controller.signal.aborted ? 504 : 503,
    });
  } finally {
    clearTimeout(timeout);
  }
};
