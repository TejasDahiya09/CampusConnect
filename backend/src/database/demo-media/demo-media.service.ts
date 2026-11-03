import { DEMO_MARKER } from '../demo-seed/demo-seed.types.js';
import type {
  DemoMediaAsset,
  DemoMediaGateway,
  DemoMediaRecord,
  DemoMediaResult,
} from './demo-media.types.js';

const finalKey = (pendingKey: string): string =>
  pendingKey
    .replace(/^marketplace-pending\//, 'marketplace/')
    .replace(/^lost-found-pending\//, 'lost-found/');

export const validateDemoMediaRecords = (
  assets: readonly DemoMediaAsset[],
  records: ReadonlyMap<string, DemoMediaRecord>,
  expectedOwners: ReadonlyMap<string, string>,
): void => {
  for (const asset of assets) {
    const record = records.get(asset.recordId);
    if (!record) throw new Error(`Expected demo record ${asset.recordId} was not found.`);
    if (!record.description.includes(DEMO_MARKER))
      throw new Error(`Record ${asset.recordId} is not part of the approved demo dataset.`);
    if (record.title !== asset.recordTitle)
      throw new Error(`Demo record title mismatch for ${asset.recordId}.`);
    if (record.ownerId !== expectedOwners.get(asset.recordId))
      throw new Error(`Demo record ownership mismatch for ${asset.recordId}.`);
  }
};

export const importDemoMedia = async (
  assets: readonly DemoMediaAsset[],
  records: ReadonlyMap<string, DemoMediaRecord>,
  gateway: DemoMediaGateway,
): Promise<DemoMediaResult> => {
  let attached = 0;
  let preserved = 0;
  let skippedExisting = 0;
  for (const asset of assets) {
    const record = records.get(asset.recordId);
    if (!record) throw new Error(`Expected demo record ${asset.recordId} was not found.`);
    if (
      record.existingFileNames.includes(asset.fileName) ||
      (await gateway.hasAssociation(asset))
    ) {
      skippedExisting += 1;
      continue;
    }
    if (record.existingFileNames.length > 0) {
      preserved += 1;
      continue;
    }
    const file = await gateway.download(asset);
    const authorization = await gateway.authorize(asset, record.ownerId, file);
    let uploaded = false;
    try {
      await gateway.upload(authorization, file);
      uploaded = true;
      await gateway.complete(asset, record.ownerId, authorization);
      attached += 1;
    } catch (error) {
      if (uploaded && !(await gateway.hasAssociation(asset))) {
        await Promise.allSettled([
          gateway.deleteObject(authorization.objectKey),
          gateway.deleteObject(finalKey(authorization.objectKey)),
        ]);
      }
      throw error;
    }
  }
  return { attached, failed: 0, preserved, skippedExisting };
};
