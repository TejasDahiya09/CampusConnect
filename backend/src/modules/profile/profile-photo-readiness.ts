export interface PhotoActivationConfig {
  nodeEnv?: string | undefined;
  flag?: string | undefined;
  secret?: string | undefined;
  ownerId?: string | undefined;
  region?: string | undefined;
  bucket?: string | undefined;
  deliveryUrl?: string | undefined;
  frontendUrl?: string | undefined;
}
export const isPhotoLoopback = (address: string | undefined) =>
  address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';

/** Configuration/authorization guard only. Does NOT verify S3, delivery or database permissions. */
export function photoLocalActivation(config: PhotoActivationConfig) {
  const reasons: string[] = [];
  if (config.nodeEnv !== 'development') reasons.push('LOCAL_DEVELOPMENT_REQUIRED');
  if (config.flag !== 'true') reasons.push('PHOTO_FLAG_DISABLED');
  if (!config.secret || config.secret.length < 32) reasons.push('UPLOAD_SECRET_REQUIRED');
  const ownerId = config.ownerId?.trim().toLowerCase();
  const validOwner =
    !!ownerId &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(ownerId);
  if (!validOwner) reasons.push('APPROVED_DEVELOPMENT_OWNER_REQUIRED');
  if (!config.region || !config.bucket || !config.deliveryUrl)
    reasons.push('STORAGE_CONFIGURATION_REQUIRED');
  else {
    try {
      const delivery = new URL(config.deliveryUrl);
      if (
        delivery.protocol !== 'https:' ||
        delivery.username ||
        delivery.password ||
        delivery.pathname !== '/' ||
        delivery.search ||
        delivery.hash ||
        !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket) ||
        !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(config.region)
      )
        reasons.push('STORAGE_CONFIGURATION_INVALID');
    } catch {
      reasons.push('STORAGE_CONFIGURATION_INVALID');
    }
  }
  try {
    const frontend = new URL(config.frontendUrl ?? '');
    if (
      !['http:', 'https:'].includes(frontend.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(frontend.hostname) ||
      frontend.username ||
      frontend.password
    )
      reasons.push('LOOPBACK_FRONTEND_REQUIRED');
  } catch {
    reasons.push('LOOPBACK_FRONTEND_REQUIRED');
  }
  return { enabled: reasons.length === 0, ownerId: validOwner ? ownerId : null, reasons };
}
