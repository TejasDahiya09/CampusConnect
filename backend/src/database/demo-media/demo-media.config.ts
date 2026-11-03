import {
  parseDemoSeedConfiguration,
  type DemoSeedConfiguration,
} from '../demo-seed/demo-seed.config.js';

export interface DemoMediaConfiguration extends DemoSeedConfiguration {
  readonly cloudFrontDomain: string;
  readonly s3Bucket: string;
}

const required = (name: string, value: string | undefined): string => {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
};

const domain = (value: string): string => {
  const normalized = value.includes('://') ? value : `https://${value}`;
  const url = new URL(normalized);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('AWS_CLOUDFRONT_DOMAIN must be an HTTPS domain without a path.');
  }
  return url.hostname.toLowerCase();
};

export const parseDemoMediaConfiguration = (
  environment: NodeJS.ProcessEnv,
): DemoMediaConfiguration => {
  const seed = parseDemoSeedConfiguration(environment);
  const s3Bucket = required('AWS_S3_BUCKET', environment.AWS_S3_BUCKET);
  const approvedBucket = required(
    'DEMO_MEDIA_APPROVED_S3_BUCKET',
    environment.DEMO_MEDIA_APPROVED_S3_BUCKET,
  );
  if (s3Bucket !== approvedBucket)
    throw new Error('DEMO_MEDIA_APPROVED_S3_BUCKET does not match AWS_S3_BUCKET.');
  const cloudFrontDomain = domain(
    required('AWS_CLOUDFRONT_DOMAIN', environment.AWS_CLOUDFRONT_DOMAIN),
  );
  const approvedDomain = domain(
    required(
      'DEMO_MEDIA_APPROVED_CLOUDFRONT_DOMAIN',
      environment.DEMO_MEDIA_APPROVED_CLOUDFRONT_DOMAIN,
    ),
  );
  if (cloudFrontDomain !== approvedDomain) {
    throw new Error('DEMO_MEDIA_APPROVED_CLOUDFRONT_DOMAIN does not match AWS_CLOUDFRONT_DOMAIN.');
  }
  return { ...seed, cloudFrontDomain, s3Bucket };
};
