import { eligibleReport, factLabel, matchesTeamSize } from './assistant-facts.js';
import { aiClient, type AiClient } from '../../integrations/ai/ai-client.js';
import { assistantHelpPlan, type AssistantAction } from './assistant-help.js';
import type { AssistantEvidence, AssistantRetrievalQuery } from './assistant.types.js';
import {
  assistantRerankingService,
  type AssistantRankedRetrievalResponse,
  type AssistantRerankingService,
} from './assistant-reranking.service.js';
import {
  findDeterministicAssistantReply,
  type AssistantDeterministicResponseType,
} from './assistant-knowledge.js';

const READ_ONLY_MESSAGE =
  'I can only provide read-only information from public CampusConnect records.';
const INSUFFICIENT_MESSAGE =
  "I couldn't find enough authorized CampusConnect information to answer that question.";
const UNAVAILABLE_MESSAGE = 'The Campus Assistant is temporarily unavailable.';
const URL_PATTERN = /\b(?:https?:\/\/|www\.)/iu;
const UNSUPPORTED_PATTERNS = [
  /\b(?:can|could|would|will)\s+you\s+(?:buy|sell|claim|apply|message|book|create|edit|update|delete|post)\b/iu,
  /\bplease\s+(?:buy|sell|claim|apply|message|book|create|edit|update|delete|post)\b/iu,
  /\b(?:private messages?|claim evidence|private applications?|bookings?|passwords?|credentials?|email address|phone number)\b/iu,
  /\b(?:browse|search)\s+(?:the\s+)?web\b|\boutside\s+CampusConnect\b/iu,
] as const;

export interface AssistantAnswerCitation {
  readonly details?: string;
  readonly route: string;
  readonly sourceId: string;
  readonly sourceType: AssistantEvidence['sourceType'];
  readonly title: string;
}

export interface AssistantAnswerResponse {
  readonly actions?: readonly AssistantAction[];
  readonly answer: string;
  readonly citations: readonly AssistantAnswerCitation[];
  readonly contractVersion: 'campus-assistant-grounded-v1';
  readonly errorCode: string | null;
  readonly model: string | null;
  readonly provider: 'gemini' | null;
  readonly retrievalMode: AssistantRankedRetrievalResponse['retrievalMode'] | null;
  readonly responseType: AssistantDeterministicResponseType | 'grounded' | 'system';
  readonly status: 'answered' | 'insufficient_evidence' | 'unavailable' | 'unsupported';
}

const isUnsupported = (question: string) =>
  UNSUPPORTED_PATTERNS.some((pattern) => pattern.test(question));

const unavailable = (
  retrievalMode: AssistantRankedRetrievalResponse['retrievalMode'] | null,
  errorCode: string,
): AssistantAnswerResponse => ({
  answer:
    errorCode === 'retrieval_timeout'
      ? 'Searching campus records took too long. Please retry or browse the module directly.'
      : errorCode === 'retrieval_unavailable'
        ? 'I could not retrieve the live campus records just now. Please retry or browse the module directly.'
        : errorCode === 'AI_SERVICE_TIMEOUT' || errorCode === 'timeout'
          ? 'The AI request timed out. Please retry, or use the campus navigation links.'
          : errorCode === 'feature_disabled'
            ? 'AI generation is disabled. Campus workflow help and direct record search are still available.'
            : errorCode === 'AI_SERVICE_NETWORK_ERROR'
              ? 'The local AI service could not be reached. Campus workflow guidance is still available.'
              : errorCode === 'authentication_failed'
                ? 'The AI provider rejected its service credentials. Campus workflow guidance is still available.'
                : errorCode === 'quota_exceeded'
                  ? 'The AI provider quota is exhausted. Please use campus guidance or try later.'
                  : UNAVAILABLE_MESSAGE,
  citations: [],
  contractVersion: 'campus-assistant-grounded-v1',
  errorCode,
  model: null,
  provider: null,
  retrievalMode,
  responseType: 'system',
  status: 'unavailable',
});

