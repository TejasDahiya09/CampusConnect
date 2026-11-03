import { Router, type RequestHandler } from 'express';
import { createAssistantRateLimit } from './assistant-rate-limit.js';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { createAssistantController } from './assistant.controller.js';
import { assistantRetrievalService, type AssistantRetrievalService } from './assistant.service.js';
import {
  assistantRerankingService,
  type AssistantRerankingService,
} from './assistant-reranking.service.js';
import { assistantAnswerService, type AssistantAnswerService } from './assistant-answer.service.js';

interface AssistantRouterDependencies {
  readonly requireAuth: RequestHandler;
  readonly service: AssistantRetrievalService;
  readonly rerankingService?: AssistantRerankingService;
  readonly answerService?: AssistantAnswerService;
}

export const createAssistantRouter = ({
  requireAuth,
  service,
  rerankingService = assistantRerankingService,
  answerService = assistantAnswerService,
}: AssistantRouterDependencies) => {
  const router = Router();
  const controller = createAssistantController(service, rerankingService, answerService);
  router.use(requireAuth);
  router.use(createAssistantRateLimit());
  router.get('/retrieval', controller.retrieve);
  router.get('/reranked-retrieval', controller.rerank);
  router.post('/ask', controller.ask);
  return router;
};

export const assistantRouter = createAssistantRouter({
  requireAuth: authenticationMiddleware.requireAuth,
  service: assistantRetrievalService,
});
