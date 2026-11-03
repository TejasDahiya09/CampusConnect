import { ApiClientError } from '../../services/api-client';
import type {
  LostFoundMatch,
  LostFoundMatchResponse,
  LostFoundReport,
  MatchConfidence,
} from './lost-found.types';

export const confidenceLabel = (confidence: MatchConfidence): string =>
  confidence === 'HIGH'
    ? 'STRONG POSSIBILITY'
    : confidence === 'MEDIUM'
      ? 'POTENTIAL MATCH'
      : 'LOW CONFIDENCE';

export const confidenceTone = (confidence: MatchConfidence): 'info' | 'neutral' | 'success' =>
  confidence === 'HIGH' ? 'success' : confidence === 'MEDIUM' ? 'info' : 'neutral';

export const partitionMatches = (
  response: LostFoundMatchResponse,
): { readonly primary: readonly LostFoundMatch[]; readonly low: readonly LostFoundMatch[] } => ({
  // LOW results remain part of the versioned API contract but are intentionally not presented as
  // possible matches. Location and date alone must not turn weak item similarity into a suggestion.
  low: response.matches.filter((match) => match.confidence === 'LOW'),
  primary: response.matches.filter((match) => match.confidence !== 'LOW'),
});

export const matchingErrorMessage = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    if (error.code === 'AI_MATCHING_UNAVAILABLE' || error.status === 503)
      return 'AI matching is temporarily unavailable. Your Lost & Found report is unaffected.';
    if (error.status === 403) return "You don't have permission to find matches for this report.";
    if (error.status === 404) return 'This report could not be found.';
  }
  return "We couldn't find matches right now.";
};

export const matchPrompt = (report: LostFoundReport): string =>
  report.type === 'LOST'
    ? 'Find reports that may describe your lost item.'
    : 'Find lost reports that may correspond to this item.';