export const createAssistantAnswerService = (
  rerankingService: AssistantRerankingService = assistantRerankingService,
  client: AiClient = aiClient,
  options: { retrievalTimeoutMs?: number } = {},
) => ({
  async answer(input: AssistantRetrievalQuery): Promise<AssistantAnswerResponse> {
    if (isUnsupported(input.question)) {
      return {
        answer: READ_ONLY_MESSAGE,
        citations: [],
        contractVersion: 'campus-assistant-grounded-v1',
        errorCode: null,
        model: null,
        provider: null,
        retrievalMode: null,
        responseType: 'system',
        status: 'unsupported',
      };
    }

    const plan = assistantHelpPlan(input.question, input.history);
    const deterministic = findDeterministicAssistantReply(input.question);
    if (deterministic !== null) {
      return {
        answer: deterministic.answer,
        ...(plan ? { actions: plan.actions } : {}),
        citations: [],
        contractVersion: 'campus-assistant-grounded-v1',
        errorCode: null,
        model: null,
        provider: null,
        retrievalMode: null,
        responseType: deterministic.responseType,
        status: 'answered',
      };
    }

    if (plan?.answer)
      return {
        answer: plan.answer,
        actions: plan.actions,
        citations: [],
        contractVersion: 'campus-assistant-grounded-v1',
        errorCode: null,
        model: null,
        provider: null,
        retrievalMode: null,
        responseType: 'platform_knowledge',
        status: 'answered',
      };
    if (plan?.source && !input.sourceTypes.includes(plan.source))
      return {
        ...unavailable(null, 'source_not_selected'),
        status: 'unsupported',
        errorCode: null,
        answer:
          'The relevant source is not selected for this question. Open the module directly or include that source in your search.',
        actions: plan.actions,
      };
    let retrieval: AssistantRankedRetrievalResponse;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      retrieval = await Promise.race([
        rerankingService.retrieve(
          plan?.source
            ? {
                question: plan.search ?? input.question,
                ...(plan.requiredTerms ? { requiredTerms: plan.requiredTerms } : {}),
                ...(plan.reportType ? { reportType: plan.reportType } : {}),
                ...(plan.teamSize ? { teamSize: plan.teamSize } : {}),
                sourceTypes: input.sourceTypes.includes(plan.source)
                  ? [plan.source]
                  : input.sourceTypes,
              }
            : input,
        ),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => {
            timedOut = true;
            reject(new Error('Assistant retrieval deadline'));
          }, options.retrievalTimeoutMs ?? 8_000);
        }),
      ]);
    } catch {
      return {
        ...unavailable(null, timedOut ? 'retrieval_timeout' : 'retrieval_unavailable'),
        ...(plan ? { actions: plan.actions } : {}),
        ...(plan?.guidance
          ? {
              answer:
                plan.guidance +
                '\n\n' +
                (timedOut
                  ? 'The search timed out. Please retry or browse Lost & Found.'
                  : 'I could not retrieve live reports. Please retry or browse Lost & Found.'),
            }
          : {}),
      };
    } finally {
      clearTimeout(deadline);
    }
    if (plan?.reportType)
      retrieval = {
        ...retrieval,
        evidence: retrieval.evidence.filter((item) => eligibleReport(item, plan.reportType!)),
      };
    if (plan?.teamSize)
      retrieval = {
        ...retrieval,
        evidence: retrieval.evidence.filter(
          (item) => matchesTeamSize(item.facts, plan.teamSize!) === true,
        ),
      };
    if (retrieval.evidence.length === 0) {
      return {
        answer: plan?.teamSize
          ? (retrieval.qualification?.unknown ?? 0) > 0
            ? 'Some checked project records do not establish that team-size count. I cannot confirm an exact match from those records. Browse TeamUp for broader opportunities.'
            : 'No project in the checked records meets that specific team-size requirement. Browse TeamUp for broader opportunities.'
          : plan?.reportType
            ? (plan?.guidance ? plan.guidance + '\n\n' : '') +
              `No matching eligible ${plan.reportType} reports were found in this search. You can create a report or browse Lost & Found; this search does not establish ownership or recovery.`
            : plan
              ? 'No matching records were found in the checked campus source. Try a shorter item name or browse the module. This does not mean no such item exists on campus.'
              : INSUFFICIENT_MESSAGE,
        ...(plan ? { actions: plan.actions } : {}),
        citations: [],
        contractVersion: 'campus-assistant-grounded-v1',
        errorCode: null,
        model: null,
        provider: null,
        retrievalMode: 'insufficient_evidence',
        responseType: 'system',
        status: 'insufficient_evidence',
      };
    }
    // Known discovery requests can show authorized references without external generation.
    // Never render retrieved descriptions as instructions or invent a model response.
    const citation = (item: AssistantEvidence): AssistantAnswerCitation => ({
      route: item.route,
      sourceId: item.sourceId,
      sourceType: item.sourceType,
      title: item.title,
      ...(factLabel(item.facts) ? { details: factLabel(item.facts)! } : {}),
    });
    const hasReportFacts = retrieval.evidence.some((item) => item.facts?.kind === 'LOST_FOUND');
    const searchFallback = (): AssistantAnswerResponse => ({
      answer:
        plan?.reportType || plan?.teamSize || hasReportFacts
          ? (plan?.guidance ? plan.guidance + '\n\n' : '') +
            (plan?.teamSize
              ? `Projects matching ${plan.teamSize.count} ${plan.teamSize.mode === 'total' ? 'maximum total members (including the lead). Capacity is not current membership' : plan.teamSize.mode === 'current' ? 'current members (including the lead)' : 'additional open places'}.`
              : plan?.reportType
                ? `Potentially relevant ${plan.reportType} reports. Similarity does not prove ownership or recovery.`
                : 'Lost reports describe missing items; found reports are possible recovery leads. Neither proves ownership or recovery.') +
            '\n\n' +
            retrieval.evidence
              .slice(0, 5)
              .map(
                (item) =>
                  `${item.title}: ${factLabel(item.facts) ?? 'Open the record for details.'}`,
              )
              .join('\n')
          : 'I cannot generate a summary right now, but here are the records I found. Open a record to check its current details.',
      ...(plan ? { actions: plan.actions } : {}),
      citations: retrieval.evidence.slice(0, 10).map(citation),
      contractVersion: 'campus-assistant-grounded-v1',
      errorCode: null,
      model: null,
      provider: null,
      retrievalMode: retrieval.retrievalMode,
      responseType: 'grounded',
      status: 'answered',
    });
    // Exact count qualification and display are trusted backend facts, not a model assertion.
    if (plan?.teamSize || (hasReportFacts && !plan?.reportType)) return searchFallback();
    if (client.generateAssistant === undefined)
      return plan ? searchFallback() : unavailable(retrieval.retrievalMode, 'provider_unavailable');

    const generated = await client
      .generateAssistant({
        contractVersion: retrieval.contractVersion,
        evidence: retrieval.evidence,
        question: plan?.search ?? input.question,
      })
      .catch(() => ({ status: 'UNAVAILABLE', code: 'AI_SERVICE_NETWORK_ERROR' }) as const);
    if (generated.status !== 'AVAILABLE') {
      if (plan) return searchFallback();
      return unavailable(
        retrieval.retrievalMode,
        generated.status === 'DISABLED' ? 'feature_disabled' : generated.code,
      );
    }

    const output = generated.data;
    // An eligible, item-filtered report remains a possible lead even if the model
    // declines to summarize it. The model cannot erase verified retrieval facts.
    if (plan?.reportType && output.status === 'insufficient_evidence') return searchFallback();
    if (
      output.status === 'answered' &&
      plan?.reportType &&
      (/\b(?:definitely|certainly|recovered|confirmed match|belongs to you)\b|\b(?:found|recovered) your\b/i.test(
        output.answer,
      ) ||
        (plan.reportType === 'FOUND' && /\breported (?:as )?lost\b/i.test(output.answer)) ||
        (plan.reportType === 'LOST' && /\breported (?:as )?found\b/i.test(output.answer)))
    )
      return searchFallback();
    if (
      output.status === 'answered' &&
      retrieval.evidence.some((item) => item.sourceType === 'TEAMUP') &&
      /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:members?|teammates?|people|open places|slots)\b/i.test(
        output.answer,
      )
    )
      return searchFallback();
    if (output.status === 'unavailable')
      return plan
        ? searchFallback()
        : unavailable(retrieval.retrievalMode, output.errorCode ?? 'provider_unavailable');
    if (URL_PATTERN.test(output.answer))
      return unavailable(retrieval.retrievalMode, 'invalid_provider_response');

    if (plan?.reportType) {
      const allowedStatuses = new Set(
        retrieval.evidence.flatMap((item) =>
          item.facts?.kind === 'LOST_FOUND' ? [item.facts.status] : [],
        ),
      );
      const claimed = [
        ...output.answer.matchAll(
          /\b(?:status(?: is|:)?|marked|listed as)\s+(OPEN|MATCHED|CLAIM_PENDING|RESOLVED|CLOSED|ARCHIVED)\b/gi,
        ),
      ].map((match) => match[1]?.toUpperCase());
      if (claimed.some((status) => !status || !allowedStatuses.has(status)))
        return searchFallback();
    }
    const authorized = new Map(retrieval.evidence.map((item) => [item.sourceId, item]));
    const cited = output.citationIds.map((sourceId) => authorized.get(sourceId));
    if (
      (output.status === 'answered' && cited.length === 0) ||
      (output.status !== 'answered' && cited.length > 0) ||
      cited.some((item) => item === undefined) ||
      output.citationIds.length !== new Set(output.citationIds).size
    )
      return unavailable(retrieval.retrievalMode, 'invalid_provider_response');

    const finalAnswer =
      (plan?.guidance ? plan.guidance + '\n\n' : '') +
      output.answer +
      (plan?.reportType
        ? `\n\nThese are ${plan.reportType} reports, not confirmed recoveries. Similarity does not prove ownership.`
        : '');
    if (finalAnswer.length > 4000) return searchFallback();
    return {
      answer: finalAnswer,
      ...(plan ? { actions: plan.actions } : {}),
      citations: cited.flatMap((item) => (item === undefined ? [] : [citation(item)])),
      contractVersion: output.contractVersion,
      errorCode: null,
      model: output.model,
      provider: output.provider,
      retrievalMode: retrieval.retrievalMode,
      responseType: output.status === 'answered' ? 'grounded' : 'system',
      status: output.status,
    };
  },
});

export type AssistantAnswerService = ReturnType<typeof createAssistantAnswerService>;
export const assistantAnswerService = createAssistantAnswerService();
