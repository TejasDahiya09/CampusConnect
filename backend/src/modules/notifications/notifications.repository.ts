import { createHash } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { NotificationType, type Prisma } from '../../generated/prisma/client.js';
import type {
  NotificationCreateInput,
  NotificationKind,
  NotificationView,
} from './notifications.types.js';

const stableId = (input: NotificationCreateInput) => {
  const bytes = createHash('sha256')
    .update(`${input.recipientId}|${input.kind}|${input.eventId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const enumType = (kind: NotificationKind): NotificationType =>
  kind.startsWith('REPORT_') || kind.startsWith('CONTENT_')
    ? NotificationType.SYSTEM
    : kind.startsWith('TEAMUP_')
      ? NotificationType.TEAM_APPLICATION
      : kind.startsWith('SERVICE_')
        ? NotificationType.BOOKING
        : kind.startsWith('LOST_FOUND_CLAIM_')
          ? NotificationType.CLAIM
          : kind === 'LOST_FOUND_MATCH'
            ? NotificationType.MATCH
            : NotificationType.MESSAGE;
const pathFor = (entityType: string, entityId: string) =>
  entityType === 'MODERATION'
    ? '/moderation'
    : entityType === 'NOTIFICATIONS'
      ? '/notifications'
      : entityType === 'MARKETPLACE'
        ? `/marketplace/${entityId}`
        : entityType === 'PROFILE'
          ? `/profile/${entityId}`
          : entityType === 'MESSAGING'
            ? `/messages/${entityId}`
            : entityType === 'LOST_FOUND'
              ? `/lost-found/${entityId}`
              : entityType === 'TEAMUP'
                ? `/teamup/${entityId}`
                : `/services/saved`;
const data = (value: Prisma.JsonValue) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
const text = (value: Prisma.JsonValue | undefined): string =>
  typeof value === 'string' ? value : '';
const map = (row: {
  id: string;
  title: string;
  message: string | null;
  data: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
  type: NotificationType;
}): NotificationView => {
  const meta = data(row.data);
  const kind = text(meta.kind) as NotificationKind;
  // Message notices can outlive profile/context moderation. Do not replay cached identity/title.
  const messageNotice =
    row.type === NotificationType.MESSAGE ||
    kind === 'MESSAGE_RECEIVED' ||
    kind === 'MARKETPLACE_MESSAGE';
  return {
    createdAt: row.createdAt.toISOString(),
    description: messageNotice ? null : row.message,
    id: row.id,
    kind,
    path: pathFor(text(meta.entityType), text(meta.entityId)),
    read: row.readAt !== null,
    readAt: row.readAt?.toISOString() ?? null,
    title: messageNotice
      ? kind === 'MARKETPLACE_MESSAGE'
        ? 'New Marketplace message'
        : 'New message'
      : row.title,
  };
};
const select = {
  type: true,
  createdAt: true,
  data: true,
  id: true,
  message: true,
  readAt: true,
  title: true,
} satisfies Prisma.NotificationSelect;
export const notificationsRepository = {
  create: async (input: NotificationCreateInput) => {
    const id = stableId(input);
    const meta = {
      entityId: input.entityId,
      entityType: input.entityType,
      eventId: input.eventId,
      kind: input.kind,
    };
    try {
      const row = await prisma.notification.create({
        data: {
          data: meta,
          id,
          message: input.description,
          title: input.title,
          type: enumType(input.kind),
          userId: input.recipientId,
        },
        select,
      });
      return { created: true, notification: map(row) };
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'P2002')) throw error;
      const row = await prisma.notification.findUniqueOrThrow({ select, where: { id } });
      return { created: false, notification: map(row) };
    }
  },
  list: async (userId: string, page: number, limit: number, unreadOnly: boolean) => {
    const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
    const [rows, total] = await prisma.$transaction([
      prisma.notification.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select,
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      prisma.notification.count({ where }),
    ]);
    return { items: rows.map(map), total };
  },
  unreadCount: (userId: string) => prisma.notification.count({ where: { readAt: null, userId } }),
  markRead: async (userId: string, id: string) =>
    prisma.notification.updateMany({
      data: { readAt: new Date() },
      where: { id, userId, readAt: null },
    }),
  markAllRead: (userId: string) =>
    prisma.notification.updateMany({
      data: { readAt: new Date() },
      where: { userId, readAt: null },
    }),
  dismiss: (userId: string, id: string) =>
    prisma.notification.deleteMany({ where: { id, userId } }),
  clearRead: (userId: string) =>
    prisma.notification.deleteMany({ where: { userId, readAt: { not: null } } }),
  clearAll: (userId: string) => prisma.notification.deleteMany({ where: { userId } }),
};
