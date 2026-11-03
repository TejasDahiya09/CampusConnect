import { eligibleReport, factLabel, matchesTeamSize } from './assistant-facts.js';
import { containsItemTerm, itemAliases } from './assistant-lost-found-context.js';
import { boundedPublicText } from './assistant.privacy.js';
import {
  assistantRetrievalRepository,
  type AssistantRetrievalRepository,
} from './assistant.repository.js';
import type {
  AssistantCandidate,
  AssistantEvidence,
  AssistantRetrievalQuery,
  AssistantRetrievalResponse,
  AssistantSourceType,
} from './assistant.types.js';

export const ASSISTANT_TOTAL_EVIDENCE_LIMIT = 20;
export const ASSISTANT_PER_SOURCE_LIMIT = 5;
export const ASSISTANT_DATABASE_CANDIDATE_LIMIT = 20;
const MAX_TERMS = 8;
const sourceOrder: readonly AssistantSourceType[] = [
  'MARKETPLACE',
  'LOST_FOUND',
  'TEAMUP',
  'SERVICE',
];
const routes: Readonly<Record<AssistantSourceType, string>> = {
  LOST_FOUND: 'lost-found',
  MARKETPLACE: 'marketplace',
  SERVICE: 'services',
  TEAMUP: 'teamup',
};
const stopWords = new Set([
  'my',
  'got',
  'was',
  'it',
  'similar',
  'also',
  'item',
  'lost',
  'found',
  'available',
  'marketplace',
  'show',
  'in',
  'looking',
  'need',
  'student',
  'students',
  'offering',
  'any',
  'now',
  'open',
  'reports',
  'report',
  'projects',
  'project',
  'services',
  'service',
  'teamup',
  'members',
  'about',
  'any',
  'anyone',
  'are',
  'can',
  'campus',
  'could',
  'find',
  'for',
  'from',
  'have',
  'help',
  'how',
  'is',
  'me',
  'near',
  'please',
  'show',
  'someone',
  'there',
  'the',
  'this',
  'what',
  'where',
  'which',
  'who',
  'with',
  'would',
  'you',
]);

export const normalizeRetrievalTerms = (question: string): readonly string[] => {
  const matches =
    question
      .normalize('NFKC')
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return [
    ...new Set(
      matches
        .filter((term) => term.length >= 2 && !stopWords.has(term))
        .map(
          (term) =>
            ({
              calculators: 'calculator',
              books: 'book',
              textbooks: 'textbook',
              bags: 'bag',
              teammates: 'team',
            })[term] ?? term,
        )
        .slice(0, MAX_TERMS),
    ),
  ];
};

const termOccurrences = (text: string, term: string): number => {
  let count = 0;
  let index = text.indexOf(term);
  while (index >= 0) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }
  return count;
};

const candidateScore = (candidate: AssistantCandidate, terms: readonly string[]): number => {
  const title = candidate.title.toLocaleLowerCase();
  const searchable = candidate.searchText.toLocaleLowerCase();
  return terms.reduce(
    (total, term) =>
      total + (title.includes(term) ? 4 : 0) + Math.min(3, termOccurrences(searchable, term)),
    0,
  );
};

const evidenceFromCandidate = (
  candidate: AssistantCandidate,
  score: number,
  maximumScore: number,
): AssistantEvidence => {
  const title = boundedPublicText(candidate.title, 180) || 'CampusConnect result';
  const description = boundedPublicText(candidate.description, 800);
  const attributes = candidate.attributes
    .map((attribute) => boundedPublicText(attribute, 120))
    .filter((attribute) => attribute.length > 0)
    .slice(0, 10);
  const snippet = boundedPublicText(
    [description, attributes.length > 0 ? attributes.join(' · ') : '']
      .filter(Boolean)
      .join(' — ') || 'Open this record for public details.',
    1_000,
  );
  return {
    ...(candidate.facts ? { facts: candidate.facts } : {}),
    relevance: Number((score / maximumScore).toFixed(4)),
    route: `/${routes[candidate.sourceType]}/${candidate.id}`,
    snippet: boundedPublicText(
      [factLabel(candidate.facts), snippet].filter(Boolean).join(' | '),
      1200,
    ),
    sourceId: candidate.id,
    sourceType: candidate.sourceType,
    title,
  };
};

