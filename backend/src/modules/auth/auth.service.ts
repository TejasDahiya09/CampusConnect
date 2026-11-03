import { AppError, ValidationError } from '../../errors/app-error.js';
import { AccountStatus, Prisma } from '../../generated/prisma/client.js';
import { authUserRepository, type AuthUserRepository } from './auth.repository.js';
import type { AuthenticatedUser, SupabaseIdentity } from './auth.types.js';
import { requireValidEmail } from './email-validation.js';

export interface SyncUserRequest {
  readonly displayName?: unknown;
}

const normalizeDisplayName = (value: unknown, identity: SupabaseIdentity): string => {
  const metadataName =
    typeof identity.metadata.display_name === 'string'
      ? identity.metadata.display_name
      : typeof identity.metadata.full_name === 'string'
        ? identity.metadata.full_name
        : undefined;
  const candidate =
    typeof value === 'string' ? value : (metadataName ?? identity.email.split('@')[0]);
  const displayName = candidate?.trim() ?? '';

  if (displayName.length < 2 || displayName.length > 120) {
    throw new ValidationError('A valid display name is required.', [
      { field: 'displayName', message: 'Display name must contain between 2 and 120 characters.' },
    ]);
  }

  return displayName;
};

export const synchronizeAuthenticatedUser = async (
  identity: SupabaseIdentity,
  input: SyncUserRequest,
  repository: AuthUserRepository = authUserRepository,
): Promise<AuthenticatedUser> => {
  if (!identity.emailVerified) {
    throw new AppError({
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Verify your email address before continuing.',
      statusCode: 403,
    });
  }

  const email = requireValidEmail(identity.email);

  try {
    const user = await repository.synchronize({
      displayName: normalizeDisplayName(input.displayName, identity),
      email,
      identity,
      verifiedAt: new Date(),
    });
    if (user.status !== AccountStatus.ACTIVE) {
      throw new AppError({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'This account is not available.',
        statusCode: 403,
      });
    }
    return user;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError({
        code: 'ACCOUNT_CONFLICT',
        message: 'This email address is already linked to another account.',
        statusCode: 409,
      });
    }

    throw error;
  }
};
