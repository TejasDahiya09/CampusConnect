import { prisma } from '../prisma.js';
import { parseDemoSeedConfiguration } from '../demo-seed/demo-seed.config.js';
import {
  createPrismaLostFoundMatchUpdateStore,
  preflightLostFoundMatchUpdate,
} from './demo-lost-found-matches.service.js';

const confirmationFlag = '--confirm-demo-lost-found-update';
const arguments_ = process.argv.slice(2);

const main = async () => {
  const configuration = parseDemoSeedConfiguration(process.env);
  const store = createPrismaLostFoundMatchUpdateStore(prisma);
  const result = await preflightLostFoundMatchUpdate(store, configuration.userIds);
  console.log('CampusConnect Lost & Found matching dataset preflight');
  console.log(`Environment: ${configuration.environment}`);
  console.log(`Target database host: ${configuration.databaseHost}`);
  console.log(`Validated records: ${result.targets.length}`);
  console.log(`Dataset state: ${result.state}`);
  console.log(
    `Image compatibility: ${result.imageCompatibility.filter(({ imageCompatibility }) => imageCompatibility === 'COMPATIBLE').length} compatible, ${result.imageCompatibility.filter(({ imageCompatibility }) => imageCompatibility === 'INCOMPATIBLE').length} requiring later reconciliation`,
  );
  if (!arguments_.includes(confirmationFlag)) {
    console.log('DRY RUN PASS: no database records were written.');
    console.log(`Re-run with ${confirmationFlag} only after explicit approval.`);
    return;
  }
  const applied = await store.apply(configuration.userIds);
  console.log(`Update complete: ${applied.updated} records updated.`);
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
