export const assistantSourceTypes = ['MARKETPLACE', 'LOST_FOUND', 'TEAMUP', 'SERVICE'] as const;

export type AssistantSourceType = (typeof assistantSourceTypes)[number];
export type AssistantStatus = 'answered' | 'insufficient_evidence' | 'unsupported' | 'unavailable';
export type AssistantResponseType = 'conversation' | 'grounded' | 'platform_knowledge' | 'system';

export interface AssistantCitation {
  readonly details?: string;
  readonly route: string;
  readonly sourceId: string;
  readonly sourceType: AssistantSourceType;
  readonly title: string;
}

export interface AssistantAnswer {
  readonly actions?: readonly { readonly label: string; readonly route: string }[];
  readonly answer: string;
  readonly citations: readonly AssistantCitation[];
  readonly contractVersion: 'campus-assistant-grounded-v1';
  readonly errorCode: string | null;
  readonly model: string | null;
  readonly provider: 'gemini' | null;
  readonly retrievalMode: 'insufficient_evidence' | 'lexical_fallback' | 'semantic' | null;
  readonly responseType: AssistantResponseType;
  readonly status: AssistantStatus;
}

export interface AskAssistantInput {
  readonly history?: readonly string[];
  readonly signal?: AbortSignal;
  readonly question: string;
  readonly sourceTypes?: readonly AssistantSourceType[];
}
