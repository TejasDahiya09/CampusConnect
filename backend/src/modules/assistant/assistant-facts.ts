import type { AssistantCandidate, AssistantFacts, TeamSizeQuery } from './assistant.types.js';
import { boundedPublicText } from './assistant.privacy.js';

/** Same public count convention as TeamUp: the project lead counts as one member.
 * Invalid/duplicate legacy JSON is unknown, not an invented zero-member team. */
export function publicTeamCount(members: unknown, maximum: number): number | null {
  if (!Array.isArray(members)) return null;
  const ids = new Set<string>();
  for (const value of members as unknown[]) {
    if (typeof value !== 'object' || value === null) return null;
    const row = value as Record<string, unknown>;
    if (
      typeof row.userId !== 'string' ||
      typeof row.joinedAt !== 'string' ||
      typeof row.applicationId !== 'string' ||
      ids.has(row.userId)
    )
      return null;
    ids.add(row.userId);
  }
  return ids.size + 1 <= maximum ? ids.size + 1 : null;
}

export function matchesTeamSize(
  facts: AssistantFacts | undefined,
  query: TeamSizeQuery,
): boolean | null {
  if (facts?.kind !== 'TEAMUP') return null;
  if (!['OPEN', 'FULL'].includes(facts.status)) return false;
  const count =
    query.mode === 'total'
      ? facts.maxMembers
      : query.mode === 'current'
        ? facts.currentMembers
        : facts.maxMembers !== null && facts.currentMembers !== null
          ? facts.status === 'OPEN'
            ? facts.maxMembers - facts.currentMembers
            : 0
          : null;
  return count === null ? null : count === query.count;
}

export function factLabel(facts: AssistantFacts | undefined): string | undefined {
  if (!facts) return undefined;
  const status: Record<string, string> = {
    OPEN: 'Open',
    FULL: 'Full',
    MATCHED: 'Matched',
    CLAIM_PENDING: 'Claim pending',
  };
  if (facts.kind === 'LOST_FOUND')
    return boundedPublicText(
      `${facts.reportType === 'FOUND' ? 'Found' : 'Lost'} report | ${status[facts.status] ?? 'Unavailable'} | ${facts.location ?? 'Location not supplied'}`,
      240,
    );
  return `${status[facts.status] ?? 'Unavailable'} | Maximum team size: ${facts.maxMembers ?? 'not supplied'} | Current members (including lead): ${facts.currentMembers ?? 'not established'}`;
}

export function eligibleReport(
  candidate: Pick<AssistantCandidate, 'facts'>,
  type: 'LOST' | 'FOUND',
): boolean {
  return (
    candidate.facts?.kind === 'LOST_FOUND' &&
    candidate.facts.reportType === type &&
    ['OPEN', 'MATCHED', 'CLAIM_PENDING'].includes(candidate.facts.status)
  );
}
