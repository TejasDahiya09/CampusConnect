import { AppError } from '../../errors/app-error.js';
import type { prisma } from '../../database/prisma.js';
import {
  AccountStatus,
  ConversationType,
  ModerationVisibility,
  type Prisma,
} from '../../generated/prisma/client.js';
import { requireActiveServicesAccount, runServicesTransaction } from './services-policy.js';

export const canStartServiceConversation = async (
  db: Pick<Prisma.TransactionClient, 'service' | 'user' | '$queryRaw'>,
  actor: string,
  target: string,
  requestId: string,
  lock = false,
): Promise<boolean> => {
  if (actor === target) return false;
  if (lock) {
    for (const id of [actor, target].sort()) await requireActiveServicesAccount(db, id, true);
    await db.$queryRaw`SELECT id FROM public.services WHERE bookings @> ${JSON.stringify([{ id: requestId }])}::jsonb FOR SHARE`;
  }
  const service = await db.service.findFirst({
    select: { providerId: true, bookings: true },
    where: {
      bookings: { array_contains: [{ id: requestId }] },
      moderationVisibility: ModerationVisibility.VISIBLE,
    },
  });
  if (!service || !Array.isArray(service.bookings)) return false;
  const booking = service.bookings.find(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      value.id === requestId,
  );
  if (
    !booking ||
    typeof booking !== 'object' ||
    Array.isArray(booking) ||
    typeof booking.status !== 'string' ||
    !['ACCEPTED', 'COMPLETED'].includes(booking.status) ||
    typeof booking.requesterId !== 'string'
  )
    return false;
  if (!(
    (actor === service.providerId && target === booking.requesterId) ||
    (target === service.providerId && actor === booking.requesterId)
  ))
    return false;
  return (
    (await db.user.count({
      where: { id: { in: [actor, target] }, status: AccountStatus.ACTIVE },
    })) === 2
  );
};

export const openServiceConversation = (
  db: typeof prisma,
  actor: string,
  target: string,
  requestId: string,
) =>
  runServicesTransaction(db, async (tx) => {
    if (!(await canStartServiceConversation(tx, actor, target, requestId, true)))
      throw new AppError({
        code: 'MESSAGING_NOT_ALLOWED',
        message: 'Messaging is not available for these participants and context.',
        statusCode: 403,
      });
    const [participantAId, participantBId] = [actor, target].sort() as [string, string];
    const identity = {
      participantAId,
      participantBId,
      contextType: ConversationType.SERVICE,
      contextKey: requestId,
    };
    return tx.conversation.upsert({
      where: { participantAId_participantBId_contextType_contextKey: identity },
      create: { ...identity, contextId: requestId },
      update: {},
    });
  });
