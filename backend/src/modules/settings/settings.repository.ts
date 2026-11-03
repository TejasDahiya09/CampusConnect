import { prisma } from '../../database/prisma.js';
import { AccountStatus } from '../../generated/prisma/client.js';

const accountSelect = {
  email: true,
  id: true,
  profile: { select: { fullName: true } },
  role: true,
  status: true,
} as const;

export const settingsRepository = {
  findAccount: (userId: string) =>
    prisma.user.findUnique({ select: accountSelect, where: { id: userId } }),
  deactivate: (userId: string) =>
    prisma.user.updateMany({
      data: { status: AccountStatus.DEACTIVATED },
      where: { id: userId, status: AccountStatus.ACTIVE },
    }),
};

export interface SettingsRepository {
  readonly findAccount: (
    userId: string,
  ) => Promise<Awaited<ReturnType<typeof settingsRepository.findAccount>>>;
  readonly deactivate: (
    userId: string,
  ) => Promise<Awaited<ReturnType<typeof settingsRepository.deactivate>>>;
}
