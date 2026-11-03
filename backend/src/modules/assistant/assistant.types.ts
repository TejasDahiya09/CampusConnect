export const assistantSourceTypes = ['MARKETPLACE', 'LOST_FOUND', 'TEAMUP', 'SERVICE'] as const;

export type AssistantSourceType = (typeof assistantSourceTypes)[number];
export interface TeamSizeQuery {
  readonly mode: 'total' | 'current' | 'additional';
  readonly count: number;
}
export type AssistantFacts =
  | {
      readonly kind: 'LOST_FOUND';
      readonly reportType: 'LOST' | 'FOUND';
      readonly status: string;
      readonly location: string | null;
    }
  | {
      readonly kind: 'TEAMUP';
      readonly status: string;
      readonly maxMembers: number | null;
      readonly currentMembers: number | null;
    };

export interface AssistantRetrievalQuery {
  readonly question: string;
  readonly sourceTypes: readonly AssistantSourceType[];
  readonly history?: readonly string[];
  readonly requiredTerms?: readonly string[];
  readonly reportType?: 'LOST' | 'FOUND';
  readonly teamSize?: TeamSizeQuery;
}

export interface AssistantCandidate {
  readonly facts?: AssistantFacts;
  readonly attributes: readonly string[];
  readonly createdAt: Date;
  readonly description: string;
  readonly id: string;
  readonly searchText: string;
  readonly sourceType: AssistantSourceType;
  readonly title: string;
}

export interface AssistantEvidence {
  readonly facts?: AssistantFacts;
  readonly relevance: number;
  readonly route: string;
  readonly snippet: string;
  readonly sourceId: string;
  readonly sourceType: AssistantSourceType;
  readonly title: string;
}

export interface AssistantRetrievalResponse {
  readonly qualification?: { readonly unknown: number; readonly checked: number };
  readonly contractVersion: 'campus-assistant-grounded-v1';
  readonly evidence: readonly AssistantEvidence[];
  readonly retrievalStatus: 'candidates' | 'insufficient_evidence';
}
