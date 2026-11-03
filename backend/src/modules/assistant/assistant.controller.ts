import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { assistantRetrievalService, type AssistantRetrievalService } from './assistant.service.js';
import { parseAssistantAskBody, parseAssistantRetrievalQuery } from './assistant.validation.js';
import {
  assistantRerankingService,
  type AssistantRerankingService,
} from './assistant-reranking.service.js';
import { assistantAnswerService, type AssistantAnswerService } from './assistant-answer.service.js';

export const createAssistantController = (
  service: AssistantRetrievalService = assistantRetrievalService,
  rerankingService: AssistantRerankingService = assistantRerankingService,
  answerService: AssistantAnswerService = assistantAnswerService,
) => ({
  ask: (async (request, response) => {
    sendSuccess(response, await answerService.answer(parseAssistantAskBody(request.body)));
  }) satisfies RequestHandler,
  retrieve: (async (request, response) => {
    sendSuccess(response, await service.retrieve(parseAssistantRetrievalQuery(request.query)));
  }) satisfies RequestHandler,
  rerank: (async (request, response) => {
    sendSuccess(
      response,
      await rerankingService.retrieve(parseAssistantRetrievalQuery(request.query)),
    );
  }) satisfies RequestHandler,
});

export const assistantController = createAssistantController();
