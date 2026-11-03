import { randomUUID } from 'node:crypto';
import { aiServiceConfig } from './ai.config.js';
import type {
  AiClientResult,
  AiFetch,
  AiHealth,
  AiReadiness,
  AiLostFoundMatchRequest,
  AiLostFoundMatchResponse,
  AiServiceConfig,
  AiUnavailable,
  AiVersion,
  AiMarketplaceRecommendationRequest,
  AiMarketplaceRecommendationResponse,
  AiAssistantRerankRequest,
  AiAssistantRerankResponse,
  AiAssistantGenerationRequest,
  AiAssistantGenerationResponse,
} from './ai.types.js';

interface AiVersionResponse {
  readonly api_version: 'v1';
  readonly capabilities: readonly string[];
  readonly service: string;
  readonly version: string;
}

interface AiLostFoundMatchWire {
  readonly confidence: 'HIGH' | 'LOW' | 'MEDIUM';
  readonly reasons: readonly string[];
  readonly report_id: string;
  readonly score: number;
  readonly signals: {
    readonly category: number;
    readonly location: number;
    readonly text: number;
    readonly time: number;
    readonly image?: number | null;
  };
  readonly scoring_mode?: 'baseline' | 'multimodal' | 'semantic';
}

interface AiLostFoundResponseWire {
  readonly matcher_version: 'lf-baseline-v1' | 'lf-multimodal-v1' | 'lf-semantic-v1';
  readonly matches: readonly AiLostFoundMatchWire[];
}

const isUnit = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const isLostFoundMatch = (value: unknown): value is AiLostFoundMatchWire =>
  isRecord(value) &&
  typeof value.report_id === 'string' &&
  isUnit(value.score) &&
  (value.confidence === 'HIGH' || value.confidence === 'MEDIUM' || value.confidence === 'LOW') &&
  Array.isArray(value.reasons) &&
  value.reasons.every((reason) => typeof reason === 'string') &&
  isRecord(value.signals) &&
  isUnit(value.signals.text) &&
  isUnit(value.signals.category) &&
  isUnit(value.signals.location) &&
  isUnit(value.signals.time) &&
  (value.signals.image === undefined ||
    value.signals.image === null ||
    isUnit(value.signals.image)) &&
  (value.scoring_mode === undefined ||
    value.scoring_mode === 'baseline' ||
    value.scoring_mode === 'semantic' ||
    value.scoring_mode === 'multimodal');

