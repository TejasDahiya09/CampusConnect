import { prisma } from '../prisma.js';
import { buildDemoSeedPlan } from '../demo-seed/demo-seed.data.js';
import { parseDemoMediaConfiguration } from './demo-media.config.js';
import { buildDemoMediaAssets, unsupportedDemoMediaModules } from './demo-media.data.js';
import { prismaDemoMediaGateway } from './demo-media.gateway.js';
import { importDemoMedia, validateDemoMediaRecords } from './demo-media.service.js';

const arguments_ = process.argv.slice(2);
const confirmed = arguments_.includes('--confirm-demo-media');

const main = async (): Promise<void> => {
  const configuration = parseDemoMediaConfiguration(process.env);
  const assets = buildDemoMediaAssets(configuration.userIds);
  const seedPlan = buildDemoSeedPlan(configuration.userIds);
  const expectedOwners = new Map<string, string>([
    ...seedPlan.marketplace.map(({ id, sellerId }) => [id, sellerId] as const),
    ...seedPlan.lostFound.map(({ id, reporterId }) => [id, reporterId] as const),
  ]);
  const records = await prismaDemoMediaGateway.findRecords(assets);
  validateDemoMediaRecords(assets, records, expectedOwners);

  console.log('CampusConnect examiner demo media preflight');
  console.log(`Target database host: ${configuration.databaseHost}`);
  console.log(`Target S3 bucket: ${configuration.s3Bucket}`);
  console.log(`CloudFront domain: ${configuration.cloudFrontDomain}`);
  console.log(`Planned images: ${assets.length} (Marketplace 12, Lost & Found 9)`);
  console.log(`Unsupported media modules: ${unsupportedDemoMediaModules.join(', ')}`);
  for (const asset of assets)
    console.log(`${asset.module}: ${asset.recordTitle} <- ${asset.sourcePage}`);

  if (!confirmed) {
    console.log(
      'DRY RUN PASS: records, owners, marker, database, bucket, and CDN targets validated.',
    );
    console.log('No image was downloaded or uploaded and no database record was modified.');
    return;
  }
  const result = await importDemoMedia(assets, records, prismaDemoMediaGateway);
  console.log(`Demo media import complete: ${JSON.stringify(result)}`);
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
