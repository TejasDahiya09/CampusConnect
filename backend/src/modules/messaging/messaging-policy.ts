import { AppError } from '../../errors/app-error.js';
import { AccountStatus, Prisma } from '../../generated/prisma/client.js';
import type { prisma } from '../../database/prisma.js';

export const requireActiveMessagingAccounts = async (
  tx: Prisma.TransactionClient,
  ids: readonly string[],
) => {
  for (const id of [...new Set(ids)].sort()) {
    await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${id}::uuid FOR SHARE`;
    const user = await tx.user.findUnique({ where: { id }, select: { status: true } });
    if (user?.status !== AccountStatus.ACTIVE)
      throw new AppError({
        code: 'MESSAGING_NOT_ALLOWED',
        message: 'Messaging is unavailable.',
        statusCode: 403,
      });
  }
};

export const runMessagingTransaction = async <T>(
  db: typeof prisma,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(operation, {
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
      const original =
        cause && typeof cause === 'object' && 'originalCode' in cause
          ? cause.originalCode
          : undefined;
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' ||
          (error.code === 'P2010' &&
            ['40001', '40P01'].includes(String(error.meta?.code ?? original))));
      if (!retryable) throw error;
      if (attempt === 2)
        throw new AppError({
          code: 'MESSAGING_CONCURRENCY_CONFLICT',
          message: 'The conversation changed. Retry the request.',
          statusCode: 409,
        });
    }
  }
  throw new Error('Unreachable Messaging retry state.');
};