const isLostFoundResponse = (value: unknown): value is AiLostFoundResponseWire => {
  if (
    !isRecord(value) ||
    (value.matcher_version !== 'lf-baseline-v1' &&
      value.matcher_version !== 'lf-semantic-v1' &&
      value.matcher_version !== 'lf-multimodal-v1')
  ) {
    return false;
  }

  const matches = value.matches;
  if (!Array.isArray(matches) || !matches.every(isLostFoundMatch)) return false;

  const reportIds = matches.map((match) => match.report_id);
  return (
    reportIds.length === new Set(reportIds).size &&
    matches.every((match, index) => index === 0 || matches[index - 1]!.score >= match.score)
  );
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const isHealth = (value: unknown): value is AiHealth =>
  isRecord(value) &&
  value.status === 'ok' &&
  typeof value.service === 'string' &&
  typeof value.version === 'string';

const isReadiness = (value: unknown): value is AiReadiness =>
  isRecord(value) &&
  value.ready === true &&
  typeof value.service === 'string' &&
  typeof value.version === 'string';

const isVersion = (value: unknown): value is AiVersionResponse =>
  isRecord(value) &&
  value.api_version === 'v1' &&
  Array.isArray(value.capabilities) &&
  value.capabilities.every((capability) => typeof capability === 'string') &&
  typeof value.service === 'string' &&
  typeof value.version === 'string';

const unavailable = (code: AiUnavailable['code']): AiUnavailable => ({
  code,
  status: 'UNAVAILABLE',
});

const toVersion = (value: AiVersionResponse): AiVersion => ({
  apiVersion: 'v1',
  capabilities: [...value.capabilities],
  service: value.service,
  version: value.version,
});

export interface AiClient {
  getHealth(): Promise<AiClientResult<AiHealth>>;
  getReadiness(): Promise<AiClientResult<AiReadiness>>;
  matchLostFound(
    request: AiLostFoundMatchRequest,
  ): Promise<AiClientResult<AiLostFoundMatchResponse>>;
  getVersion(): Promise<AiClientResult<AiVersion>>;
  recommendMarketplace?(
    request: AiMarketplaceRecommendationRequest,
  ): Promise<AiClientResult<AiMarketplaceRecommendationResponse>>;
  rerankAssistant?(
    request: AiAssistantRerankRequest,
  ): Promise<AiClientResult<AiAssistantRerankResponse>>;
  generateAssistant?(
    request: AiAssistantGenerationRequest,
  ): Promise<AiClientResult<AiAssistantGenerationResponse>>;
}

const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isAssistantRerankResponse = (
  value: unknown,
  authorizedIds: ReadonlySet<string>,
  limit: number,
): value is {
  contract_version: 'campus-assistant-grounded-v1';
  embedding_model: string;
  rankings: readonly { score: number; source_id: string }[];
  reranker_version: 'assistant-minilm-rerank-v1';
  status: 'empty' | 'ranked';
} => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'contract_version',
      'embedding_model',
      'rankings',
      'reranker_version',
      'status',
    ]) ||
    value.contract_version !== 'campus-assistant-grounded-v1' ||
    value.reranker_version !== 'assistant-minilm-rerank-v1' ||
    typeof value.embedding_model !== 'string' ||
    value.embedding_model.length < 1 ||
    value.embedding_model.length > 180 ||
    (value.status !== 'ranked' && value.status !== 'empty') ||
    !Array.isArray(value.rankings) ||
    value.rankings.length > limit
  )
    return false;

  const ids: string[] = [];
  let previous: { score: number; sourceId: string } | undefined;
  for (const item of value.rankings as unknown[]) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ['score', 'source_id']) ||
      typeof item.source_id !== 'string' ||
      !authorizedIds.has(item.source_id) ||
      !isUnit(item.score)
    )
      return false;
    if (
      previous !== undefined &&
      (previous.score < item.score ||
        (previous.score === item.score && previous.sourceId.localeCompare(item.source_id) > 0))
    )
      return false;
    ids.push(item.source_id);
    previous = { score: item.score, sourceId: item.source_id };
  }
  if (ids.length !== new Set(ids).size) return false;
  return value.status === 'empty' ? ids.length === 0 : ids.length > 0;
};

type AssistantErrorCode = Exclude<AiAssistantGenerationResponse['errorCode'], null>;
const isAssistantErrorCode = (value: unknown): value is AssistantErrorCode =>
  value === 'authentication_failed' ||
  value === 'feature_disabled' ||
  value === 'invalid_configuration' ||
  value === 'invalid_provider_response' ||
  value === 'provider_initialization_failed' ||
  value === 'provider_unavailable' ||
  value === 'quota_exceeded' ||
  value === 'timeout';

const isAssistantGenerationResponse = (
  value: unknown,
  authorizedIds: ReadonlySet<string>,
): value is {
  answer: string;
  citations: readonly { source_id: string }[];
  contract_version: 'campus-assistant-grounded-v1';
  error_code: AssistantErrorCode | null;
  model: string | null;
  provider: 'gemini' | null;
  status: 'answered' | 'insufficient_evidence' | 'unavailable' | 'unsupported';
} => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'answer',
      'citations',
      'contract_version',
      'error_code',
      'model',
      'provider',
      'status',
    ]) ||
    value.contract_version !== 'campus-assistant-grounded-v1' ||
    typeof value.answer !== 'string' ||
    value.answer.length < 1 ||
    value.answer.length > 4000 ||
    /\b(?:https?:\/\/|www\.)/iu.test(value.answer) ||
    !['answered', 'insufficient_evidence', 'unavailable', 'unsupported'].includes(
      String(value.status),
    ) ||
    !Array.isArray(value.citations) ||
    value.citations.length > 10 ||
    (value.provider !== null && value.provider !== 'gemini') ||
    (value.model !== null && (typeof value.model !== 'string' || value.model.length > 120)) ||
    (value.provider === null) !== (value.model === null) ||
    (value.error_code !== null && !isAssistantErrorCode(value.error_code))
  )
    return false;

  const ids: string[] = [];
  for (const citation of value.citations as unknown[]) {
    if (
      !isRecord(citation) ||
      !hasExactKeys(citation, ['source_id']) ||
      typeof citation.source_id !== 'string' ||
      !authorizedIds.has(citation.source_id)
    )
      return false;
    ids.push(citation.source_id);
  }
  if (ids.length !== new Set(ids).size) return false;
  if (value.status === 'answered' ? ids.length === 0 : ids.length > 0) return false;
  return value.status === 'unavailable' ? value.error_code !== null : value.error_code === null;
};