export const createAssistantRetrievalService = (
  repository: AssistantRetrievalRepository = assistantRetrievalRepository,
) => ({
  async retrieve(input: AssistantRetrievalQuery): Promise<AssistantRetrievalResponse> {
    const terms = [
      ...new Set([...(input.requiredTerms ?? []), ...normalizeRetrievalTerms(input.question)]),
    ].slice(0, MAX_TERMS);
    if (terms.length === 0 && input.sourceTypes.length !== 1) {
      return {
        contractVersion: 'campus-assistant-grounded-v1',
        evidence: [],
        retrievalStatus: 'insufficient_evidence',
      };
    }

    const candidateGroups = await Promise.all(
      input.sourceTypes.map((sourceType) =>
        repository.retrieve(
          sourceType,
          terms,
          ASSISTANT_DATABASE_CANDIDATE_LIMIT,
          /\b(?:available|open|recruiting|looking for members|teammates|selling|for sale)\b/i.test(
            input.question,
          ),
          input.reportType ??
            (sourceType === 'LOST_FOUND' &&
            /\blost\b/i.test(input.question) !== /\bfound\b/i.test(input.question)
              ? /\blost\b/i.test(input.question)
                ? 'LOST'
                : 'FOUND'
              : undefined),
          input.requiredTerms,
        ),
      ),
    );
    const maximumScore = Math.max(1, terms.length * 7);
    let checked = 0;
    let unknown = 0;
    const evidence = candidateGroups
      .flatMap((candidates, index) => {
        const sourceType = input.sourceTypes[index];
        if (sourceType === undefined) return [];
        return candidates
          .filter((candidate) => candidate.sourceType === sourceType)
          .filter(
            (candidate) =>
              sourceType !== 'LOST_FOUND' ||
              !(
                input.reportType ??
                (/\blost\b/i.test(input.question) !== /\bfound\b/i.test(input.question)
                  ? /\blost\b/i.test(input.question)
                    ? 'LOST'
                    : 'FOUND'
                  : undefined)
              ) ||
              eligibleReport(
                candidate,
                input.reportType ?? (/\blost\b/i.test(input.question) ? 'LOST' : 'FOUND'),
              ),
          )
          .filter((candidate) => {
            if (!input.teamSize) return true;
            checked += 1;
            const result = matchesTeamSize(candidate.facts, input.teamSize);
            if (result === null) unknown += 1;
            return result === true;
          })
          .filter(
            (candidate) =>
              !input.requiredTerms?.length ||
              sourceType !== 'LOST_FOUND' ||
              !itemAliases.some((aliases) =>
                aliases.some((term) => containsItemTerm(candidate.title, term)),
              ) ||
              input.requiredTerms.some((term) => containsItemTerm(candidate.title, term)),
          )
          .filter(
            (candidate) =>
              !input.requiredTerms?.length ||
              input.requiredTerms.some((term) =>
                containsItemTerm([candidate.title, candidate.searchText].join(' '), term),
              ),
          )
          .map((candidate) => ({
            candidate,
            score: terms.length ? candidateScore(candidate, terms) : 1,
          }))
          .filter(({ score }) => score > 0)
          .sort(
            (left, right) =>
              right.score - left.score ||
              right.candidate.createdAt.getTime() - left.candidate.createdAt.getTime() ||
              left.candidate.title.localeCompare(right.candidate.title) ||
              left.candidate.id.localeCompare(right.candidate.id),
          )
          .slice(0, ASSISTANT_PER_SOURCE_LIMIT)
          .map(({ candidate, score }) => evidenceFromCandidate(candidate, score, maximumScore));
      })
      .sort(
        (left, right) =>
          right.relevance - left.relevance ||
          sourceOrder.indexOf(left.sourceType) - sourceOrder.indexOf(right.sourceType) ||
          left.title.localeCompare(right.title) ||
          left.sourceId.localeCompare(right.sourceId),
      )
      .slice(0, ASSISTANT_TOTAL_EVIDENCE_LIMIT);

    return {
      contractVersion: 'campus-assistant-grounded-v1',
      evidence,
      retrievalStatus: evidence.length > 0 ? 'candidates' : 'insufficient_evidence',
      ...(input.teamSize ? { qualification: { checked, unknown } } : {}),
    };
  },
});

export type AssistantRetrievalService = ReturnType<typeof createAssistantRetrievalService>;
export const assistantRetrievalService = createAssistantRetrievalService();
