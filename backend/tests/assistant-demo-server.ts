/** Isolated synthetic HTTP adapter for Chrome QA. Never connects to a database/provider. */
import express from 'express';
import cors from 'cors';
import { createAssistantRouter } from '../src/modules/assistant/assistant.routes.js';
import { createAssistantRetrievalService } from '../src/modules/assistant/assistant.service.js';
import { createAssistantRerankingService } from '../src/modules/assistant/assistant-reranking.service.js';
import { createAssistantAnswerService } from '../src/modules/assistant/assistant-answer.service.js';
import { createAuthenticationMiddleware } from '../src/modules/auth/auth.middleware.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import type { AiClient } from '../src/integrations/ai/ai-client.js';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';

const client: AiClient = {
  getHealth: () => Promise.resolve({ status: 'DISABLED' }),
  getReadiness: () => Promise.resolve({ status: 'DISABLED' }),
  getVersion: () => Promise.resolve({ status: 'DISABLED' }),
  matchLostFound: () => Promise.resolve({ status: 'DISABLED' }),
  generateAssistant: (input) =>
    Promise.resolve(
      input.question.includes('long')
        ? {
            status: 'AVAILABLE',
            data: {
              contractVersion: 'campus-assistant-grounded-v1',
              answer: (
                'Synthetic long explanation for layout checks only. '.repeat(18) + '\n\n'
              ).repeat(3),
              citationIds: ['synthetic-qa-one'],
              errorCode: null,
              provider: 'gemini',
              model: 'synthetic-fixture-only',
              status: 'answered',
            },
          }
        : { status: 'DISABLED' },
    ),
};
const retrieve = createAssistantRetrievalService({
  retrieve: async (sourceType, terms, _limit, _active) => {
    await Promise.resolve();
    if (terms.includes('failure')) throw Error('Synthetic retrieval failure');
    if (terms.includes('empty')) return [];
    if (terms.includes('slow')) await new Promise((resolve) => setTimeout(resolve, 400));
    if (sourceType === 'LOST_FOUND')
      return [
        {
          sourceType,
          id: 'synthetic-bag',
          title: 'Found black backpack',
          description: 'Black backpack found near the library.',
          attributes: ['FOUND'],
          facts: {
            kind: 'LOST_FOUND' as const,
            reportType: 'FOUND' as const,
            status: 'OPEN',
            location: 'Library',
          },
          createdAt: new Date(),
          searchText: 'black backpack library',
        },
        {
          sourceType,
          id: 'synthetic-calculator',
          title: 'Found calculator',
          description: 'Calculator found near the library.',
          attributes: ['FOUND'],
          facts: {
            kind: 'LOST_FOUND' as const,
            reportType: 'FOUND' as const,
            status: 'OPEN',
            location: 'Library',
          },
          createdAt: new Date(),
          searchText: 'calculator library',
        },
        {
          sourceType,
          id: 'synthetic-lost-bag',
          title: 'Grey backpack reported lost',
          description: 'Grey bag missing at Student Centre.',
          attributes: ['LOST'],
          facts: {
            kind: 'LOST_FOUND' as const,
            reportType: 'LOST' as const,
            status: 'OPEN',
            location: 'Student Centre',
          },
          createdAt: new Date(),
          searchText: 'grey bag Student Centre',
        },
        {
          sourceType,
          id: 'synthetic-bottle',
          title: 'Found water bottle',
          description: 'Bottle found near Student Centre.',
          attributes: ['FOUND'],
          facts: {
            kind: 'LOST_FOUND' as const,
            reportType: 'FOUND' as const,
            status: 'OPEN',
            location: 'Student Centre',
          },
          createdAt: new Date(),
          searchText: 'bottle Student Centre',
        },
      ];
    if (sourceType === 'TEAMUP')
      return [
        {
          sourceType,
          id: 'synthetic-project',
          title: 'Synthetic AI project',
          description: 'AI collaboration project.',
          attributes: [],
          facts: {
            kind: 'TEAMUP' as const,
            status: 'OPEN',
            maxMembers: terms.includes('unknown') ? null : 4,
            currentMembers: terms.includes('unknown') ? null : 2,
          },
          createdAt: new Date(),
          searchText: 'ai project',
        },
      ];
    return [
      {
        sourceType,
        id: 'synthetic-qa-one',
        title: `Synthetic ${sourceType} calculator project design`,
        description: 'Synthetic QA description only.',
        attributes: [],
        createdAt: new Date('2026-11-02T00:00:00Z'),
        searchText: 'calculator design project team bag coding',
      },
    ];
  },
});
const rank = createAssistantRerankingService(retrieve, client);
const auth = createAuthenticationMiddleware({
  verifyAccessToken: async (token) => {
    await Promise.resolve();
    if (!/^synthetic-qa-token-[a-f0-9-]{36}$/.test(token))
      throw Error('Synthetic invalid identity');
    return {
      id: token.slice('synthetic-qa-token-'.length),
      email: 'qa@example.test',
      emailVerified: true,
      metadata: {},
    };
  },
  repository: {
    findById: (id) =>
      Promise.resolve({
        id,
        email: 'qa@example.test',
        status: AccountStatus.ACTIVE,
        role: UserRole.STUDENT,
        profile: null,
        universityEmail: null,
        universityEmailVerifiedAt: null,
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
  },
});
const app = express();
app.use(cors({ origin: /^http:\/\/127\.0\.0\.1:\d+$/ }));
app.use(express.json({ limit: '8kb' }));
app.use(
  '/api/assistant',
  createAssistantRouter({
    requireAuth: auth.requireAuth,
    service: retrieve,
    rerankingService: rank,
    answerService: createAssistantAnswerService(rank, client, { retrievalTimeoutMs: 200 }),
  }),
);
app.use(errorHandler);
const server = app.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string')
    console.log(`SYNTHETIC_ASSISTANT_PORT=${address.port}`);
});
