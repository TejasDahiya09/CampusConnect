/** Local configuration check only: no network, uploads, database access or configuration writes. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { photoLocalActivation } from '../src/modules/profile/profile-photo-readiness.ts';
let file = {};
try {
  file = parse(readFileSync(resolve('.env')));
} catch {
  /* Missing .env is diagnosed below. */
}
const config = { ...file, ...process.env };
const delivery = config.AWS_CLOUDFRONT_DOMAIN;
const deliveryUrl = delivery?.includes('://')
  ? delivery
  : delivery
    ? 'https://' + delivery
    : undefined;
const result = photoLocalActivation({
  nodeEnv: config.NODE_ENV ?? 'development',
  flag: config.PROFILE_PHOTO_STORAGE_READY,
  secret: config.PROFILE_PHOTO_UPLOAD_SECRET,
  ownerId: config.PROFILE_PHOTO_LOCAL_OWNER_ID,
  region: config.AWS_REGION,
  bucket: config.AWS_S3_BUCKET,
  deliveryUrl,
  frontendUrl: config.FRONTEND_URL ?? 'http://localhost:5173',
});
let database = { classification: 'unverified' };
try {
  const target = new URL(config.DATABASE_URL ?? '');
  database = {
    classification: ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
      ? 'local'
      : 'remote',
    host: target.hostname,
    port: target.port,
    name: target.pathname.slice(1),
    project: target.username.includes('.') ? target.username.split('.').at(-1) : 'not derived',
  };
} catch {
  /* Never log a URL parser error containing connection input. */
}
let deliveryHost = null;
try {
  const url = new URL(deliveryUrl);
  if (!url.username && !url.password) deliveryHost = url.hostname;
} catch {
  /* Invalid input is never echoed. */
}
console.log(
  JSON.stringify(
    {
      mode: 'LOCAL CONFIGURATION CHECK ONLY',
      eligibleForControlledVerification: result.enabled,
      blockers: result.reasons,
      approvedOwnerId: result.ownerId,
      bucket: /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.AWS_S3_BUCKET ?? '')
        ? config.AWS_S3_BUCKET
        : null,
      region: config.AWS_REGION ?? null,
      deliveryDomain: deliveryHost,
      awsCredentialPairPresent: !!config.AWS_ACCESS_KEY_ID && !!config.AWS_SECRET_ACCESS_KEY,
      database,
      infrastructureVerified: false,
      note: 'No remote operations performed. Eligibility is not proof of storage/delivery/persistence. Enable temporarily only after exact target/account approval; permanent enablement requires real save/reload evidence.',
    },
    null,
    2,
  ),
);
process.exitCode = result.enabled ? 0 : 2;
