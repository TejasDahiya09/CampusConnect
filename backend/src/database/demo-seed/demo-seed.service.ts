import {
  AccountStatus,
  Prisma,
  type PrismaClient,
  UserRole,
} from '../../generated/prisma/client.js';
import {
  DEMO_MARKER,
  type DemoSeedCounts,
  type DemoSeedPlan,
  type DemoUserCandidate,
} from './demo-seed.types.js';

export interface DemoSeedStore {
  findUsers(ids: readonly string[]): Promise<readonly DemoUserCandidate[]>;
  findExistingRecords(
    plan: DemoSeedPlan,
  ): Promise<readonly { id: string; description: string | null }[]>;
  insert(plan: DemoSeedPlan): Promise<DemoSeedCounts>;
  cleanup(plan: DemoSeedPlan): Promise<DemoSeedCounts>;
}

export const validateDemoUsers = (
  requestedIds: readonly [string, string, string],
  users: readonly DemoUserCandidate[],
): void => {
  const byId = new Map(users.map((user) => [user.id, user]));
  for (const id of requestedIds) {
    const user = byId.get(id);
    if (!user) throw new Error(`Configured demo user ${id} does not exist.`);
    if (user.status !== AccountStatus.ACTIVE)
      throw new Error(`Configured demo user ${id} is not active.`);
    if (user.role !== UserRole.STUDENT)
      throw new Error(`Configured demo user ${id} is not a student.`);
    if (!user.profile) throw new Error(`Configured demo user ${id} does not have a profile.`);
  }
};

export const assertNoDemoIdCollisions = (
  existing: readonly { id: string; description: string | null }[],
): void => {
  const collision = existing.find(({ description }) => !description?.includes(DEMO_MARKER));
  if (collision)
    throw new Error(`Demo record ID collision detected for ${collision.id}; no data was written.`);
};

export const countsForPlan = (plan: DemoSeedPlan): DemoSeedCounts => ({
  lostFound: plan.lostFound.length,
  marketplace: plan.marketplace.length,
  services: plan.services.length,
  teamUp: plan.teamUp.length,
});

export const createPrismaDemoSeedStore = (prisma: PrismaClient): DemoSeedStore => ({
  findUsers: (ids) =>
    prisma.user.findMany({
      select: { id: true, profile: { select: { fullName: true } }, role: true, status: true },
      where: { id: { in: [...ids] } },
    }),
  findExistingRecords: async (plan) => {
    const [marketplace, lostFound, teamUp, services] = await Promise.all([
      prisma.marketplace.findMany({
        select: { description: true, id: true },
        where: { id: { in: plan.marketplace.map(({ id }) => id) } },
      }),
      prisma.lostFound.findMany({
        select: { description: true, id: true },
        where: { id: { in: plan.lostFound.map(({ id }) => id) } },
      }),
      prisma.teamUp.findMany({
        select: { description: true, id: true },
        where: { id: { in: plan.teamUp.map(({ id }) => id) } },
      }),
      prisma.service.findMany({
        select: { description: true, id: true },
        where: { id: { in: plan.services.map(({ id }) => id) } },
      }),
    ]);
    return [...marketplace, ...lostFound, ...teamUp, ...services];
  },
  insert: (plan) =>
    prisma.$transaction(
      async (tx) => {
        const [marketplace, lostFound, teamUp, services] = await Promise.all([
          tx.marketplace.createMany({ data: [...plan.marketplace], skipDuplicates: true }),
          tx.lostFound.createMany({ data: [...plan.lostFound], skipDuplicates: true }),
          tx.teamUp.createMany({
            data: plan.teamUp.map((record) => ({
              ...record,
              requiredSkills: [...record.requiredSkills],
            })),
            skipDuplicates: true,
          }),
          tx.service.createMany({
            data: plan.services.map((record) => ({ ...record, skills: [...record.skills] })),
            skipDuplicates: true,
          }),
        ]);
        return {
          marketplace: marketplace.count,
          lostFound: lostFound.count,
          teamUp: teamUp.count,
          services: services.count,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  cleanup: (plan) =>
    prisma.$transaction(
      async (tx) => {
        const [marketplace, lostFound, teamUp, services] = await Promise.all([
          tx.marketplace.deleteMany({
            where: {
              id: { in: plan.marketplace.map(({ id }) => id) },
              description: { contains: DEMO_MARKER },
            },
          }),
          tx.lostFound.deleteMany({
            where: {
              id: { in: plan.lostFound.map(({ id }) => id) },
              description: { contains: DEMO_MARKER },
            },
          }),
          tx.teamUp.deleteMany({
            where: {
              id: { in: plan.teamUp.map(({ id }) => id) },
              description: { contains: DEMO_MARKER },
            },
          }),
          tx.service.deleteMany({
            where: {
              id: { in: plan.services.map(({ id }) => id) },
              description: { contains: DEMO_MARKER },
            },
          }),
        ]);
        return {
          marketplace: marketplace.count,
          lostFound: lostFound.count,
          teamUp: teamUp.count,
          services: services.count,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
});

export const prepareDemoSeed = async (store: DemoSeedStore, plan: DemoSeedPlan): Promise<void> => {
  const users = await store.findUsers(plan.userIds);
  validateDemoUsers(plan.userIds, users);
  assertNoDemoIdCollisions(await store.findExistingRecords(plan));
};
