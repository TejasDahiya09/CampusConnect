import type { ConversationType } from '../../generated/prisma/client.js';
export interface MessagingPerson {
  readonly avatar: unknown;
  readonly department: string | null;
  readonly displayName: string;
  readonly id: string;
}
export interface MessageView {
  readonly conversationId: string;
  readonly id: string;
  readonly read: boolean;
  readonly senderId: string;
  readonly sentAt: string;
  readonly text: string;
}
export interface ConversationView {
  readonly contextId: string | null;
  readonly contextLabel: string;
  readonly contextPath: string | null;
  readonly contextType: ConversationType;
  readonly createdAt: string;
  readonly id: string;
  readonly lastMessage: MessageView | null;
  readonly otherParticipant: MessagingPerson;
  readonly unreadCount: number;
  readonly updatedAt: string;
}
export interface ConversationOpenInput {
  readonly contextId: string | null;
  readonly contextType: ConversationType;
  readonly targetUserId: string;
}
