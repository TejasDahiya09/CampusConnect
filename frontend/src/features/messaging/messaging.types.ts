export type ConversationContext = 'DIRECT' | 'MARKETPLACE' | 'SERVICE' | 'TEAMUP';
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
  readonly contextType: ConversationContext;
  readonly createdAt: string;
  readonly id: string;
  readonly lastMessage: MessageView | null;
  readonly otherParticipant: MessagingPerson;
  readonly unreadCount: number;
  readonly updatedAt: string;
}
export interface InboxResult {
  readonly nextCursor?: string | null;
  readonly selectedConversation?: ConversationView;
  readonly conversations: readonly ConversationView[];
  readonly unread: {
    readonly byContext: Readonly<Record<ConversationContext, number>>;
    readonly total: number;
  };
}
