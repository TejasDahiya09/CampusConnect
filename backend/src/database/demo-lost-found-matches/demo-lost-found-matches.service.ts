import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { buildDemoSeedPlan } from '../demo-seed/demo-seed.data.js';
import { DEMO_MARKER } from '../demo-seed/demo-seed.types.js';
import { buildLostFoundMatchTargets } from './demo-lost-found-matches.data.js';

type DemoRecord = {
  readonly category: string | null;
  readonly description: string;
  readonly id: string;
  readonly images: unknown;
  readonly incidentDate: Date | null;
  readonly location: string | null;
  readonly reporterId: string;
  readonly status: string;
  readonly title: string;
  readonly type: string;
};

export interface LostFoundMatchUpdateStore {
  readonly apply: (
    userIds: readonly [string, string, string],
  ) => Promise<{ readonly updated: number }>;
  readonly countMarked: () => Promise<number>;
  readonly findTargets: (ids: readonly string[]) => Promise<readonly DemoRecord[]>;
}

const comparable = (record: Omit<DemoRecord, 'images'>) => ({
  category: record.category,
  description: record.description,
  id: record.id,
  incidentDate: record.incidentDate?.toISOString().slice(0, 10) ?? null,
  location: record.location,
  reporterId: record.reporterId,
  status: record.status,
  title: record.title,
  type: record.type,
});

const stateOf = (
  records: readonly DemoRecord[],
  userIds: readonly [string, string, string],
): 'CURRENT' | 'TARGET' => {
  const original = buildDemoSeedPlan(userIds).lostFound;
  const targets = buildLostFoundMatchTargets(userIds);
  const byId = new Map(records.map((record) => [record.id, record]));
  const matches = (expected: readonly Omit<DemoRecord, 'images'>[]) =>
    expected.every((item) => {
      const actual = byId.get(item.id);
      return (
        actual !== undefined &&
        JSON.stringify(comparable(actual)) === JSON.stringify(comparable(item))
      );
    });
  if (matches(original)) return 'CURRENT';
  if (matches(targets.map((target) => ({ ...target, status: 'OPEN' })))) return 'TARGET';
  throw new Error(
    'Demo Lost & Found records no longer match the approved current or target dataset.',
  );
};

export const preflightLostFoundMatchUpdate = async (
  store: LostFoundMatchUpdateStore,
  userIds: readonly [string, string, string],
) => {
  const targets = buildLostFoundMatchTargets(userIds);
  if (targets.length !== 9 || new Set(targets.map(({ id }) => id)).size !== 9) {
    throw new Error('The Lost & Found matching update must target exactly nine unique reports.');
  }
  const [markedCount, records] = await Promise.all([
    store.countMarked(),
    store.findTargets(targets.map(({ id }) => id)),
  ]);
  return validateLostFoundMatchUpdate(records, markedCount, userIds);
};

export const validateLostFoundMatchUpdate = (
  records: readonly DemoRecord[],
  markedCount: number,
  userIds: readonly [string, string, string],
) => {
  const targets = buildLostFoundMatchTargets(userIds);
  if (targets.length !== 9 || new Set(targets.map(({ id }) => id)).size !== 9) {
    throw new Error('The Lost & Found matching update must target exactly nine unique reports.');
  }
  if (markedCount !== 9 || records.length !== 9) {
    throw new Error('Expected exactly nine marked Lost & Found demo records.');
  }
  if (records.some(({ description }) => !description.includes(DEMO_MARKER))) {
    throw new Error('Every target must retain the examiner demo marker.');
  }
  return {
    imageCompatibility: targets.map(({ id, imageCompatibility, title }) => ({
      id,
      imageCompatibility,
      title,
    })),
    state: stateOf(records, userIds),
    targets,
  } as const;
};

const select = {
  category: true,
  description: true,
  id: true,
  images: true,
  incidentDate: true,
  location: true,
  reporterId: true,
  status: true,
  title: true,
  type: true,
} as const;

export const createPrismaLostFoundMatchUpdateStore = (
  prisma: PrismaClient,
): LostFoundMatchUpdateStore => ({
  countMarked: () => prisma.lostFound.count({ where: { description: { contains: DEMO_MARKER } } }),
  findTargets: (ids) => prisma.lostFound.findMany({ select, where: { id: { in: [...ids] } } }),
  apply: (userIds) =>
    prisma.$transaction(
      async (transaction) => {
        const targets = buildLostFoundMatchTargets(userIds);
        const [markedCount, records] = await Promise.all([
          transaction.lostFound.count({ where: { description: { contains: DEMO_MARKER } } }),
          transaction.lostFound.findMany({
            select,
            where: { id: { in: targets.map(({ id }) => id) } },
          }),
        ]);
        const preflight = validateLostFoundMatchUpdate(records, markedCount, userIds);
        if (preflight.state === 'TARGET') return { updated: 0 };
        let updated = 0;
        for (const target of preflight.targets) {
          const result = await transaction.lostFound.updateMany({
            data: {
              category: target.category,
              description: target.description,
              incidentDate: target.incidentDate,
              location: target.location,
              title: target.title,
              type: target.type,
            },
            where: { id: target.id, reporterId: target.reporterId },
          });
          updated += result.count;
        }
        if (updated !== 9) throw new Error('The transaction did not update exactly nine reports.');
        return { updated };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
});
