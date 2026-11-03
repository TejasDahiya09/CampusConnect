import { env } from '../../config/env.js';

const aliases: Readonly<Record<string, string>> = {
  js: 'javascript',
  nodejs: 'node.js',
  postgres: 'postgresql',
  'react.js': 'react',
  reactjs: 'react',
  sklearn: 'scikit-learn',
  ts: 'typescript',
};
export const normalizeSkill = (skill: string): string =>
  aliases[skill.trim().toLowerCase()] ?? skill.trim().toLowerCase();
const normalized = (items: readonly string[]) => new Set(items.map(normalizeSkill));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const explicitSignals = (
  requirements: readonly string[],
  skills: readonly string[],
  interests: readonly string[],
) => {
  const required = [...new Set(requirements.map(normalizeSkill))];
  const candidate = normalized(skills);
  const interestSet = normalized(interests);
  const matchedSkills = required.filter((skill) => candidate.has(skill));
  const missingSkills = required.filter((skill) => !candidate.has(skill));
  const relevantInterests = required.filter((skill) => interestSet.has(skill));
  return {
    matchedSkills,
    missingSkills,
    relevantInterests,
    skillRatio: required.length ? matchedSkills.length / required.length : 0,
    interestRatio: required.length ? relevantInterests.length / required.length : 0,
  };
};

export const combineScore = (skill: number, semantic: number | null, interest: number) => {
  const signals =
    semantic === null
      ? [
          { weight: 0.8, value: skill },
          { weight: 0.2, value: interest },
        ]
      : [
          { weight: 0.6, value: skill },
          { weight: 0.25, value: semantic },
          { weight: 0.15, value: interest },
        ];
  const applicable =
    interest > 0 ? signals : signals.filter((signal, index) => index !== signals.length - 1);
  const weight = applicable.reduce((sum, signal) => sum + signal.weight, 0);
  return applicable.reduce((sum, signal) => sum + signal.value * signal.weight, 0) / weight;
};

export const semanticScores = async (
  query: string,
  candidates: readonly { id: string; text: string }[],
): Promise<Map<string, number> | null> => {
  if (!env.aiServiceEnabled || !env.aiServiceUrl || !env.aiServiceApiKey || candidates.length === 0)
    return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.aiServiceTimeoutMs);
  try {
    const response = await fetch(`${env.aiServiceUrl}/api/v1/recommendations/teamup/semantic`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-CampusConnect-AI-Key': env.aiServiceApiKey,
      },
      body: JSON.stringify({ query, candidates }),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('results' in body) ||
      !Array.isArray(body.results)
    )
      return null;
    const result = new Map<string, number>();
    for (const rawItem of body.results) {
      const item: unknown = rawItem;
      if (!isRecord(item)) continue;
      const record = item;
      if (
        typeof record.id === 'string' &&
        typeof record.score === 'number' &&
        record.score >= 0 &&
        record.score <= 1
      )
        result.set(record.id, record.score);
    }
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};
