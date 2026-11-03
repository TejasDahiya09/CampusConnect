import { canStartServiceConversation } from '../services/services-messaging.js';
import { AppError } from '../../errors/app-error.js';
import { requireActiveMessagingAccounts, runMessagingTransaction } from './messaging-policy.js';
import { servicePerson } from '../services/services-policy.js';
import { canStartTeamUpConversation } from '../teamup/teamup-messaging.js';
import { prisma } from '../../database/prisma.js';
import {
  AccountStatus,
  ConversationType,
  ListingStatus,
  ModerationVisibility,
} from '../../generated/prisma/client.js';
import { Prisma } from '../../generated/prisma/client.js';
import { inboxCursors } from './messaging-inbox-cursor.js';
import { messageEncryption } from './message-encryption.js';
import type {
  ConversationOpenInput,
  ConversationView,
  MessageView,
  MessagingPerson,
} from './messaging.types.js';

const userSelect = {
  id: true,
  status: true,
  profile: {
    select: { avatar: true, department: true, fullName: true, moderationVisibility: true },
  },
} satisfies Prisma.UserSelect;
const messageSelect = {
  conversationId: true,
  createdAt: true,
  encryptedContent: true,
  encryptionIv: true,
  encryptionTag: true,
  encryptionVersion: true,
  id: true,
  readAt: true,
  senderId: true,
} satisfies Prisma.MessageSelect;
type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;
const person = (user: Prisma.UserGetPayload<{ select: typeof userSelect }>): MessagingPerson =>
  servicePerson(user);
const pair = (left: string, right: string) =>
  left < right ? ([left, right] as const) : ([right, left] as const);
const isUniqueConflict = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'P2002';
const mapMessage = (row: MessageRow): MessageView => ({
  conversationId: row.conversationId,
  id: row.id,
  read: row.readAt !== null,
  senderId: row.senderId,
  sentAt: row.createdAt.toISOString(),
  text: messageEncryption.decrypt(row),
});

const context = async (type: ConversationType, id: string | null, db: typeof prisma) => {
  if (type === ConversationType.DIRECT) return { label: 'Direct', path: null };
  if (!id) return { label: type, path: null };
  if (type === ConversationType.MARKETPLACE) {
    const item = await db.marketplace.findFirst({
      select: { title: true },
      where: {
        id,
        moderationVisibility: ModerationVisibility.VISIBLE,
        seller: { status: AccountStatus.ACTIVE },
      },
    });
    return {
      label: `Marketplace · ${item?.title ?? 'Unavailable listing'}`,
      path: item ? `/marketplace/${id}` : null,
    };
  }
  if (type === ConversationType.SERVICE) {
    const service = await db.service.findFirst({
      select: { id: true, title: true },
      where: {
        bookings: { array_contains: [{ id }] },
        moderationVisibility: ModerationVisibility.VISIBLE,
        provider: { status: AccountStatus.ACTIVE },
      },
    });
    return {
      label: `Services · ${service?.title ?? 'Unavailable service'}`,
      path: service ? `/services/${service.id}` : null,
    };
  }
  if (type === ConversationType.TEAMUP) {
    const project = await db.teamUp.findFirst({
      select: { title: true },
      where: {
        id,
        moderationVisibility: ModerationVisibility.VISIBLE,
        owner: { status: AccountStatus.ACTIVE },
      },
    });
    return {
      label: `TeamUp · ${project?.title ?? 'Unavailable project'}`,
      path: project ? `/teamup/${id}` : null,
    };
  }
  return { label: 'Conversation', path: null };
};

