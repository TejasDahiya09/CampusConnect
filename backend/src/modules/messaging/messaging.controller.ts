import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { messagingService } from './messaging.service.js';
import {
  parseConversationId,
  parseHistoryQuery,
  parseInboxQuery,
  parseMessage,
  parseOpenConversation,
  parseClientMessageId,
  parseReadReceipt,
  parseUpdatesQuery,
} from './messaging.validation.js';

const userId = (request: Parameters<RequestHandler>[0]): string => {
  if (!request.auth) throw new Error('Authentication context unavailable.');
  return request.auth.user.id;
};

export const messagingController = {
  updates: (async (request, response) => {
    const query = parseUpdatesQuery(request.query);
    return sendSuccess(
      response,
      await messagingService.updates(
        userId(request),
        parseConversationId(request.params.id),
        query.after,
        query.limit,
        query.mode === 'recent',
        query.floor,
      ),
    );
  }) satisfies RequestHandler,
  list: (async (request, response) =>
    sendSuccess(
      response,
      await messagingService.list(userId(request), parseInboxQuery(request.query)),
    )) satisfies RequestHandler,
  open: (async (request, response) =>
    sendSuccess(
      response,
      {
        conversation: await messagingService.open(
          userId(request),
          parseOpenConversation(request.body),
        ),
      },
      { statusCode: 201 },
    )) satisfies RequestHandler,
  history: (async (request, response) => {
    const query = parseHistoryQuery(request.query);
    return sendSuccess(
      response,
      await messagingService.historyPage(
        userId(request),
        parseConversationId(request.params.id),
        query.page,
        query.limit,
      ),
    );
  }) satisfies RequestHandler,
  send: (async (request, response) =>
    sendSuccess(
      response,
      {
        message: await messagingService.send(
          userId(request),
          parseConversationId(request.params.id),
          parseMessage(request.body),
          parseClientMessageId(request.body),
        ),
      },
      { statusCode: 201 },
    )) satisfies RequestHandler,
  markRead: (async (request, response) =>
    sendSuccess(
      response,
      await messagingService.markRead(
        userId(request),
        parseConversationId(request.params.id),
        parseReadReceipt(request.body),
      ),
    )) satisfies RequestHandler,
};