const isRecommendationResponse = (
  value: unknown,
  authorizedIds: ReadonlySet<string>,
  limit: number,
): value is {
  recommender_version: 'marketplace-hybrid-v1';
  strategy: 'hybrid' | 'profile' | 'recent';
  results: readonly { listing_id: string; score: number; reasons: readonly string[] }[];
} => {
  const allowedReasons = new Set([
    'Matches your interests',
    'Similar to items you saved',
    "Based on items you've viewed",
    'Recently listed',
  ]);
  if (
    !isRecord(value) ||
    value.recommender_version !== 'marketplace-hybrid-v1' ||
    (value.strategy !== 'hybrid' && value.strategy !== 'profile' && value.strategy !== 'recent') ||
    !Array.isArray(value.results) ||
    value.results.length > limit
  )
    return false;
  const ids: string[] = [];
  for (const item of value.results as unknown[]) {
    if (
      !isRecord(item) ||
      typeof item.listing_id !== 'string' ||
      !isUnit(item.score) ||
      !Array.isArray(item.reasons) ||
      item.reasons.length > allowedReasons.size ||
      !item.reasons.every((reason) => typeof reason === 'string' && allowedReasons.has(reason)) ||
      item.reasons.length !== new Set(item.reasons).size ||
      !authorizedIds.has(item.listing_id)
    )
      return false;
    ids.push(item.listing_id);
  }
  return ids.length === new Set(ids).size;
};

