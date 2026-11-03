import type { AiUnavailableCode } from './ai.errors.js';

export type AiAvailability = 'AVAILABLE' | 'DISABLED' | 'UNAVAILABLE';

export interface AiServiceConfig {
  readonly apiKey: string | undefined;
  readonly enabled: boolean;
  readonly timeoutMs: number;
  readonly generationTimeoutMs: number;
  readonly url: string | undefined;
}

export interface AiLostFoundReport {
  readonly category: string | null;
  readonly description: string;
  readonly id: string;
  readonly incidentAt: string | null;
  readonly location: string | null;
  readonly title: string;
  readonly type: 'FOUND' | 'LOST';
  readonly images?: readonly AiLostFoundImageEvidence[];
}

export interface AiLostFoundImageEvidence {
  readonly contentBase64: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface AiLostFoundMatchRequest {
  readonly candidates: readonly AiLostFoundReport[];
  readonly query: AiLostFoundReport;
  readonly topK: number;
}

export interface AiLostFoundSignals {
  readonly category: number;
  readonly location: number;
  readonly text: number;
  readonly time: number;
  readonly image?: number | null;
}

export interface AiLostFoundMatch {
  readonly confidence: 'HIGH' | 'LOW' | 'MEDIUM';
  readonly reasons: readonly string[];
  readonly reportId: string;
  readonly score: number;
  readonly scoringMode?: 'baseline' | 'multimodal' | 'semantic';
  readonly signals: AiLostFoundSignals;
}

export interface AiLostFoundMatchResponse {
  readonly matcherVersion: 'lf-baseline-v1' | 'lf-multimodal-v1' | 'lf-semantic-v1';
  readonly matches: readonly AiLostFoundMatch[];
}

export interface AiHealth {
  readonly service: string;
  readonly status: 'ok';
  readonly version: string;
}

export interface AiVersion {
  readonly apiVersion: 'v1';
  readonly capabilities: readonly string[];
  readonly service: string;
  readonly version: string;
}

export interface AiReadiness {
  readonly ready: true;
  readonly service: string;
  readonly version: string;
}

export interface AiUnavailable {
  readonly code: AiUnavailableCode;
  readonly status: 'UNAVAILABLE';
}

export interface AiAvailable<T> {
  readonly data: T;
  readonly status: 'AVAILABLE';
}

export interface AiDisabled {
  readonly status: 'DISABLED';
}

export type AiClientResult<T> = AiAvailable<T> | AiDisabled | AiUnavailable;

export type AiFetch = (input: URL | string, init?: RequestInit) => Promise<Response>;

export interface AiMarketplaceRecommendationRequest {
  readonly userContext: {
    readonly interests: readonly string[];
    readonly categorySignals: readonly {
      readonly category: string;
      readonly strength: number;
      readonly source: 'bookmark' | 'view';
    }[];
  };
  readonly candidates: readonly {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly category: string;
    readonly createdAt: string;
  }[];
  readonly limit: number;
}

export interface AiMarketplaceRecommendationResponse {
  readonly recommenderVersion: 'marketplace-hybrid-v1';
  readonly strategy: 'hybrid' | 'profile' | 'recent';
  readonly results: readonly {
    readonly listingId: string;
    readonly score: number;
    readonly reasons: readonly string[];
  }[];
}

export interface AiAssistantEvidence {
  readonly relevance: number;
  readonly route: string;
  readonly snippet: string;
  readonly sourceId: string;
  readonly sourceType: 'LOST_FOUND' | 'MARKETPLACE' | 'SERVICE' | 'TEAMUP';
  readonly title: string;
}

export interface AiAssistantRerankRequest {
  readonly contractVersion: 'campus-assistant-grounded-v1';
  readonly evidence: readonly AiAssistantEvidence[];
  readonly limit: number;
  readonly question: string;
}

export interface AiAssistantRerankResponse {
  readonly contractVersion: 'campus-assistant-grounded-v1';
  readonly embeddingModel: string;
  readonly rankings: readonly {
    readonly score: number;
    readonly sourceId: string;
  }[];
  readonly rerankerVersion: 'assistant-minilm-rerank-v1';
  readonly status: 'empty' | 'ranked';
}

export interface AiAssistantGenerationRequest {
  readonly contractVersion: 'campus-assistant-grounded-v1';
  readonly evidence: readonly AiAssistantEvidence[];
  readonly question: string;
}

export interface AiAssistantGenerationResponse {
  readonly answer: string;
  readonly citationIds: readonly string[];
  readonly contractVersion: 'campus-assistant-grounded-v1';
  readonly errorCode:
    | 'authentication_failed'
    | 'feature_disabled'
    | 'invalid_configuration'
    | 'invalid_provider_response'
    | 'provider_initialization_failed'
    | 'provider_unavailable'
    | 'quota_exceeded'
    | 'timeout'
    | null;
  readonly model: string | null;
  readonly provider: 'gemini' | null;
  readonly status: 'answered' | 'insufficient_evidence' | 'unavailable' | 'unsupported';
}
