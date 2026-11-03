import { AppError } from '../../errors/app-error.js';
import type { ConversationType } from '../../generated/prisma/client.js';
import { messagingEvents } from './messaging.events.js';
import { messagingRepository } from './messaging.repository.js';
import type { ConversationOpenInput } from './messaging.types.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { issueReadReceipt, verifyReadReceipt } from './messaging-read-receipt.js';

const missing = () =>
  new AppError({
    code: 'CONVERSATION_NOT_FOUND',
    message: 'Conversation not found.',
    statusCode: 404,
  });

export const messagingService = {
  list: async (
    userId: string,
    query: {
      contextType?: ConversationType;
      search?: string;
      cursor?: string;
      limit?: number;
      selected?: string;
    },
  ) => {
    return messagingRepository.inbox(userId, query);
  },
  open: async (userId: string, input: ConversationOpenInput) => {
    if (input.targetUserId === userId) {
      throw new AppError({
        code: 'INVALID_CONVERSATION_PARTICIPANT',
        message: 'You cannot start a conversation with yourself.',
        statusCode: 400,
      });
    }
    return messagingRepository.open(userId, input);
  },
  history: async (userId: string, id: string, page: number, limit: number) => {
    if (!(await messagingRepository.get(id, userId))) throw missing();
    return messagingRepository.history(id, page, limit);
  },
  historyPage: async (userId: string, id: string, page: number, limit: number) => {
    const messages = await messagingService.history(userId, id, page, limit);
    return {
      messages,
      readReceipt: issueReadReceipt(
        userId,
        id,
        messages.map((message) => message.id),
      ),
    };
  },
  updates: async (
    userId: string,
    id: string,
    after: string,
    limit: number,
    recent = false,
    floor?: string,
  ) => {
    if (!(await messagingRepository.get(id, userId))) throw missing();
    const result = await (recent
      ? messagingRepository.recent(id, after, limit, floor)
      : messagingRepository.updates(id, after, limit));
    return {
      ...result,
      nextCursor: result.messages.at(-1)?.id ?? after,
      readReceipt: issueReadReceipt(
        userId,
        id,
        result.messages.map((message) => message.id),
      ),
    };
  },
  send: async (userId: string, id: string, text: string, clientMessageId?: string) => {
    const conversation = await messagingRepository.get(id, userId);
    if (!conversation) throw missing();
    const result = await messagingRepository.send(conversation, userId, text, clientMessageId);
    if (!result.created) return result.message;
    try {
      messagingEvents.emit('message', result.message, [userId, result.receiverId]);
    } catch {
      console.error('Messaging live delivery failed after persistence.', {
        messageId: result.message.id,
      });
    }
    try {
      const details = await messagingRepository.notificationDetails(conversation, userId);
      await notificationsService.createSafely({
        description: conversation.contextType === 'DIRECT' ? null : details.contextLabel,
        entityId: conversation.id,
        entityType: 'MESSAGING',
        eventId: result.message.id,
        kind:
          conversation.contextType === 'MARKETPLACE' ? 'MARKETPLACE_MESSAGE' : 'MESSAGE_RECEIVED',
        recipientId: result.receiverId,
        title:
          conversation.contextType === 'MARKETPLACE'
            ? `New Marketplace message from ${details.senderName}`
            : `New message from ${details.senderName}`,
      });
    } catch {
      console.error('Messaging notification failed after persistence.', {
        messageId: result.message.id,
      });
    }
    return result.message;
  },
  markRead: async (userId: string, id: string, readReceipt: unknown) => {
    if (!(await messagingRepository.get(id, userId))) throw missing();
    const ids = verifyReadReceipt(readReceipt, userId, id);
    const result = await messagingRepository.markRead(id, userId, ids);
    if (result.count > 0) {
      // Only invalidate this reader's own tabs; no content or peer identity travels.
      try {
        messagingEvents.emit('read', { conversationId: id }, [userId]);
      } catch {
        console.error('Messaging read invalidation failed after persistence.');
      }
    }
    return { updated: result.count };
  },
};
