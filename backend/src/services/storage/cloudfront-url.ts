import { env } from '../../config/env.js';

export const getCloudFrontDeliveryUrl = (objectKey: string): string | null =>
  env.awsCloudFrontBaseUrl === undefined
    ? null
    : `${env.awsCloudFrontBaseUrl}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
