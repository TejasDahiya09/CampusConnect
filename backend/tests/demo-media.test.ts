import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDemoMediaConfiguration } from '../src/database/demo-media/demo-media.config.js';
import {
  buildDemoMediaAssets,
  unsupportedDemoMediaModules,
} from '../src/database/demo-media/demo-media.data.js';
import {
  importDemoMedia,
  validateDemoMediaRecords,
} from '../src/database/demo-media/demo-media.service.js';
import type {
  DemoMediaAsset,
  DemoMediaGateway,
  DemoMediaRecord,
} from '../src/database/demo-media/demo-media.types.js';
import { buildDemoSeedPlan } from '../src/database/demo-seed/demo-seed.data.js';

const ids = [
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000002',
  '00000000-0000-4000-a000-000000000003',
] as const;

const fixture = () => {
  const assets = buildDemoMediaAssets(ids);
  const plan = buildDemoSeedPlan(ids);
  const owners = new Map<string, string>([
    ...plan.marketplace.map(({ id, sellerId }) => [id, sellerId] as const),
    ...plan.lostFound.map(({ id, reporterId }) => [id, reporterId] as const),
  ]);
  const records = new Map<string, DemoMediaRecord>(
    assets.map((asset) => [
      asset.recordId,
      {
        description: 'Safe demo record [campusconnect-examiner-demo-v1]',
        existingFileNames: [],
        id: asset.recordId,
        ownerId: owners.get(asset.recordId) ?? '',
        title: asset.recordTitle,
      },
    ]),
  );
  return { assets, owners, records };
};