export const createAiClient = (config: AiServiceConfig, fetchImpl: AiFetch = fetch): AiClient => {
  const request = async <TResponse, TResult>(
    path:
      | '/health'
      | '/ready'
      | '/version'
      | '/api/v1/lost-found/match'
      | '/api/v1/recommendations/marketplace'
      | '/api/v1/assistant/rerank'
      | '/api/v1/assistant/generate',
    valid: (value: unknown) => value is TResponse,
    map: (value: TResponse) => TResult,
    requestBody?: string,
    timeoutMs = config.timeoutMs,
  ): Promise<AiClientResult<TResult>> => {
    if (!config.enabled) return { status: 'DISABLED' };
    if (config.url === undefined) return unavailable('AI_SERVICE_NETWORK_ERROR');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const correlationId = randomUUID();
    const startedAt = performance.now();

    try {
      const response = await fetchImpl(`${config.url}${path}`, {
        headers: {
          Accept: 'application/json',
          ...(requestBody === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(requestBody === undefined || config.apiKey === undefined
            ? {}
            : { 'X-CampusConnect-AI-Key': config.apiKey }),
          'X-Request-ID': correlationId,
        },
        method: requestBody === undefined ? 'GET' : 'POST',
        signal: controller.signal,
        ...(requestBody === undefined ? {} : { body: requestBody }),
      });

      if (!response.ok) {
        console.error('AI service request failed.', {
          category: 'HTTP_ERROR',
          correlationId,
          durationMs: Math.round(performance.now() - startedAt),
          path,
          status: response.status,
        });
        return unavailable('AI_SERVICE_HTTP_ERROR');
      }

      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch {
        console.error('AI service request failed.', {
          category: 'INVALID_JSON',
          correlationId,
          path,
        });
        return unavailable('AI_SERVICE_INVALID_RESPONSE');
      }

      if (!valid(responseBody)) {
        console.error('AI service request failed.', {
          category: 'INVALID_RESPONSE',
          correlationId,
          path,
        });
        return unavailable('AI_SERVICE_INVALID_RESPONSE');
      }
      return { data: map(responseBody), status: 'AVAILABLE' };
    } catch {
      const category = controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR';
      console.error('AI service request failed.', {
        category,
        correlationId,
        durationMs: Math.round(performance.now() - startedAt),
        path,
      });
      return unavailable(
        controller.signal.aborted ? 'AI_SERVICE_TIMEOUT' : 'AI_SERVICE_NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    getHealth: () => request('/health', isHealth, (value) => value),
    getReadiness: () => request('/ready', isReadiness, (value) => value),
    matchLostFound: (input) =>
      request(
        '/api/v1/lost-found/match',
        isLostFoundResponse,
        (value) => ({
          matcherVersion: value.matcher_version,
          matches: value.matches.map((match) => ({
            confidence: match.confidence,
            reasons: [...match.reasons],
            reportId: match.report_id,
            score: match.score,
            scoringMode: match.scoring_mode ?? 'semantic',
            signals: {
              category: match.signals.category,
              location: match.signals.location,
              text: match.signals.text,
              time: match.signals.time,
              image: match.signals.image ?? null,
            },
          })),
        }),
        JSON.stringify({
          candidates: input.candidates.map((report) => ({
            category: report.category,
            description: report.description,
            id: report.id,
            incident_at: report.incidentAt,
            location: report.location,
            title: report.title,
            type: report.type,
            images: report.images?.map((image) => ({
              content_base64: image.contentBase64,
              mime_type: image.mimeType,
            })),
          })),
          query: {
            category: input.query.category,
            description: input.query.description,
            id: input.query.id,
            incident_at: input.query.incidentAt,
            location: input.query.location,
            title: input.query.title,
            type: input.query.type,
            images: input.query.images?.map((image) => ({
              content_base64: image.contentBase64,
              mime_type: image.mimeType,
            })),
          },
          top_k: input.topK,
        }),
      ),
    getVersion: () => request('/version', isVersion, toVersion),
    recommendMarketplace: (input) =>
      request(
        '/api/v1/recommendations/marketplace',
        (
          value,
        ): value is {
          recommender_version: 'marketplace-hybrid-v1';
          strategy: 'hybrid' | 'profile' | 'recent';
          results: readonly { listing_id: string; score: number; reasons: readonly string[] }[];
        } =>
          isRecommendationResponse(
            value,
            new Set(input.candidates.map(({ id }) => id)),
            input.limit,
          ),
        (value) => ({
          recommenderVersion: value.recommender_version,
          strategy: value.strategy,
          results: value.results.map((item) => ({
            listingId: item.listing_id,
            score: item.score,
            reasons: [...item.reasons],
          })),
        }),
        JSON.stringify({
          user_context: {
            interests: input.userContext.interests,
            category_signals: input.userContext.categorySignals,
          },
          candidates: input.candidates.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            category: item.category,
            created_at: item.createdAt,
          })),
          limit: input.limit,
        }),
      ),
    rerankAssistant: (input) =>
      request(
        '/api/v1/assistant/rerank',
        (
          value,
        ): value is {
          contract_version: 'campus-assistant-grounded-v1';
          embedding_model: string;
          rankings: readonly { score: number; source_id: string }[];
          reranker_version: 'assistant-minilm-rerank-v1';
          status: 'empty' | 'ranked';
        } =>
          isAssistantRerankResponse(
            value,
            new Set(input.evidence.map(({ sourceId }) => sourceId)),
            input.limit,
          ),
        (value) => ({
          contractVersion: value.contract_version,
          embeddingModel: value.embedding_model,
          rankings: value.rankings.map((item) => ({
            score: item.score,
            sourceId: item.source_id,
          })),
          rerankerVersion: value.reranker_version,
          status: value.status,
        }),
        JSON.stringify({
          contract_version: input.contractVersion,
          evidence: input.evidence.map((item) => ({
            relevance: item.relevance,
            route: item.route,
            snippet: item.snippet,
            source_id: item.sourceId,
            source_type: item.sourceType,
            title: item.title,
          })),
          limit: input.limit,
          question: input.question,
        }),
      ),
    generateAssistant: (input) =>
      request(
        '/api/v1/assistant/generate',
        (
          value,
        ): value is {
          answer: string;
          citations: readonly { source_id: string }[];
          contract_version: 'campus-assistant-grounded-v1';
          error_code: AssistantErrorCode | null;
          model: string | null;
          provider: 'gemini' | null;
          status: 'answered' | 'insufficient_evidence' | 'unavailable' | 'unsupported';
        } =>
          isAssistantGenerationResponse(
            value,
            new Set(input.evidence.map(({ sourceId }) => sourceId)),
          ),
        (value) => ({
          answer: value.answer,
          citationIds: value.citations.map(({ source_id: sourceId }) => sourceId),
          contractVersion: value.contract_version,
          errorCode: value.error_code,
          model: value.model,
          provider: value.provider,
          status: value.status,
        }),
        JSON.stringify({
          contract_version: input.contractVersion,
          evidence: input.evidence.map((item) => ({
            relevance: item.relevance,
            route: item.route,
            snippet: item.snippet,
            source_id: item.sourceId,
            source_type: item.sourceType,
            title: item.title,
          })),
          question: input.question,
        }),
        config.generationTimeoutMs,
      ),
  };
};

export const aiClient = createAiClient(aiServiceConfig);