export const createMessagingRepository = (db: typeof prisma = prisma) => {
  const repository = {
    eligible: async (
      actor: string,
      input: ConversationOpenInput,
      client: Prisma.TransactionClient = db,
    ): Promise<boolean> => {
      if (input.contextType === ConversationType.DIRECT)
        return (
          (await client.user.count({
            where: { id: input.targetUserId, status: AccountStatus.ACTIVE },
          })) === 1
        );
      if (input.contextType === ConversationType.MARKETPLACE) {
        const item = await client.marketplace.findFirst({
          select: { sellerId: true },
          where: {
            id: input.contextId ?? '',
            moderationVisibility: ModerationVisibility.VISIBLE,
            status: ListingStatus.ACTIVE,
            seller: { status: AccountStatus.ACTIVE },
          },
        });
        return item?.sellerId === input.targetUserId && actor !== item.sellerId;
      }
      if (input.contextType === ConversationType.SERVICE) {
        return canStartServiceConversation(
          client,
          actor,
          input.targetUserId,
          input.contextId ?? '',
        );
      }
      if (input.contextType === ConversationType.TEAMUP) {
        return canStartTeamUpConversation(client, actor, input.targetUserId, input.contextId ?? '');
      }
      return false;
    },
    open: async (actor: string, input: ConversationOpenInput) => {
      const [participantAId, participantBId] = pair(actor, input.targetUserId);
      const identity = {
        contextKey: input.contextId ?? '',
        contextType: input.contextType,
        participantAId,
        participantBId,
      };
      const operation = () =>
        runMessagingTransaction(db, async (tx) => {
          // Existing history is participant-authorized; only the current reader must remain ACTIVE.
          const existing = await tx.conversation.findUnique({
            where: { participantAId_participantBId_contextType_contextKey: identity },
          });
          if (existing) {
            await requireActiveMessagingAccounts(tx, [actor]);
            return existing;
          }
          const projectOwner =
            input.contextType === ConversationType.TEAMUP
              ? await tx.teamUp.findUnique({
                  where: { id: input.contextId! },
                  select: { ownerId: true },
                })
              : null;
          await requireActiveMessagingAccounts(tx, [
            actor,
            input.targetUserId,
            ...(projectOwner ? [projectOwner.ownerId] : []),
          ]);
          if (input.contextType === ConversationType.MARKETPLACE)
            await tx.$queryRaw`SELECT id FROM public.marketplace WHERE id = ${input.contextId}::uuid FOR SHARE`;
          if (input.contextType === ConversationType.TEAMUP)
            await tx.$queryRaw`SELECT id FROM public.teamup WHERE id = ${input.contextId}::uuid FOR SHARE`;
          if (input.contextType === ConversationType.SERVICE)
            await tx.$queryRaw`SELECT id FROM public.services WHERE bookings @> ${JSON.stringify([{ id: input.contextId }])}::jsonb FOR SHARE`;
          if (!(await repository.eligible(actor, input, tx)))
            throw new AppError({
              code: 'MESSAGING_NOT_ALLOWED',
              message: 'Messaging is unavailable for these participants and context.',
              statusCode: 403,
            });
          return tx.conversation.upsert({
            create: {
              contextId: input.contextId,
              ...identity,
            },
            update: {},
            where: { participantAId_participantBId_contextType_contextKey: identity },
          });
        });
      try {
        return await operation();
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
        return operation();
      }
    },
    get: (id: string, userId: string) =>
      db.conversation.findFirst({
        where: { id, OR: [{ participantAId: userId }, { participantBId: userId }] },
      }),
    send: async (
      conversation: {
        id: string;
        participantAId: string;
        participantBId: string;
        contextId: string | null;
        contextType: ConversationType;
      },
      senderId: string,
      text: string,
      clientMessageId?: string,
    ) => {
      const receiverId =
        conversation.participantAId === senderId
          ? conversation.participantBId
          : conversation.participantAId;
      const operation = () =>
        runMessagingTransaction(db, async (tx) => {
          await requireActiveMessagingAccounts(tx, [senderId, receiverId]);
          const current = await tx.conversation.findFirst({
            where: {
              id: conversation.id,
              OR: [{ participantAId: senderId }, { participantBId: senderId }],
            },
          });
          if (
            !current ||
            current.participantAId !== conversation.participantAId ||
            current.participantBId !== conversation.participantBId ||
            current.contextType !== conversation.contextType ||
            current.contextId !== conversation.contextId
          )
            throw new AppError({
              code: 'CONVERSATION_NOT_FOUND',
              message: 'Conversation not found.',
              statusCode: 404,
            });
          if (clientMessageId) {
            const existing = await tx.message.findUnique({
              where: { id: clientMessageId },
              select: messageSelect,
            });
            if (existing) {
              if (
                existing.senderId !== senderId ||
                existing.conversationId !== conversation.id ||
                messageEncryption.decrypt(existing) !== text
              )
                throw new AppError({
                  code: 'MESSAGE_IDEMPOTENCY_CONFLICT',
                  message: 'This message ID was already used for another request.',
                  statusCode: 409,
                });
              return { message: mapMessage(existing), receiverId, created: false };
            }
          }
          const encrypted = messageEncryption.encrypt(text);
          const created = await tx.message.create({
            data: {
              ...(clientMessageId ? { id: clientMessageId } : {}),
              ...encrypted,
              contextId: conversation.contextId,
              contextType: conversation.contextType,
              conversationId: conversation.id,
              receiverId,
              senderId,
            },
            select: messageSelect,
          });
          await tx.conversation.update({
            data: { updatedAt: new Date() },
            where: { id: conversation.id },
          });
          return { message: mapMessage(created), receiverId, created: true };
        });
      try {
        return await operation();
      } catch (error) {
        if (!clientMessageId || !isUniqueConflict(error)) throw error;
        return operation();
      }
    },
    history: async (conversationId: string, page: number, limit: number) =>
      (
        await db.message.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: messageSelect,
          skip: (page - 1) * limit,
          take: limit,
          where: { conversationId },
        })
      )
        .reverse()
        .map(mapMessage),
    updates: async (conversationId: string, after: string, limit: number) => {
      // Validate the cursor in this conversation; Prisma compares the native timestamp
      // at the cursor row, retaining PostgreSQL microseconds and UUID tie-breaking.
      const cursor =
        after === 'start'
          ? null
          : await db.message.findFirst({
              where: { id: after, conversationId },
              select: { id: true },
            });
      if (after !== 'start' && !cursor)
        throw new AppError({
          code: 'INVALID_HISTORY_CURSOR',
          message: 'Refresh the conversation before recovering messages.',
          statusCode: 400,
        });
      const rows = await db.message.findMany({
        where: { conversationId },
        ...(cursor ? { cursor: { id: after }, skip: 1 } : {}),
        take: limit + 1,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: messageSelect,
      });
      return { messages: rows.slice(0, limit).map(mapMessage), hasMore: rows.length > limit };
    },
    markRead: (id: string, userId: string, messageIds: readonly string[]) =>
      runMessagingTransaction(db, async (tx) => {
        await requireActiveMessagingAccounts(tx, [userId]);
        const conversation = await tx.conversation.findFirst({
          where: { id, OR: [{ participantAId: userId }, { participantBId: userId }] },
        });
        if (!conversation)
          throw new AppError({
            code: 'CONVERSATION_NOT_FOUND',
            message: 'Conversation not found.',
            statusCode: 404,
          });
        return tx.message.updateMany({
          data: { readAt: new Date() },
          where: {
            id: { in: [...messageIds] },
            conversationId: id,
            receiverId: userId,
            readAt: null,
          },
        });
      }),
    notificationDetails: async (
      conversation: { contextId: string | null; contextType: ConversationType },
      senderId: string,
    ) => {
      const sender = await db.user.findUnique({ select: userSelect, where: { id: senderId } });
      const meta = await context(conversation.contextType, conversation.contextId, db);
      return {
        contextLabel: meta.label,
        senderName: sender === null ? 'A CampusConnect student' : person(sender).displayName,
      };
    },
    // Legacy repository callers are bounded too; public HTTP uses inbox's additive page contract.
    list: async (userId: string): Promise<ConversationView[]> =>
      (await repository.inbox(userId)).conversations,
    recent: async (conversationId: string, after: string, limit: number, floor?: string) => {
      const boundary = floor
        ? await db.message.findFirst({
            where: { id: floor, conversationId },
            select: { createdAt: true },
          })
        : null;
      if (floor && !boundary)
        throw new AppError({
          code: 'INVALID_HISTORY_CURSOR',
          message: 'Refresh this conversation.',
          statusCode: 400,
        });
      if (
        after !== 'start' &&
        !(await db.message.findFirst({
          where: { id: after, conversationId },
          select: { id: true },
        }))
      )
        throw new AppError({
          code: 'INVALID_HISTORY_CURSOR',
          message: 'Refresh this conversation.',
          statusCode: 400,
        });
      const rows = await db.message.findMany({
        where: { conversationId, ...(boundary ? { createdAt: { gte: boundary.createdAt } } : {}) },
        ...(after === 'start' ? {} : { cursor: { id: after }, skip: 1 }),
        take: limit + 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: messageSelect,
      });
      const selected = rows.slice(0, limit);
      return {
        messages: selected.map(mapMessage),
        hasMore: rows.length > limit,
        nextCursor: selected.at(-1)?.id ?? after,
      };
    },
    inbox: async (
      userId: string,
      query: {
        contextType?: ConversationType;
        search?: string;
        cursor?: string;
        limit?: number;
        selected?: string;
      } = {},
    ) => {
      const limit = Math.min(query.limit ?? 30, 50);
      const scope = JSON.stringify([userId, query.contextType ?? '', query.search ?? '']);
      const cursor = query.cursor ? inboxCursors.verify(query.cursor, scope) : undefined;
      // All search projections obey the same identity/context redaction as the DTO.
      const base = Prisma.sql`FROM conversations c
        JOIN users u ON u.id=CASE WHEN c.participant_a_id=${userId}::uuid THEN c.participant_b_id ELSE c.participant_a_id END
        LEFT JOIN profiles p ON p.user_id=u.id
        LEFT JOIN marketplace m ON c.context_type='MARKETPLACE' AND m.id=c.context_id AND m.moderation_visibility='VISIBLE' AND EXISTS(SELECT 1 FROM users WHERE id=m.seller_id AND status='ACTIVE')
        LEFT JOIN teamup t ON c.context_type='TEAMUP' AND t.id=c.context_id AND t.moderation_visibility='VISIBLE' AND EXISTS(SELECT 1 FROM users WHERE id=t.owner_id AND status='ACTIVE')
        LEFT JOIN LATERAL (SELECT id,title FROM services WHERE c.context_type='SERVICE' AND bookings @> jsonb_build_array(jsonb_build_object('id',c.context_id::text)) AND moderation_visibility='VISIBLE' AND EXISTS(SELECT 1 FROM users WHERE id=provider_id AND status='ACTIVE') LIMIT 1) s ON true
        WHERE (c.participant_a_id=${userId}::uuid OR c.participant_b_id=${userId}::uuid)`;
      const label = Prisma.sql`CASE c.context_type WHEN 'MARKETPLACE' THEN 'Marketplace · '||coalesce(m.title,'Unavailable listing') WHEN 'TEAMUP' THEN 'TeamUp · '||coalesce(t.title,'Unavailable project') WHEN 'SERVICE' THEN 'Services · '||coalesce(s.title,'Unavailable service') WHEN 'DIRECT' THEN 'Direct' ELSE 'Conversation' END`;
      const search = (query.search ?? '').toLowerCase();
      const matching = Prisma.sql`${query.contextType ? Prisma.sql`AND c.context_type=${query.contextType}::conversation_type` : Prisma.empty}
        ${search ? Prisma.sql`AND (strpos(lower(CASE WHEN u.status='ACTIVE' AND p.moderation_visibility='VISIBLE' THEN coalesce(p.full_name,'CampusConnect student') ELSE 'CampusConnect student' END),${search})>0 OR strpos(lower(${label}),${search})>0)` : Prisma.empty}`;
      type Meta = { id: string; at: string; label: string; path: string | null };
      const projection = Prisma.sql`SELECT c.id,c.updated_at::text AS at,${label} AS label,CASE WHEN m.id IS NOT NULL THEN '/marketplace/'||m.id WHEN t.id IS NOT NULL THEN '/teamup/'||t.id WHEN s.id IS NOT NULL THEN '/services/'||s.id END AS path`;
      const page = await db.$queryRaw<Meta[]>(Prisma.sql`${projection} ${base} ${matching}
        ${cursor ? Prisma.sql`AND (c.updated_at,c.id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : Prisma.empty}
        ORDER BY c.updated_at DESC,c.id DESC LIMIT ${limit + 1}`);
      const selected = query.selected
        ? await db.$queryRaw<Meta[]>(
            Prisma.sql`${projection} ${base} AND c.id=${query.selected}::uuid`,
          )
        : [];
      const metadata = page.slice(0, limit);
      const ids = [...new Set([...metadata, ...selected].map((row) => row.id))];
      const rows = ids.length
        ? await db.conversation.findMany({
            where: {
              id: { in: ids },
              OR: [{ participantAId: userId }, { participantBId: userId }],
            },
            include: {
              messages: {
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                select: messageSelect,
                take: 1,
              },
              participantA: { select: userSelect },
              participantB: { select: userSelect },
            },
          })
        : [];
      // Bounded per-page counts plus a four-context global aggregate independent of search.
      const counts = await db.message.groupBy({
        by: ['conversationId', 'contextType'],
        where: {
          conversationId: { in: ids },
          receiverId: userId,
          readAt: null,
          conversation: { OR: [{ participantAId: userId }, { participantBId: userId }] },
        },
        _count: true,
      });
      const totals = await db.message.groupBy({
        by: ['contextType'],
        where: {
          receiverId: userId,
          readAt: null,
          conversation: { OR: [{ participantAId: userId }, { participantBId: userId }] },
        },
        _count: true,
      });
      const byContext = { DIRECT: 0, MARKETPLACE: 0, TEAMUP: 0, SERVICE: 0 };
      for (const count of totals)
        if (count.contextType in byContext)
          byContext[count.contextType as keyof typeof byContext] += count._count;
      const mapped = (meta: Meta): ConversationView | undefined => {
        const row = rows.find((row) => row.id === meta.id);
        if (!row) return undefined;
        return {
          contextId: row.contextId,
          contextType: row.contextType,
          contextLabel: meta.label,
          contextPath: meta.path,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          id: row.id,
          lastMessage: row.messages[0] ? mapMessage(row.messages[0]) : null,
          otherParticipant: person(
            row.participantAId === userId ? row.participantB : row.participantA,
          ),
          unreadCount: counts.find((count) => count.conversationId === row.id)?._count ?? 0,
        };
      };
      const conversations = metadata.map(mapped).filter((row): row is ConversationView => !!row);
      const last = metadata.at(-1);
      return {
        conversations,
        selectedConversation: selected[0] ? mapped(selected[0]) : undefined,
        nextCursor:
          page.length > limit && last ? inboxCursors.issue(scope, last.at, last.id) : null,
        unread: { byContext, total: totals.reduce((sum, row) => sum + row._count, 0) },
      };
    },
  };
  return repository;
};
export const messagingRepository = createMessagingRepository();