const gateway = (overrides: Partial<DemoMediaGateway> = {}) => {
  const associated = new Set<string>();
  const deleted: string[] = [];
  const calls = { authorize: 0, complete: 0, download: 0, upload: 0 };
  const value: DemoMediaGateway = {
    authorize: (asset) => {
      calls.authorize += 1;
      return Promise.resolve({
        mediaId: 'media-id',
        objectKey: `${asset.module === 'MARKETPLACE' ? 'marketplace-pending' : 'lost-found-pending'}/owner/record/media-id.jpg`,
        requiredHeaders: {},
        uploadUrl: 'https://upload.example.test',
      });
    },
    complete: (asset) => {
      calls.complete += 1;
      associated.add(asset.fileName);
      return Promise.resolve();
    },
    deleteObject: (key) => {
      deleted.push(key);
      return Promise.resolve();
    },
    download: () => {
      calls.download += 1;
      return Promise.resolve({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
    },
    findRecords: () => Promise.resolve(new Map()),
    hasAssociation: (asset) => Promise.resolve(associated.has(asset.fileName)),
    upload: () => {
      calls.upload += 1;
      return Promise.resolve();
    },
    ...overrides,
  };
  return { associated, calls, deleted, value };
};

void describe('examiner demo media enhancement', () => {
  void it('maps one licensed, stable asset to every supported demo record', () => {
    const { assets } = fixture();
    assert.equal(assets.length, 21);
    assert.equal(assets.filter(({ module }) => module === 'MARKETPLACE').length, 12);
    assert.equal(assets.filter(({ module }) => module === 'LOST_FOUND').length, 9);
    assert.equal(new Set(assets.map(({ fileName }) => fileName)).size, 21);
    assert.ok(assets.every(({ license }) => license === 'Unsplash License'));
    assert.ok(
      assets.every(({ sourceUrl }) => sourceUrl.startsWith('https://images.unsplash.com/')),
    );
    assert.deepEqual(unsupportedDemoMediaModules, ['TEAMUP', 'SERVICES']);
  });

  void it('requires exact approved database, S3, and CloudFront targets', () => {
    const environment = {
      AWS_CLOUDFRONT_DOMAIN: 'demo.cloudfront.net',
      AWS_S3_BUCKET: 'campusconnect-demo-media',
      DATABASE_URL: 'postgresql://user:secret@db.example.test:5432/campusconnect',
      DEMO_MEDIA_APPROVED_CLOUDFRONT_DOMAIN: 'demo.cloudfront.net',
      DEMO_MEDIA_APPROVED_S3_BUCKET: 'campusconnect-demo-media',
      DEMO_SEED_APPROVED_DATABASE_HOST: 'db.example.test',
      DEMO_SEED_ENVIRONMENT: 'demo',
      DEMO_USER_IDS: ids.join(','),
      NODE_ENV: 'development',
    };
    assert.equal(parseDemoMediaConfiguration(environment).s3Bucket, 'campusconnect-demo-media');
    assert.throws(
      () => parseDemoMediaConfiguration({ ...environment, DEMO_MEDIA_APPROVED_S3_BUCKET: 'wrong' }),
      /does not match AWS_S3_BUCKET/,
    );
    assert.throws(
      () =>
        parseDemoMediaConfiguration({
          ...environment,
          DEMO_MEDIA_APPROVED_CLOUDFRONT_DOMAIN: 'wrong.cloudfront.net',
        }),
      /does not match AWS_CLOUDFRONT_DOMAIN/,
    );
  });

  void it('validates the marker, exact title, and expected owner for every record', () => {
    const { assets, owners, records } = fixture();
    assert.doesNotThrow(() => validateDemoMediaRecords(assets, records, owners));
    const first = assets[0] as DemoMediaAsset;
    const record = records.get(first.recordId) as DemoMediaRecord;
    const wrongOwner = new Map(owners).set(first.recordId, ids[2]);
    assert.throws(
      () => validateDemoMediaRecords(assets, records, wrongOwner),
      /ownership mismatch/,
    );
    const unmarked = new Map(records).set(first.recordId, {
      ...record,
      description: 'ordinary record',
    });
    assert.throws(
      () => validateDemoMediaRecords(assets, unmarked, owners),
      /not part of the approved demo dataset/,
    );
  });

  void it('does not overwrite existing media or duplicate an existing demo association', async () => {
    const { assets, records } = fixture();
    const [first, second] = assets as readonly [
      DemoMediaAsset,
      DemoMediaAsset,
      ...DemoMediaAsset[],
    ];
    const firstRecord = records.get(first.recordId) as DemoMediaRecord;
    records.set(first.recordId, { ...firstRecord, existingFileNames: ['student-photo.jpg'] });
    const mock = gateway({
      hasAssociation: (asset) => Promise.resolve(asset.fileName === second.fileName),
    });
    const result = await importDemoMedia([first, second], records, mock.value);
    assert.deepEqual(result, { attached: 0, failed: 0, preserved: 1, skippedExisting: 1 });
    assert.deepEqual(mock.calls, { authorize: 0, complete: 0, download: 0, upload: 0 });
  });

  void it('cleans only newly uploaded pending/final objects after database completion failure', async () => {
    const { assets, records } = fixture();
    const asset = assets[0] as DemoMediaAsset;
    const mock = gateway({ complete: () => Promise.reject(new Error('database unavailable')) });
    await assert.rejects(
      () => importDemoMedia([asset], records, mock.value),
      /database unavailable/,
    );
    assert.equal(mock.deleted.length, 2);
    assert.ok(mock.deleted.some((key) => key.startsWith('marketplace-pending/')));
    assert.ok(mock.deleted.some((key) => key.startsWith('marketplace/')));
  });

  void it('does not delete objects when upload itself fails', async () => {
    const { assets, records } = fixture();
    const mock = gateway({ upload: () => Promise.reject(new Error('upload failed')) });
    await assert.rejects(
      () => importDemoMedia([assets[0] as DemoMediaAsset], records, mock.value),
      /upload failed/,
    );
    assert.deepEqual(mock.deleted, []);
  });

  void it('is idempotent after a successful first import', async () => {
    const { assets, records } = fixture();
    const asset = assets[0] as DemoMediaAsset;
    const mock = gateway();
    assert.equal((await importDemoMedia([asset], records, mock.value)).attached, 1);
    assert.equal((await importDemoMedia([asset], records, mock.value)).skippedExisting, 1);
    assert.deepEqual(mock.calls, { authorize: 1, complete: 1, download: 1, upload: 1 });
  });
});
