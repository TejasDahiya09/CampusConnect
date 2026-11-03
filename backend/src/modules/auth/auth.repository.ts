import { profileAvatarView } from '../profile/profile-avatar-value.js';
import {
  AccountStatus,
  UserRole,
  type Prisma,
  type PrismaClient,
} from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';
import type { AuthenticatedUser, SupabaseIdentity } from './auth.types.js';

export interface SynchronizeUserInput {
  readonly displayName: string;
  readonly email: string;
  readonly identity: SupabaseIdentity;
  readonly verifiedAt: Date;
}

export interface AuthUserRepository {
  findById(id: string): Promise<AuthenticatedUser | null>;
  synchronize(input: SynchronizeUserInput): Promise<AuthenticatedUser>;
}

const authenticatedUserSelect = {
  email: true,
  emailVerifiedAt: true,
  id: true,
  profile: {
    select: {
      avatar: true,
      fullName: true,
      userId: true,
    },
  },
  role: true,
  status: true,
} satisfies Prisma.UserSelect;

type AuthenticatedUserRow = Prisma.UserGetPayload<{ select: typeof authenticatedUserSelect }>;

const photo = (raw: unknown) => {
  const avatar = profileAvatarView(raw);
  return avatar?.type === 'photo' ? { avatar } : {};
};
const mapAuthenticatedUser = (row: AuthenticatedUserRow): AuthenticatedUser => ({
  email: row.email,
  emailVerifiedAt: row.emailVerifiedAt,
  id: row.id,
  profile:
    row.profile === null
      ? null
      : { displayName: row.profile.fullName, id: row.profile.userId, ...photo(row.profile.avatar) },
  role: row.role,
  status: row.status,
});

export const createAuthUserLookup = (
  client: Pick<PrismaClient, 'user'> = prisma,
): Pick<AuthUserRepository, 'findById'> => ({
  findById: async (id) => {
    const row = await client.user.findUnique({ select: authenticatedUserSelect, where: { id } });
    return row === null ? null : mapAuthenticatedUser(row);
  },
});
const defaultLookup = createAuthUserLookup();

export const authUserRepository: AuthUserRepository = {
  findById: (id) => defaultLookup.findById(id),

  synchronize: async ({ displayName, email, identity, verifiedAt }) =>
    prisma.$transaction(async (transaction) => {
      const existingUser = await transaction.user.findUnique({ where: { id: identity.id } });
      await transaction.user.upsert({
        create: {
          email,
          emailVerifiedAt: verifiedAt,
          id: identity.id,
          role: UserRole.STUDENT,
          status: AccountStatus.ACTIVE,
        },
        update: {
          email,
          emailVerifiedAt: existingUser?.emailVerifiedAt ?? verifiedAt,
        },
        where: { id: identity.id },
      });

      await transaction.profile.upsert({
        create: {
          fullName: displayName,
          userId: identity.id,
        },
        update: {},
        where: { userId: identity.id },
      });

      const synchronizedUser = await transaction.user.findUnique({
        select: authenticatedUserSelect,
        where: { id: identity.id },
      });

      if (synchronizedUser === null) {
        throw new Error('Synchronized user could not be resolved.');
      }

      return mapAuthenticatedUser(synchronizedUser);
    }),
};
