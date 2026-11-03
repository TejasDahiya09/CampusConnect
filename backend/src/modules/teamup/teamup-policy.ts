import { AppError } from '../../errors/app-error.js';
import { AccountStatus, type Prisma } from '../../generated/prisma/client.js';

/** PostgreSQL DATE: applications remain open throughout the deadline's UTC day. */
export const applicationDeadlineExpired = (deadline: Date | null, now = new Date()): boolean =>
  deadline !== null &&
  (!Number.isFinite(deadline.getTime()) ||
    deadline.toISOString().slice(0, 10) < now.toISOString().slice(0, 10));

export const requireActiveTeamUpAccount = async (
  db: Pick<Prisma.TransactionClient, 'user' | '$queryRaw'>,
  userId: string,
  lock = false,
): Promise<void> => {
  // A suspension/deactivation cannot commit between this check and the transaction write.
  if (lock) await db.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR SHARE`;
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (user?.status !== AccountStatus.ACTIVE)
    throw new AppError({
      code: 'ACCOUNT_UNAVAILABLE',
      message: 'This account is not available.',
      statusCode: 403,
    });
};
