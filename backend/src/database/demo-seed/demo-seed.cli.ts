import { prisma } from '../prisma.js';
import { parseDemoSeedConfiguration, requireWriteConfirmation } from './demo-seed.config.js';
import { buildDemoSeedPlan } from './demo-seed.data.js';
import { countsForPlan, createPrismaDemoSeedStore, prepareDemoSeed } from './demo-seed.service.js';

const arguments_ = process.argv.slice(2);
const cleanup = arguments_.includes('--cleanup');
const write = arguments_.includes('--confirm-demo-seed');

const main = async (): Promise<void> => {
  const configuration = parseDemoSeedConfiguration(process.env);
  const plan = buildDemoSeedPlan(configuration.userIds);
  const planned = countsForPlan(plan);
  console.log('CampusConnect examiner demo seed preflight');
  console.log(`Dataset: ${plan.datasetId}`);
  console.log(`Environment: ${configuration.environment}`);
  console.log(`Target database host: ${configuration.databaseHost}`);
  console.log(`Selected user IDs: ${configuration.userIds.join(', ')}`);
  console.log(`Planned records: ${JSON.stringify(planned)}`);
  console.log('Media: none (no S3 or CloudFront references will be created)');
  console.log(
    'Interactions: 3 Marketplace bookmarks, 2 Lost & Found bookmarks, 2 Service bookmarks',
  );

  const store = createPrismaDemoSeedStore(prisma);
  await prepareDemoSeed(store, plan);
  if (!write) {
    console.log(
      'DRY RUN PASS: users, ownership, database target, and deterministic IDs validated.',
    );
    console.log(
      'No database records were written. Re-run with --confirm-demo-seed after approval.',
    );
    return;
  }
  requireWriteConfirmation(arguments_);
  const result = cleanup ? await store.cleanup(plan) : await store.insert(plan);
  console.log(`${cleanup ? 'Cleanup' : 'Seed'} complete: ${JSON.stringify(result)}`);
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
