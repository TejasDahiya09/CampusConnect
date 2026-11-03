const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DemoSeedConfiguration {
  readonly approvedDatabaseHost: string;
  readonly databaseHost: string;
  readonly environment: 'demo';
  readonly userIds: readonly [string, string, string];
}

const required = (name: string, value: string | undefined): string => {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
};

export const parseDemoUserIds = (value: string | undefined): readonly [string, string, string] => {
  const ids = required('DEMO_USER_IDS', value)
    .split(',')
    .map((id) => id.trim());
  if (ids.length !== 3 || ids.some((id) => !uuidPattern.test(id))) {
    throw new Error('DEMO_USER_IDS must contain exactly three comma-separated UUIDs.');
  }
  if (new Set(ids).size !== 3) throw new Error('DEMO_USER_IDS must contain three distinct UUIDs.');
  return ids as [string, string, string];
};

export const parseDemoSeedConfiguration = (
  environment: NodeJS.ProcessEnv,
): DemoSeedConfiguration => {
  if (environment.NODE_ENV === 'production') {
    throw new Error('Demo seeding is disabled when NODE_ENV=production.');
  }
  if (required('DEMO_SEED_ENVIRONMENT', environment.DEMO_SEED_ENVIRONMENT) !== 'demo') {
    throw new Error('DEMO_SEED_ENVIRONMENT must be exactly "demo".');
  }
  const databaseUrl = new URL(required('DATABASE_URL', environment.DATABASE_URL));
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  }
  const approvedDatabaseHost = required(
    'DEMO_SEED_APPROVED_DATABASE_HOST',
    environment.DEMO_SEED_APPROVED_DATABASE_HOST,
  ).toLowerCase();
  const databaseHost = databaseUrl.hostname.toLowerCase();
  if (approvedDatabaseHost !== databaseHost) {
    throw new Error('DEMO_SEED_APPROVED_DATABASE_HOST does not match the DATABASE_URL host.');
  }
  return {
    approvedDatabaseHost,
    databaseHost,
    environment: 'demo',
    userIds: parseDemoUserIds(environment.DEMO_USER_IDS),
  };
};

export const requireWriteConfirmation = (arguments_: readonly string[]): void => {
  if (!arguments_.includes('--confirm-demo-seed')) {
    throw new Error('Writing demo data requires the explicit --confirm-demo-seed flag.');
  }
};
