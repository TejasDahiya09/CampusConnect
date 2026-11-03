import { buildDemoSeedPlan } from '../demo-seed/demo-seed.data.js';
import type { DemoMediaAsset, DemoMediaModule } from './demo-media.types.js';

const photo = (id: string) => ({
  license: 'Unsplash License' as const,
  sourcePage: `https://images.unsplash.com/photo-${id}`,
  sourceUrl: `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&fm=jpg&q=82&w=1200`,
});

const marketplacePhotos = [
  photo('1587145820266-a5951ee6f620'),
  photo('1495446815901-a7297e633e8d'),
  photo('1553062407-98eeb64c6a62'),
  photo('1527814050087-3793815479db'),
  photo('1587829741301-dc798b83add3'),
  photo('1507473885765-e6ed057f782c'),
  photo('1485965120184-e220f721d03e'),
  photo('1581092160607-ee22621dd758'),
  photo('1496181133206-80ce9b88a853'),
  photo('1505740420928-5e560c06d30e'),
  photo('1527443224154-c4a3942d3acf'),
  photo('1516979187457-637abb4f9353'),
] as const;

const lostFoundPhotos = [
  photo('1606761568499-6d2451b23c66'),
  photo('1606220588913-b3aacb4d2f46'),
  photo('1587145820266-a5951ee6f620'),
  photo('1531346878377-a5be20888e57'),
  photo('1602143407151-7111542de6e8'),
  photo('1582139329536-e7284fece509'),
  photo('1618410320928-25228d811631'),
  photo('1511499767150-a48a237f0083'),
  photo('1553062407-98eeb64c6a62'),
] as const;

const assets = (
  module: DemoMediaModule,
  records: readonly { id: string; title: string }[],
  photos: readonly ReturnType<typeof photo>[],
): DemoMediaAsset[] =>
  records.map((record, index) => {
    const source = photos[index];
    if (!source) throw new Error(`Missing demo image source for ${record.title}.`);
    return {
      ...source,
      fileName: `campusconnect-demo-${module.toLowerCase().replace('_', '-')}-${index + 1}.jpg`,
      module,
      recordId: record.id,
      recordTitle: record.title,
    };
  });

export const buildDemoMediaAssets = (
  userIds: readonly [string, string, string],
): readonly DemoMediaAsset[] => {
  const plan = buildDemoSeedPlan(userIds);
  return [
    ...assets('MARKETPLACE', plan.marketplace, marketplacePhotos),
    ...assets('LOST_FOUND', plan.lostFound, lostFoundPhotos),
  ];
};

export const unsupportedDemoMediaModules = ['TEAMUP', 'SERVICES'] as const;
