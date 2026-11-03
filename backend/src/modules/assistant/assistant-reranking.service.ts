import { aiClient, type AiClient } from '../../integrations/ai/ai-client.js';
import type { AssistantEvidence, AssistantRetrievalQuery } from './assistant.types.js';
import { assistantRetrievalService, type AssistantRetrievalService } from './assistant.service.js';

export const ASSISTANT_RERANK_LIMIT = 10;

export interface AssistantRankedRetrievalResponse {
  readonly qualification?: { readonly checked: number; readonly unknown: number };
  readonly contractVersion: 'campus-assistant-grounded-v1';
  readonly evidence: readonly AssistantEvidence[];
  readonly rerankerVersion: 'assistant-minilm-rerank-v1' | null;
  readonly retrievalMode: 'insufficient_evidence' | 'lexical_fallback' | 'semantic';
}

const lexicalFallback = (
  evidence: readonly AssistantEvidence[],
): AssistantRankedRetrievalResponse => ({
  contractVersion: 'campus-assistant-grounded-v1',
  evidence: evidence.slice(0, ASSISTANT_RERANK_LIMIT),
  rerankerVersion: null,
  retrievalMode: 'lexical_fallback',
});

export const createAssistantRerankingService = (
  retrievalService: AssistantRetrievalService = assistantRetrievalService,
  client: AiClient = aiClient,
) => ({
  async retrieve(input: AssistantRetrievalQuery): Promise<AssistantRankedRetrievalResponse> {
    const lexical = await retrievalService.retrieve(input);
    if (lexical.evidence.length === 0) {
      return {
        contractVersion: 'campus-assistant-grounded-v1',
        evidence: [],
        ...(lexical.qualification ? { qualification: lexical.qualification } : {}),
        rerankerVersion: null,
        retrievalMode: 'insufficient_evidence',
      };
    }
    if (input.teamSize || client.rerankAssistant === undefined)
      return {
        ...lexicalFallback(lexical.evidence),
        ...(lexical.qualification ? { qualification: lexical.qualification } : {}),
      };

    const result = await client
      .rerankAssistant({
        contractVersion: lexical.contractVersion,
        evidence: lexical.evidence,
        limit: ASSISTANT_RERANK_LIMIT,
        question: input.question,
      })
      .catch(() => ({ status: 'UNAVAILABLE' }) as const);
    if (result.status !== 'AVAILABLE' || result.data.status !== 'ranked')
      return {
        ...lexicalFallback(lexical.evidence),
        ...(lexical.qualification ? { qualification: lexical.qualification } : {}),
      };

    const authorized = new Map(lexical.evidence.map((item) => [item.sourceId, item]));
    const seen = new Set<string>();
    const ranked: AssistantEvidence[] = [];
    for (const item of result.data.rankings) {
      const evidence = authorized.get(item.sourceId);
      if (
        evidence === undefined ||
        seen.has(item.sourceId) ||
        !Number.isFinite(item.score) ||
        item.score < 0 ||
        item.score > 1 ||
        ranked.length >= ASSISTANT_RERANK_LIMIT
      )
        return {
          ...lexicalFallback(lexical.evidence),
          ...(lexical.qualification ? { qualification: lexical.qualification } : {}),
        };
      seen.add(item.sourceId);
      ranked.push({ ...evidence, relevance: item.score });
    }
    if (ranked.length === 0)
      return {
        ...lexicalFallback(lexical.evidence),
        ...(lexical.qualification ? { qualification: lexical.qualification } : {}),
      };

    return {
      contractVersion: 'campus-assistant-grounded-v1',
      evidence: ranked,
      ...(lexical.qualification ? { qualification: lexical.qualification } : {}),
      rerankerVersion: result.data.rerankerVersion,
      retrievalMode: 'semantic',
    };
  },
});

export type AssistantRerankingService = ReturnType<typeof createAssistantRerankingService>;
export const assistantRerankingService = createAssistantRerankingService();
