import { subscribeMessagingRealtime } from './messaging-realtime';
import type { RealtimeSubscriber } from './realtime-lifecycle';
import { ApiClientError, apiRequest } from '../../services/api-client';
import type { ConversationContext, InboxResult, MessageView } from './messaging.types';
const requestWindow = () => ({ signal: AbortSignal.timeout(15_000) });

export const buildMessagingInboxPath = (
  contextType?: ConversationContext,
  search?: string,
  cursor?: string,
  selected?: string,
) => {
  const query = new URLSearchParams();
  if (contextType) query.set('contextType', contextType);
  if (search) query.set('search', search);
  if (cursor) query.set('cursor', cursor);
  if (selected) query.set('selected', selected);
  return `/api/messages${query.size ? `?${query.toString()}` : ''}`;
};

export const addUniqueMessage = (messages: readonly MessageView[], incoming: MessageView) =>
  messages.some(({ id }) => id === incoming.id) ? messages : [...messages, incoming];

export interface MessageAttempt {
  readonly id: string;
  readonly text: string;
  readonly clientMessageId: string;
}
export const messageAttempt = (
  previous: MessageAttempt | undefined,
  id: string,
  text: string,
  newId: () => string = () => crypto.randomUUID(),
): MessageAttempt =>
  previous?.id === id && previous.text === text ? previous : { id, text, clientMessageId: newId() };

export const isTransientMessagingError = (error: unknown): boolean =>
  error instanceof ApiClientError
    ? error.status === 408 || error.status >= 500
    : error instanceof Error && error.name !== 'AbortError';

export const withTransientMessagingRetry = async <T>(
  operation: () => Promise<T>,
  wait: () => Promise<void> = () =>
    new Promise((resolve) => {
      window.setTimeout(resolve, 250);
    }),
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientMessagingError(error)) throw error;
    await wait();
    return operation();
  }
};

export const createLatestRequestGate = () => {
  let current = 0;
  return {
    begin: () => {
      current += 1;
      return current;
    },
    isCurrent: (requestId: number) => requestId === current,
  };
};

export const messagingService = {
  updates: (id: string, after: string, recent = false, floor?: string) =>
    apiRequest<{
      messages: readonly MessageView[];
      readReceipt: string;
      nextCursor: string;
      hasMore: boolean;
    }>(
      `/api/messages/${id}/updates?after=${encodeURIComponent(after)}&limit=100${recent ? '&mode=recent' : ''}${floor ? '&floor=' + encodeURIComponent(floor) : ''}`,
      requestWindow(),
    ),
  historyPage: (id: string, page = 1, limit = 50) =>
    apiRequest<{ messages: readonly MessageView[]; readReceipt: string }>(
      `/api/messages/${id}?page=${page}&limit=${limit}`,
      requestWindow(),
    ),
  history: async (id: string) =>
    (await apiRequest<{ messages: readonly MessageView[] }>(`/api/messages/${id}`, requestWindow()))
      .messages,
  list: async (
    contextType?: ConversationContext,
    search?: string,
    cursor?: string,
    selected?: string,
  ) => {
    return apiRequest<InboxResult>(
      buildMessagingInboxPath(contextType, search, cursor, selected),
      requestWindow(),
    );
  },
  markRead: (id: string, readReceipt: string) =>
    apiRequest<{ updated: number }>(`/api/messages/${id}/read`, {
      ...requestWindow(),
      method: 'PATCH',
      body: JSON.stringify({ readReceipt }),
    }),
  open: async (input: {
    contextId?: string;
    contextType: ConversationContext;
    targetUserId: string;
  }) =>
    (
      await apiRequest<{ conversation: { id: string } }>('/api/messages/conversations', {
        body: JSON.stringify(input),
        method: 'POST',
      })
    ).conversation,
  send: async (id: string, text: string, clientMessageId?: string) =>
    (
      await apiRequest<{ message: MessageView }>(`/api/messages/${id}`, {
        ...requestWindow(),
        body: JSON.stringify({ text, ...(clientMessageId ? { clientMessageId } : {}) }),
        method: 'POST',
      })
    ).message,
};

export const connectMessagingSocket = (
  onMessage: (message: MessageView) => void,
  options: Omit<RealtimeSubscriber, 'message'> = {},
) => Promise.resolve().then(() => subscribeMessagingRealtime({ ...options, message: onMessage }));
