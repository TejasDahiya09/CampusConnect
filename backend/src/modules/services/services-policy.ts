import { profileAvatarView } from '../profile/profile-avatar-value.js';
import { AppError } from '../../errors/app-error.js';
import { AccountStatus, ModerationVisibility, Prisma } from '../../generated/prisma/client.js';
import type { prisma } from '../../database/prisma.js';
import type { ServicePerson } from './services.types.js';

export const servicePerson = (user: {
  id: string;
  status: AccountStatus;
  profile: {
    avatar: unknown;
    department: string | null;
    fullName: string;
    moderationVisibility: ModerationVisibility;
  } | null;
}): ServicePerson => {
  const profile =
    user.status === AccountStatus.ACTIVE &&
    user.profile?.moderationVisibility === ModerationVisibility.VISIBLE
      ? user.profile
      : null;
  return {
    id: user.id,
    avatar: profileAvatarView(profile?.avatar),
    department: profile?.department ?? null,
    displayName: profile?.fullName ?? 'CampusConnect student',
  };
};

export const requireActiveServicesAccount = async (
  db: Pick<Prisma.TransactionClient, 'user' | '$queryRaw'>,
  id: string,
  lock = false,
): Promise<void> => {
  if (lock) await db.$queryRaw`SELECT id FROM public.users WHERE id = ${id}::uuid FOR SHARE`;
  const user = await db.user.findUnique({ where: { id }, select: { status: true } });
  if (user?.status !== AccountStatus.ACTIVE)
    throw new AppError({
      code: 'ACCOUNT_UNAVAILABLE',
      message: 'This account is not available.',
      statusCode: 403,
    });
};

export const runServicesTransaction = async <T>(
  db: typeof prisma,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(run, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 2000,
        timeout: 5000,
      });
    } catch (error) {
      const adapter =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.meta?.driverAdapterError
          : undefined;
      const cause =
        adapter && typeof adapter === 'object' && 'cause' in adapter ? adapter.cause : undefined;
      const originalCode =
        cause && typeof cause === 'object' && 'originalCode' in cause
          ? cause.originalCode
          : undefined;
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' ||
          (error.code === 'P2010' &&
            ['40001', '40P01'].includes(String(error.meta?.code ?? originalCode))));
      if (!retryable) throw error;
      if (attempt === 2)
        throw new AppError({
          code: 'SERVICE_CONCURRENCY_CONFLICT',
          message: 'The service changed. Refresh and try again.',
          statusCode: 409,
        });
    }
  }
  throw new Error('Unreachable Services retry state.');
};
